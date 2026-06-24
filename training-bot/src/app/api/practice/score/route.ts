import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { buildScoringSystemPrompt } from "@/lib/ai/prompts";
import { scorePracticeSession } from "@/lib/ai/provider";
import {
  retrieveRelevantChunks,
  retrieveCompanyContext,
  retrieveActiveRules,
} from "@/lib/knowledge/retrieval";

const ScoreSchema = z.object({
  sessionId: z.string(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const data = ScoreSchema.parse(body);

    const practiceSession = await db.practiceSession.findUnique({
      where: { id: data.sessionId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });

    if (!practiceSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (
      practiceSession.traineeId !== session.user.id &&
      (session.user as { role: string }).role === "TRAINEE"
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (practiceSession.score !== null) {
      return NextResponse.json({
        score: practiceSession.score,
        scoreBreakdown: practiceSession.scoreBreakdownJson,
        feedback: practiceSession.feedbackMarkdown,
        earnedMeeting: practiceSession.earnedMeeting,
      });
    }

    const callType = practiceSession.callType;
    const repLabel = callType === "COLD_CALL" ? "BDR" : "AE";
    const transcript = practiceSession.messages
      .map((m: { role: string; content: string }) => {
        const label = m.role === "TRAINEE" ? repLabel : "Prospect";
        return `${label}: ${m.content}`;
      })
      .join("\n\n");

    const exampleTags =
      callType === "DISCOVERY"
        ? ["discovery", practiceSession.scenario || "disco_general"]
        : callType === "DEMO"
        ? ["demo", practiceSession.scenario || "demo_general"]
        : [practiceSession.scenario || "general"];

    const [companyContext, rubric, trainingExamples] = await Promise.all([
      retrieveCompanyContext(),
      retrieveActiveRules(),
      retrieveRelevantChunks({
        persona: practiceSession.persona,
        tags: exampleTags,
        limit: 6,
      }),
    ]);

    const scoringPrompt = buildScoringSystemPrompt({
      callType,
      rubric,
      companyContext,
      retrievedTrainingExamples: trainingExamples,
      transcript,
      persona: practiceSession.persona,
      scenario: practiceSession.scenario || "general",
    });

    const aiResponse = await scorePracticeSession(scoringPrompt, transcript);

    let scoreData;
    try {
      const cleaned = aiResponse
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      scoreData = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse scoring response" },
        { status: 500 }
      );
    }

    const updated = await db.practiceSession.update({
      where: { id: data.sessionId },
      data: {
        score: scoreData.overallScore,
        scoreBreakdownJson: scoreData,
        feedbackMarkdown: scoreData.summaryFeedback,
        earnedMeeting: scoreData.earnedMeeting,
        transcriptJson: practiceSession.messages.map((m: { role: string; content: string; createdAt: Date }) => ({
          role: m.role,
          content: m.content,
          timestamp: m.createdAt,
        })),
      },
    });

    return NextResponse.json({
      score: updated.score,
      scoreBreakdown: scoreData,
      feedback: scoreData.summaryFeedback,
      earnedMeeting: scoreData.earnedMeeting,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
