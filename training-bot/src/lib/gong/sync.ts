import { db } from "@/lib/db";
import { chunkText } from "@/lib/documents/parser";
import {
  listCalls,
  getCallsByIds,
  getTranscripts,
  formatTranscript,
  type GongCallMeta,
  type GongCallTranscript,
} from "@/lib/gong/client";
import type { CallType } from "@/generated/prisma/enums";

/**
 * Classify a call as DISCOVERY or DEMO from its title and transcript.
 * Title signals are weighted heavily; transcript keyword counts break ties.
 */
type AECallType = Extract<CallType, "DISCOVERY" | "DEMO">;

export function classifyCall(
  title: string | null | undefined,
  transcript: string
): { callType: AECallType; confidence: "high" | "medium" | "low" } {
  const t = (title || "").toLowerCase();

  const demoTitle = /\b(demo|demonstration|walk\s?through|platform\s+review|product\s+review|deep\s?dive)\b/;
  const discoTitle = /\b(discovery|disco|intro|introductory|qualification|first\s+call|exploratory|scoping)\b/;

  if (demoTitle.test(t) && !discoTitle.test(t)) {
    return { callType: "DEMO", confidence: "high" };
  }
  if (discoTitle.test(t) && !demoTitle.test(t)) {
    return { callType: "DISCOVERY", confidence: "high" };
  }

  // Fall back to transcript content signals.
  const body = transcript.toLowerCase();
  const demoSignals = [
    "share my screen",
    "sharing my screen",
    "let me pull up",
    "as you can see here",
    "on this screen",
    "click into",
    "this dashboard",
    "let me show you",
    "walk you through the platform",
  ];
  const discoSignals = [
    "tell me about",
    "what does your",
    "how do you currently",
    "what's your process",
    "walk me through how you",
    "what are your goals",
    "biggest challenge",
    "how many locations",
    "what tools are you using",
  ];

  const demoScore = demoSignals.reduce(
    (n, s) => n + (body.includes(s) ? 1 : 0),
    0
  );
  const discoScore = discoSignals.reduce(
    (n, s) => n + (body.includes(s) ? 1 : 0),
    0
  );

  if (demoScore > discoScore)
    return { callType: "DEMO", confidence: demoScore >= 3 ? "medium" : "low" };
  if (discoScore > demoScore)
    return {
      callType: "DISCOVERY",
      confidence: discoScore >= 3 ? "medium" : "low",
    };

  // Default: discovery (the earlier-stage, more common call).
  return { callType: "DISCOVERY", confidence: "low" };
}

interface SyncOptions {
  /** ISO-8601 start; defaults to 90 days ago. */
  fromDateTime?: string;
  /** ISO-8601 end; defaults to now. */
  toDateTime?: string;
  /** Max calls to pull in one run. */
  maxCalls?: number;
}

interface SyncResult {
  callsFound: number;
  callsImported: number;
  callsSkipped: number;
  errors: number;
  byType: { DISCOVERY: number; DEMO: number };
  details: Array<{ gongCallId: string; title: string | null; callType?: CallType; status: string }>;
}

/**
 * Pull recent Gong calls, classify them, and store each as a GongCall plus a
 * KnowledgeDocument (sourceType GONG_CALL) with chunks. These chunks feed both
 * the AE roleplay prospect behavior and the scoring benchmark via the existing
 * knowledge retrieval pipeline (tagged by call type).
 */
export async function syncGongCalls(opts: SyncOptions = {}): Promise<SyncResult> {
  const toDateTime = opts.toDateTime || new Date().toISOString();
  const fromDateTime =
    opts.fromDateTime ||
    new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const maxCalls = opts.maxCalls ?? 50;

  const result: SyncResult = {
    callsFound: 0,
    callsImported: 0,
    callsSkipped: 0,
    errors: 0,
    byType: { DISCOVERY: 0, DEMO: 0 },
    details: [],
  };

  const calls = await listCalls(fromDateTime, toDateTime, maxCalls);
  result.callsFound = calls.length;

  if (calls.length === 0) return await logSync(result);

  const callIds = calls.map((c) => c.metaData.id);
  const transcripts = await getTranscripts(callIds);
  const transcriptMap = new Map(transcripts.map((t) => [t.callId, t]));

  for (const call of calls) {
    await importOneCall(call, transcriptMap.get(call.metaData.id), result);
  }

  return await logSync(result);
}

/**
 * Import a single Gong call (metadata + transcript payload) into the DB.
 * Mutates the provided result tally. Reused by full sync and by-ID import.
 */
async function importOneCall(
  call: GongCallMeta,
  transcriptPayload: GongCallTranscript | undefined,
  result: SyncResult
): Promise<void> {
  const gongCallId = call.metaData.id;
  const title = call.metaData.title ?? null;
  try {
    const existing = await db.gongCall.findUnique({ where: { gongCallId } });
    if (existing) {
      result.callsSkipped++;
      result.details.push({ gongCallId, title, status: "skipped (already imported)" });
      return;
    }

    const transcriptText = transcriptPayload
      ? formatTranscript(transcriptPayload, call.parties)
      : "";

    if (!transcriptText || transcriptText.length < 50) {
      await db.gongCall.create({
        data: {
          gongCallId,
          title,
          url: call.metaData.url ?? null,
          durationSec: call.metaData.duration ?? null,
          callDate: call.metaData.started ? new Date(call.metaData.started) : null,
          participantsJson: serializeParties(call.parties),
          transcriptStatus: "MISSING",
          rawJson: call as unknown as object,
          syncError: "No transcript available",
        },
      });
      result.callsSkipped++;
      result.details.push({ gongCallId, title, status: "skipped (no transcript)" });
      return;
    }

    const { callType, confidence } = classifyCall(title, transcriptText);

    await storeTranscript({
      gongCallId,
      title,
      url: call.metaData.url ?? null,
      callType,
      confidence,
      durationSec: call.metaData.duration ?? null,
      callDate: call.metaData.started ? new Date(call.metaData.started) : null,
      participants: serializeParties(call.parties),
      transcriptText,
      rawJson: call as unknown as object,
    });

    result.callsImported++;
    result.byType[callType]++;
    result.details.push({ gongCallId, title, callType, status: "imported" });
  } catch (err) {
    result.errors++;
    result.details.push({
      gongCallId,
      title,
      status: `error: ${err instanceof Error ? err.message : "unknown"}`,
    });
  }
}

interface StoreArgs {
  gongCallId: string;
  title: string | null;
  url: string | null;
  callType: AECallType;
  confidence: string;
  durationSec: number | null;
  callDate: Date | null;
  participants: ReturnType<typeof serializeParties>;
  transcriptText: string;
  rawJson?: object;
}

/** Persist a GongCall + its KnowledgeDocument + chunks. */
async function storeTranscript(args: StoreArgs) {
  const gongCall = await db.gongCall.create({
    data: {
      gongCallId: args.gongCallId,
      title: args.title,
      url: args.url,
      callType: args.callType,
      callTypeConfidence: args.confidence,
      durationSec: args.durationSec,
      callDate: args.callDate,
      participantsJson: args.participants,
      transcript: args.transcriptText,
      transcriptStatus: "AVAILABLE",
      rawJson: args.rawJson ?? undefined,
    },
  });

  const typeTag = args.callType.toLowerCase();
  const doc = await db.knowledgeDocument.create({
    data: {
      sourceType: "GONG_CALL",
      title: args.title || `Gong ${args.callType} call`,
      content: args.transcriptText,
      tags: ["gong", "ae", typeTag],
      gongCallId: gongCall.id,
      metadataJson: {
        gongCallId: args.gongCallId,
        callType: args.callType,
        confidence: args.confidence,
        url: args.url,
        callDate: args.callDate?.toISOString() ?? null,
      },
    },
  });

  const chunks = chunkText(args.transcriptText, 1200, 200);
  for (const content of chunks) {
    await db.knowledgeChunk.create({
      data: { documentId: doc.id, content, tags: ["gong", "ae", typeTag] },
    });
  }
  return gongCall;
}

function newResult(): SyncResult {
  return {
    callsFound: 0,
    callsImported: 0,
    callsSkipped: 0,
    errors: 0,
    byType: { DISCOVERY: 0, DEMO: 0 },
    details: [],
  };
}

/**
 * Import specific Gong calls by their call IDs (e.g. parsed from pasted call
 * links). Pulls metadata + transcript via the API, then imports each.
 */
export async function importGongCallsByIds(callIds: string[]): Promise<SyncResult> {
  const result = newResult();
  const unique = Array.from(new Set(callIds.filter(Boolean)));
  if (unique.length === 0) return result;

  const calls = await getCallsByIds(unique);
  result.callsFound = calls.length;

  // Report IDs the API didn't return at all.
  const returned = new Set(calls.map((c) => c.metaData.id));
  for (const id of unique) {
    if (!returned.has(id)) {
      result.errors++;
      result.details.push({
        gongCallId: id,
        title: null,
        status: "not found in Gong (check the link/ID and your access)",
      });
    }
  }

  if (calls.length === 0) return await logSync(result);

  const transcripts = await getTranscripts(calls.map((c) => c.metaData.id));
  const transcriptMap = new Map(transcripts.map((t) => [t.callId, t]));

  for (const call of calls) {
    await importOneCall(call, transcriptMap.get(call.metaData.id), result);
  }

  return await logSync(result);
}

/**
 * Import a transcript pasted or uploaded directly (no Gong API). Used for the
 * drag-and-drop / paste box on the Gong page.
 */
export async function importManualTranscript(args: {
  transcript: string;
  title?: string | null;
  callType?: AECallType;
}): Promise<SyncResult> {
  const result = newResult();
  const transcriptText = args.transcript.trim();

  if (transcriptText.length < 50) {
    result.errors++;
    result.details.push({
      gongCallId: "manual",
      title: args.title ?? null,
      status: "transcript too short",
    });
    return result;
  }

  const auto = classifyCall(args.title, transcriptText);
  const callType = args.callType || auto.callType;
  const gongCallId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    await storeTranscript({
      gongCallId,
      title: args.title || `Pasted ${callType} transcript`,
      url: null,
      callType,
      confidence: args.callType ? "manual" : auto.confidence,
      durationSec: null,
      callDate: new Date(),
      participants: [],
      transcriptText,
    });
    result.callsFound = 1;
    result.callsImported = 1;
    result.byType[callType]++;
    result.details.push({ gongCallId, title: args.title ?? null, callType, status: "imported" });
  } catch (err) {
    result.errors++;
    result.details.push({
      gongCallId,
      title: args.title ?? null,
      status: `error: ${err instanceof Error ? err.message : "unknown"}`,
    });
  }

  return await logSync(result);
}

function serializeParties(parties: GongCallMeta["parties"]) {
  return parties.map((p) => ({
    name: p.name ?? null,
    title: p.title ?? null,
    affiliation: p.affiliation ?? null,
    email: p.emailAddress ?? null,
  }));
}

async function logSync(result: SyncResult): Promise<SyncResult> {
  try {
    await db.syncLog.create({
      data: {
        type: "GONG",
        status: result.errors > 0 ? "completed_with_errors" : "completed",
        callsFound: result.callsFound,
        callsImported: result.callsImported,
        callsSkipped: result.callsSkipped,
        errors: result.errors,
        details: { byType: result.byType, items: result.details.slice(0, 100) },
      },
    });
  } catch {
    /* logging is best-effort */
  }
  return result;
}
