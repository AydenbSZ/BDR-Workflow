import { db } from "@/lib/db";
import { chunkText } from "@/lib/documents/parser";
import {
  getCall,
  getTranscript,
  getAssociations,
  getContact,
  getCompany,
} from "@/lib/hubspot/client";

export interface HubSpotImportResult {
  found: number;
  imported: number;
  skipped: number;
  errors: number;
  details: Array<{ id: string; title: string | null; status: string }>;
}

function newResult(): HubSpotImportResult {
  return { found: 0, imported: 0, skipped: 0, errors: 0, details: [] };
}

/**
 * Persist a transcript/notes blob as a HubSpot-sourced KnowledgeDocument plus
 * chunks, tagged so it feeds cold-call training and shows as a benchmark.
 */
async function storeHubSpotDoc(args: {
  title: string;
  content: string;
  outcome?: string | null;
  callId?: string | null;
  extraTags?: string[];
}) {
  const tags = ["hubspot", "cold_call", ...(args.extraTags || [])];
  const doc = await db.knowledgeDocument.create({
    data: {
      sourceType: "HUBSPOT_CALL",
      title: args.title,
      content: args.content,
      tags,
      metadataJson: {
        source: "hubspot",
        outcome: args.outcome ?? null,
        hubspotCallId: args.callId ?? null,
      },
    },
  });
  const chunks = chunkText(args.content, 1200, 200);
  for (const content of chunks) {
    await db.knowledgeChunk.create({ data: { documentId: doc.id, content, tags } });
  }
  return doc;
}

/**
 * Import specific HubSpot calls by ID (parsed from pasted record links). Pulls
 * the call body/transcript + associated contact/company via the API, stores a
 * HubSpotCall row and a KnowledgeDocument. Requires the calls read scope.
 */
export async function importHubSpotCallsByIds(
  ids: string[]
): Promise<HubSpotImportResult> {
  const result = newResult();
  const unique = Array.from(new Set(ids.filter(Boolean)));

  for (const id of unique) {
    try {
      const existing = await db.hubSpotCall.findUnique({
        where: { hubspotCallId: id },
      });
      if (existing) {
        result.skipped++;
        result.details.push({ id, title: existing.title, status: "already imported" });
        continue;
      }

      const call = await getCall(id);
      result.found++;
      const props = call.properties;
      const title = props.hs_call_title || `HubSpot call ${id}`;

      // Prefer the word-for-word transcript; fall back to the logged call body.
      let transcriptText = "";
      const transcriptId = props.hs_call_transcription_id;
      if (transcriptId) {
        try {
          const utterances = await getTranscript(transcriptId);
          transcriptText = utterances
            .map((u) => `${u.speakerName || "Speaker"}: ${u.text}`)
            .join("\n");
        } catch {
          /* transcript scope may be unavailable; fall back to body */
        }
      }
      const body = transcriptText || props.hs_call_body || "";

      // Enrich with contact / company (best-effort).
      let contactLine = "";
      let companyLine = "";
      try {
        const contacts = await getAssociations(id, "contacts");
        if (contacts.length) {
          const c = await getContact(contacts[0].id);
          const name = [c.properties.firstname, c.properties.lastname]
            .filter(Boolean)
            .join(" ");
          contactLine = [name, c.properties.jobtitle].filter(Boolean).join(", ");
        }
        const companies = await getAssociations(id, "companies");
        if (companies.length) {
          const co = await getCompany(companies[0].id);
          companyLine = co.properties.name || "";
        }
      } catch {
        /* association scopes optional */
      }

      const outcome = props.hs_call_disposition || null;
      const header = [
        `Title: ${title}`,
        contactLine ? `Contact: ${contactLine}` : "",
        companyLine ? `Company: ${companyLine}` : "",
        outcome ? `Outcome: ${outcome}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const content = `${header}\n\n${body}`.trim();

      if (content.length < 30) {
        result.skipped++;
        result.details.push({ id, title, status: "no usable content" });
        continue;
      }

      await db.hubSpotCall.create({
        data: {
          hubspotCallId: id,
          title,
          body,
          outcomeId: outcome,
          durationMs: props.hs_call_duration
            ? parseInt(props.hs_call_duration, 10)
            : null,
          recordingUrl: props.hs_call_recording_url || null,
          transcriptStatus: transcriptText ? "AVAILABLE" : body ? "BODY_ONLY" : "MISSING",
          approved: true,
        },
      });

      await storeHubSpotDoc({ title, content, outcome, callId: id });
      result.imported++;
      result.details.push({ id, title, status: "imported" });
    } catch (err) {
      result.errors++;
      const msg = err instanceof Error ? err.message : "unknown";
      result.details.push({ id, title: null, status: `error: ${msg}` });
    }
  }

  return result;
}

/**
 * Import a pasted/uploaded HubSpot call transcript (no API needed). Use when
 * the calls API scope isn't available.
 */
export async function importHubSpotTranscript(args: {
  transcript: string;
  title?: string | null;
  outcome?: string | null;
}): Promise<HubSpotImportResult> {
  const result = newResult();
  const content = args.transcript.trim();
  if (content.length < 30) {
    result.errors++;
    result.details.push({ id: "manual", title: args.title ?? null, status: "transcript too short" });
    return result;
  }
  try {
    await storeHubSpotDoc({
      title: args.title || "HubSpot cold call",
      content,
      outcome: args.outcome ?? null,
      extraTags: args.outcome ? ["meeting_scheduled"] : [],
    });
    result.found = 1;
    result.imported = 1;
    result.details.push({ id: "manual", title: args.title ?? null, status: "imported" });
  } catch (err) {
    result.errors++;
    result.details.push({
      id: "manual",
      title: args.title ?? null,
      status: `error: ${err instanceof Error ? err.message : "unknown"}`,
    });
  }
  return result;
}
