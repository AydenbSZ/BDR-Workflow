import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  searchCalls,
  getTranscript,
  getAssociations,
  getContact,
  getCompany,
} from "@/lib/hubspot/client";
import { classifyPersona } from "@/lib/persona-classifier";
type TranscriptStatus = "AVAILABLE" | "BODY_ONLY" | "RECORDING_ONLY" | "MISSING" | "ERROR";

export async function POST(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);

    const body = await req.json();
    const {
      dateFrom,
      dateTo,
      minDurationMs = 60000,
      ownerIds: filterOwnerIds,
    } = body;

    const selectedDisposition = await db.hubSpotDisposition.findFirst({
      where: { isSelected: true },
    });
    if (!selectedDisposition) {
      return NextResponse.json(
        { error: "No Meeting Scheduled disposition selected" },
        { status: 400 }
      );
    }

    let bdrOwnerIds: string[];
    if (filterOwnerIds?.length) {
      bdrOwnerIds = filterOwnerIds;
    } else {
      const bdrs = await db.hubSpotOwner.findMany({
        where: { isCurrentBdr: true },
      });
      bdrOwnerIds = bdrs.map((b: { hubspotOwnerId: string }) => b.hubspotOwnerId);
    }

    if (bdrOwnerIds.length === 0) {
      return NextResponse.json(
        { error: "No BDRs selected" },
        { status: 400 }
      );
    }

    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setFullYear(defaultFrom.getFullYear() - 1);

    const stats = {
      callsFound: 0,
      callsImported: 0,
      callsSkipped: 0,
      withTranscript: 0,
      withBodyOnly: 0,
      withRecordingOnly: 0,
      errors: 0,
    };

    let after: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const result = await searchCalls({
        dispositionId: selectedDisposition.internalId,
        ownerIds: bdrOwnerIds,
        direction: "OUTBOUND",
        status: "COMPLETED",
        dateFrom: dateFrom || defaultFrom.toISOString(),
        dateTo: dateTo || now.toISOString(),
        after,
      });

      stats.callsFound += result.results.length;

      for (const call of result.results) {
        try {
          const props = call.properties;
          const durationMs = parseInt(props.hs_call_duration || "0", 10);

          if (durationMs < minDurationMs) {
            stats.callsSkipped++;
            continue;
          }

          const existing = await db.hubSpotCall.findUnique({
            where: { hubspotCallId: call.id },
          });
          if (existing) {
            stats.callsSkipped++;
            continue;
          }

          let transcriptStatus: TranscriptStatus = "MISSING";
          const transcriptId = props.hs_call_transcription_id;
          let utterances: Array<{
            speakerName?: string;
            speakerEmail?: string;
            text: string;
            startTimeMillis?: number;
            endTimeMillis?: number;
          }> = [];

          if (transcriptId) {
            utterances = await getTranscript(transcriptId);
            transcriptStatus = utterances.length > 0 ? "AVAILABLE" : "MISSING";
          }

          if (
            transcriptStatus === "MISSING" &&
            props.hs_call_body &&
            props.hs_call_body.length > 50
          ) {
            transcriptStatus = "BODY_ONLY";
          } else if (
            transcriptStatus === "MISSING" &&
            props.hs_call_recording_url
          ) {
            transcriptStatus = "RECORDING_ONLY";
          }

          let contactName: string | null = null;
          let contactTitle: string | null = null;
          let contactEmail: string | null = null;
          let companyName: string | null = null;
          let companyDomain: string | null = null;

          try {
            const contactAssocs = await getAssociations(call.id, "contacts");
            if (contactAssocs.length > 0) {
              const contact = await getContact(contactAssocs[0].id);
              contactName = [
                contact.properties.firstname,
                contact.properties.lastname,
              ]
                .filter(Boolean)
                .join(" ") || null;
              contactTitle = contact.properties.jobtitle || null;
              contactEmail = contact.properties.email || null;
            }

            const companyAssocs = await getAssociations(call.id, "companies");
            if (companyAssocs.length > 0) {
              const company = await getCompany(companyAssocs[0].id);
              companyName = company.properties.name || null;
              companyDomain =
                company.properties.domain ||
                company.properties.website ||
                null;
            }
          } catch {
            // association enrichment is best-effort
          }

          const personaGuess = classifyPersona(contactTitle);

          const owner = await db.hubSpotOwner.findUnique({
            where: { hubspotOwnerId: props.hubspot_owner_id || "" },
          });

          const hubspotCall = await db.hubSpotCall.create({
            data: {
              hubspotCallId: call.id,
              hubspotOwnerId: props.hubspot_owner_id,
              ownerName: owner
                ? `${owner.firstName || ""} ${owner.lastName || ""}`.trim()
                : null,
              outcomeLabel: selectedDisposition.label,
              outcomeId: selectedDisposition.internalId,
              title: props.hs_call_title,
              body: props.hs_call_body,
              durationMs,
              direction: props.hs_call_direction,
              status: props.hs_call_status,
              timestamp: props.hs_timestamp
                ? new Date(props.hs_timestamp)
                : null,
              recordingUrl: props.hs_call_recording_url,
              transcriptId: transcriptId || null,
              transcriptStatus,
              associatedContactName: contactName,
              associatedContactTitle: contactTitle,
              associatedContactEmail: contactEmail,
              associatedCompanyName: companyName,
              associatedCompanyDomain: companyDomain,
              personaGuess,
              rawJson: JSON.parse(JSON.stringify(call)),
            },
          });

          if (utterances.length > 0) {
            await db.transcriptUtterance.createMany({
              data: utterances.map((u) => ({
                callId: hubspotCall.id,
                speakerName: u.speakerName || null,
                speakerEmail: u.speakerEmail || null,
                speakerRole: "UNKNOWN" as const,
                text: u.text,
                startTimeMillis: u.startTimeMillis || null,
                endTimeMillis: u.endTimeMillis || null,
              })),
            });
            stats.withTranscript++;
          } else if (transcriptStatus === "BODY_ONLY") {
            stats.withBodyOnly++;
          } else if (transcriptStatus === "RECORDING_ONLY") {
            stats.withRecordingOnly++;
          }

          stats.callsImported++;
        } catch (error) {
          stats.errors++;
          const msg = error instanceof Error ? error.message : "Unknown error";
          await db.hubSpotCall
            .upsert({
              where: { hubspotCallId: call.id },
              create: {
                hubspotCallId: call.id,
                transcriptStatus: "ERROR",
                syncError: msg,
              },
              update: { syncError: msg, transcriptStatus: "ERROR" },
            })
            .catch(() => {});
        }
      }

      after = result.paging?.next?.after;
      hasMore = !!after;
    }

    await db.syncLog.create({
      data: {
        type: "CALLS",
        status: stats.errors > 0 ? "PARTIAL" : "SUCCESS",
        details: JSON.parse(JSON.stringify(stats)),
        callsFound: stats.callsFound,
        callsImported: stats.callsImported,
        callsSkipped: stats.callsSkipped,
        errors: stats.errors,
      },
    });

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
