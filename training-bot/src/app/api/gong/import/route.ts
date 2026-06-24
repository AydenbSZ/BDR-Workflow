import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { z } from "zod";
import { importGongCallsByIds, importManualTranscript } from "@/lib/gong/sync";
import { parseGongCallId, isGongConfigured } from "@/lib/gong/client";
import { parseDocument } from "@/lib/documents/parser";

const JsonSchema = z.object({
  // Free-form text containing call links/IDs (newline, comma, or space separated).
  links: z.string().optional(),
  // A transcript pasted directly.
  transcript: z.string().optional(),
  title: z.string().optional(),
  callType: z.enum(["DISCOVERY", "DEMO"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);

    const contentType = req.headers.get("content-type") || "";

    // --- File upload (drag & drop a transcript file) ---
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      const title = (form.get("title") as string | null) || null;
      const ctRaw = (form.get("callType") as string | null) || undefined;
      const callType =
        ctRaw === "DISCOVERY" || ctRaw === "DEMO" ? ctRaw : undefined;
      if (!file) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const text = await parseDocument(buffer, file.name);
      const result = await importManualTranscript({
        transcript: text,
        title: title || file.name,
        callType,
      });
      return NextResponse.json(result);
    }

    // --- JSON: links/IDs or pasted transcript ---
    const body = await req.json().catch(() => ({}));
    const data = JsonSchema.parse(body);

    if (data.transcript && data.transcript.trim().length > 0) {
      const result = await importManualTranscript({
        transcript: data.transcript,
        title: data.title || null,
        callType: data.callType,
      });
      return NextResponse.json(result);
    }

    if (data.links && data.links.trim().length > 0) {
      if (!isGongConfigured()) {
        return NextResponse.json(
          {
            error:
              "Gong API is not configured. Add GONG_ACCESS_KEY and GONG_ACCESS_KEY_SECRET to .env, or paste the transcript text instead.",
          },
          { status: 400 }
        );
      }
      const tokens = data.links.split(/[\s,]+/).filter(Boolean);
      const ids: string[] = [];
      const unparsable: string[] = [];
      for (const tok of tokens) {
        const id = parseGongCallId(tok);
        if (id) ids.push(id);
        else unparsable.push(tok);
      }
      if (ids.length === 0) {
        return NextResponse.json(
          {
            error:
              "Couldn't find a Gong call ID in what you pasted. Paste a call link (e.g. ...app.gong.io/call?id=12345) or the numeric ID.",
          },
          { status: 400 }
        );
      }
      const result = await importGongCallsByIds(ids);
      return NextResponse.json({ ...result, unparsable });
    }

    return NextResponse.json(
      { error: "Provide call links/IDs, a transcript, or a file." },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
