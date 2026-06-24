import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
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
  } catch {
    /* ignore */
  }
  return val || "";
}

// Realtime supports a specific voice set (distinct from the TTS voices).
const REALTIME_VOICES: Record<string, string> = {
  CHIEF_DEVELOPMENT_OFFICER: "ash",
  DIRECTOR_OF_REAL_ESTATE: "echo",
  DIRECTOR_OF_FRANCHISE_DEVELOPMENT: "verse",
};

const Schema = z.object({ sessionId: z.string() });

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { sessionId } = Schema.parse(await req.json());

    const practiceSession = await db.practiceSession.findUnique({
      where: { id: sessionId },
    });
    if (!practiceSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (practiceSession.traineeId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const apiKey = readEnvKey("OPENAI_API_KEY");
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY not configured" },
        { status: 500 }
      );
    }

    const scenarioJson = practiceSession.scenarioJson as {
      systemPrompt?: string;
    } | null;
    const instructions =
      scenarioJson?.systemPrompt ||
      "You are a realistic sales prospect. Stay in character.";

    const model = readEnvKey("OPENAI_REALTIME_MODEL") || "gpt-realtime";
    const voice = REALTIME_VOICES[practiceSession.persona] || "ash";

    // Mint an ephemeral client token (GA Realtime API). The instructions
    // (roleplay prompt) live server-side so the browser never sees the rules.
    const res = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session: {
          type: "realtime",
          model,
          instructions,
          audio: {
            output: { voice },
            input: {
              transcription: { model: "whisper-1" },
              turn_detection: {
                type: "server_vad",
                threshold: 0.5,
                prefix_padding_ms: 300,
                silence_duration_ms: 500,
                create_response: true,
                interrupt_response: true,
              },
            },
          },
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: `Realtime session error ${res.status}: ${body.slice(0, 400)}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const token = data?.value;
    if (!token) {
      return NextResponse.json(
        { error: "No ephemeral token returned by OpenAI" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      token,
      model,
      voice,
      expiresAt: data?.expires_at ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
