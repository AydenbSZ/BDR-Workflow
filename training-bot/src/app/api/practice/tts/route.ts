import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import OpenAI from "openai";
import { z } from "zod";
import { readFileSync } from "fs";
import { resolve } from "path";

function readEnvKey(key: string): string {
  const val = process.env[key];
  if (val && val.length > 5) return val;
  try {
    const envPath = resolve(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"));
    if (match) return match[1];
  } catch { /* ignore */ }
  return val || "";
}

const TtsSchema = z.object({
  text: z.string().min(1).max(5000),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).default("onyx"),
});

export async function POST(req: NextRequest) {
  try {
    await requireAuth();

    const apiKey = readEnvKey("OPENAI_API_KEY");
    if (!apiKey) {
      return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
    }

    const body = await req.json();
    const { text, voice } = TtsSchema.parse(body);

    const openai = new OpenAI({ apiKey });

    const mp3 = await openai.audio.speech.create({
      model: "tts-1-hd",
      voice,
      input: text,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TTS failed";
    console.error("TTS route error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
