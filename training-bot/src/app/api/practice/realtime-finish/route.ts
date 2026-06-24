import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const Schema = z.object({
  sessionId: z.string(),
  messages: z
    .array(
      z.object({
        role: z.enum(["TRAINEE", "TRAINER"]),
        content: z.string().min(1),
      })
    )
    .max(400),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { sessionId, messages } = Schema.parse(await req.json());

    const practiceSession = await db.practiceSession.findUnique({
      where: { id: sessionId },
    });
    if (!practiceSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (practiceSession.traineeId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (practiceSession.score !== null) {
      return NextResponse.json({ error: "Session already scored" }, { status: 400 });
    }

    // Replace any existing messages with the captured live transcript, keeping
    // order via incrementing timestamps.
    await db.practiceMessage.deleteMany({ where: { sessionId } });

    if (messages.length > 0) {
      const base = Date.now();
      await db.practiceMessage.createMany({
        data: messages.map((m, i) => ({
          sessionId,
          role: m.role,
          content: m.content,
          createdAt: new Date(base + i * 1000),
        })),
      });
    }

    return NextResponse.json({ ok: true, saved: messages.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
