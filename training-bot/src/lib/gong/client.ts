import { z } from "zod";
import { readFileSync } from "fs";
import { resolve } from "path";

const GONG_API_BASE = "https://api.gong.io";
const MAX_RETRIES = 3;
const RATE_LIMIT_DELAY = 400;

let lastRequestTime = 0;

// Read credentials directly from .env as a fallback, since the shell
// environment can shadow .env values (see src/lib/ai/provider.ts).
function readEnvKey(key: string): string {
  const val = process.env[key];
  if (val && val.length > 3) return val;
  try {
    const envPath = resolve(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"));
    if (match) return match[1];
  } catch {
    /* ignore */
  }
  return val || "";
}

function getAuthHeader(): string {
  const accessKey = readEnvKey("GONG_ACCESS_KEY");
  const secret = readEnvKey("GONG_ACCESS_KEY_SECRET");
  if (!accessKey || !secret) {
    throw new Error(
      "GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET must be set in .env"
    );
  }
  const token = Buffer.from(`${accessKey}:${secret}`).toString("base64");
  return `Basic ${token}`;
}

export function isGongConfigured(): boolean {
  return !!readEnvKey("GONG_ACCESS_KEY") && !!readEnvKey("GONG_ACCESS_KEY_SECRET");
}

interface GongRequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string>;
}

async function rateLimit() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY - elapsed));
  }
  lastRequestTime = Date.now();
}

async function request<T>(
  path: string,
  options: GongRequestOptions = {}
): Promise<T> {
  const { method = "GET", body, params } = options;

  let url = `${GONG_API_BASE}${path}`;
  if (params) {
    url += `?${new URLSearchParams(params).toString()}`;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await rateLimit();
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: getAuthHeader(),
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("Retry-After") || "2", 10);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        continue;
      }

      if (res.status >= 500 && attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`Gong API error ${res.status}: ${errorBody.slice(0, 500)}`);
      }

      return (await res.json()) as T;
    } catch (error) {
      lastError = error as Error;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw lastError ?? new Error("Gong request failed");
}

// --- Call metadata (extensive) ---

const PartySchema = z.object({
  id: z.string().optional().nullable(),
  speakerId: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  emailAddress: z.string().optional().nullable(),
  affiliation: z.string().optional().nullable(), // "Internal" | "External" | "Unknown"
  title: z.string().optional().nullable(),
});

const CallMetaSchema = z.object({
  metaData: z.object({
    id: z.string(),
    title: z.string().optional().nullable(),
    started: z.string().optional().nullable(),
    duration: z.number().optional().nullable(),
    url: z.string().optional().nullable(),
    direction: z.string().optional().nullable(),
  }),
  parties: z.array(PartySchema).optional().default([]),
});

export type GongCallMeta = z.infer<typeof CallMetaSchema>;

interface ExtensiveResponse {
  calls: unknown[];
  records?: { cursor?: string };
}

/**
 * List calls in a date range with metadata + parties. Handles cursor pagination.
 * Dates are ISO-8601 strings (e.g. "2026-01-01T00:00:00Z").
 */
export async function listCalls(
  fromDateTime: string,
  toDateTime: string,
  maxCalls = 100
): Promise<GongCallMeta[]> {
  const collected: GongCallMeta[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filter: { fromDateTime, toDateTime },
      contentSelector: { exposedFields: { parties: true } },
    };
    if (cursor) body.cursor = cursor;

    const data = await request<ExtensiveResponse>("/v2/calls/extensive", {
      method: "POST",
      body,
    });

    for (const raw of data.calls ?? []) {
      const parsed = CallMetaSchema.safeParse(raw);
      if (parsed.success) collected.push(parsed.data);
      if (collected.length >= maxCalls) break;
    }

    cursor = collected.length >= maxCalls ? undefined : data.records?.cursor;
  } while (cursor);

  return collected;
}

/**
 * Fetch specific calls by their Gong call IDs (with parties), handling cursor
 * pagination. Used to import individual calls from pasted links.
 */
export async function getCallsByIds(callIds: string[]): Promise<GongCallMeta[]> {
  if (callIds.length === 0) return [];
  const collected: GongCallMeta[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filter: { callIds },
      contentSelector: { exposedFields: { parties: true } },
    };
    if (cursor) body.cursor = cursor;

    const data = await request<ExtensiveResponse>("/v2/calls/extensive", {
      method: "POST",
      body,
    });

    for (const raw of data.calls ?? []) {
      const parsed = CallMetaSchema.safeParse(raw);
      if (parsed.success) collected.push(parsed.data);
    }

    cursor = data.records?.cursor;
  } while (cursor);

  return collected;
}

/**
 * Extract a Gong call ID from a pasted call URL or raw ID. Gong call URLs look
 * like https://<region>.app.gong.io/call?id=7894572938745 or
 * https://app.gong.io/calls/7894572938745.
 */
export function parseGongCallId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Bare numeric ID.
  if (/^\d{5,}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const idParam =
      url.searchParams.get("id") ||
      url.searchParams.get("callId") ||
      url.searchParams.get("call-id");
    if (idParam && /^\d+$/.test(idParam)) return idParam;

    const pathMatch = url.pathname.match(/(?:call|calls)\/(\d+)/i);
    if (pathMatch) return pathMatch[1];

    const lastSeg = url.pathname.split("/").filter(Boolean).pop();
    if (lastSeg && /^\d+$/.test(lastSeg)) return lastSeg;
  } catch {
    // Not a URL — fall through to a loose digit match.
  }

  const loose = trimmed.match(/(\d{8,})/);
  return loose ? loose[1] : null;
}

// --- Transcripts ---

const TranscriptSentenceSchema = z.object({
  start: z.number().optional().nullable(),
  end: z.number().optional().nullable(),
  text: z.string(),
});

const TranscriptMonologueSchema = z.object({
  speakerId: z.string().optional().nullable(),
  topic: z.string().optional().nullable(),
  sentences: z.array(TranscriptSentenceSchema).default([]),
});

const CallTranscriptSchema = z.object({
  callId: z.string(),
  transcript: z.array(TranscriptMonologueSchema).default([]),
});

export type GongCallTranscript = z.infer<typeof CallTranscriptSchema>;

/**
 * Fetch transcripts for a set of call IDs.
 */
export async function getTranscripts(
  callIds: string[]
): Promise<GongCallTranscript[]> {
  if (callIds.length === 0) return [];

  const collected: GongCallTranscript[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      filter: { callIds },
    };
    if (cursor) body.cursor = cursor;

    const data = await request<{
      callTranscripts: unknown[];
      records?: { cursor?: string };
    }>("/v2/calls/transcript", { method: "POST", body });

    for (const raw of data.callTranscripts ?? []) {
      const parsed = CallTranscriptSchema.safeParse(raw);
      if (parsed.success) collected.push(parsed.data);
    }

    cursor = data.records?.cursor;
  } while (cursor);

  return collected;
}

/**
 * Build a clean, speaker-labeled transcript string from a Gong transcript
 * payload using the call's parties to resolve speaker names + roles.
 */
export function formatTranscript(
  transcript: GongCallTranscript,
  parties: GongCallMeta["parties"]
): string {
  const speakerMap = new Map<
    string,
    { label: string; isRep: boolean }
  >();
  for (const p of parties) {
    const key = p.speakerId || p.id || "";
    if (!key) continue;
    const isRep = (p.affiliation || "").toLowerCase() === "internal";
    const name = p.name || (isRep ? "Sales Rep" : "Prospect");
    const titleSuffix = p.title ? ` (${p.title})` : "";
    speakerMap.set(key, {
      label: isRep ? `REP – ${name}` : `PROSPECT – ${name}${titleSuffix}`,
      isRep,
    });
  }

  const lines: string[] = [];
  for (const mono of transcript.transcript) {
    const speaker =
      (mono.speakerId && speakerMap.get(mono.speakerId)) || {
        label: "SPEAKER",
        isRep: false,
      };
    const text = mono.sentences.map((s) => s.text).join(" ").trim();
    if (text) lines.push(`${speaker.label}: ${text}`);
  }

  return lines.join("\n\n");
}
