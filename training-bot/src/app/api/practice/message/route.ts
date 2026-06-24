import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { generateRoleplayResponse } from "@/lib/ai/provider";

const MessageSchema = z.object({
  sessionId: z.string(),
  content: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const data = MessageSchema.parse(body);

    const practiceSession = await db.practiceSession.findUnique({
      where: { id: data.sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!practiceSession) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (practiceSession.traineeId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (practiceSession.score !== null) {
      return NextResponse.json(
        { error: "Session already scored" },
        { status: 400 }
      );
    }

    await db.practiceMessage.create({
      data: {
        sessionId: data.sessionId,
        role: "TRAINEE",
        content: data.content,
      },
    });

    const scenarioJson = practiceSession.scenarioJson as {
      systemPrompt: string;
      maxTurns?: number;
    };
    const systemPrompt = scenarioJson.systemPrompt;

    const messages = [
      ...practiceSession.messages.map((m: { role: string; content: string }) => ({
        role: (m.role === "TRAINEE" ? "user" : "assistant") as
          | "user"
          | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: data.content },
    ];

    // Drills cap shorter; AE discovery/demo calls run longer than cold calls.
    const maxMessages =
      scenarioJson.maxTurns ??
      (practiceSession.callType === "COLD_CALL" ? 30 : 60);
    if (messages.length >= maxMessages) {
      const endContent =
        practiceSession.callType === "COLD_CALL"
          ? "Look, I really need to go. Send me an email if you want to follow up. *hangs up*"
          : "Hey, I'm going to have to jump to my next meeting. Let's pick this up — send over the next steps and we'll go from there. Thanks. *ends call*";
      await db.practiceMessage.create({
        data: {
          sessionId: data.sessionId,
          role: "TRAINER",
          content: endContent,
        },
      });
      return NextResponse.json({
        role: "TRAINER",
        content: endContent,
        ended: true,
      });
    }

    const result = await generateRoleplayResponse(systemPrompt, messages);

    let responseText = "";
    const stream = result.textStream;
    for await (const chunk of stream) {
      responseText += chunk;
    }

    await db.practiceMessage.create({
      data: {
        sessionId: data.sessionId,
        role: "TRAINER",
        content: responseText,
      },
    });

    return NextResponse.json({
      role: "TRAINER",
      content: responseText,
      ended: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
