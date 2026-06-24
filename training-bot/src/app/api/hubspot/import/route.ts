import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { parseHubSpotCallId } from "@/lib/hubspot/client";
import {
  importHubSpotCallsByIds,
  importHubSpotTranscript,
} from "@/lib/hubspot/import";
import { parseDocument } from "@/lib/documents/parser";

const JsonSchema = z.object({
  links: z.string().optional(),
  transcript: z.string().optional(),
  title: z.string().optional(),
  meetingScheduled: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
    const contentType = req.headers.get("content-type") || "";

    // File upload (drag a transcript file).
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      const title = (form.get("title") as string | null) || null;
      const meetingScheduled = form.get("meetingScheduled") === "true";
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await parseDocument(buffer, file.name);
      const result = await importHubSpotTranscript({
        transcript: text,
        title: title || file.name,
        outcome: meetingScheduled ? "Meeting Scheduled" : null,
      });
      return NextResponse.json(result);
    }

    const body = await req.json().catch(() => ({}));
    const data = JsonSchema.parse(body);

    // Pasted transcript.
    if (data.transcript && data.transcript.trim().length > 0) {
      const result = await importHubSpotTranscript({
        transcript: data.transcript,
        title: data.title || null,
        outcome: data.meetingScheduled ? "Meeting Scheduled" : null,
      });
      return NextResponse.json(result);
    }

    // Call links / IDs -> pull via API.
    if (data.links && data.links.trim().length > 0) {
      const tokens = data.links.split(/[\s,]+/).filter(Boolean);
      const ids: string[] = [];
      const unparsable: string[] = [];
      for (const tok of tokens) {
        const id = parseHubSpotCallId(tok);
        if (id) ids.push(id);
        else unparsable.push(tok);
      }
      if (ids.length === 0) {
        return NextResponse.json(
          {
            error:
              "Couldn't find a HubSpot call ID in what you pasted. Open the call record and copy its URL, or paste the transcript text instead.",
          },
          { status: 400 }
        );
      }
      const result = await importHubSpotCallsByIds(ids);
      return NextResponse.json({ ...result, unparsable });
    }

    return NextResponse.json(
      { error: "Provide call links, a transcript, or a file." },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
