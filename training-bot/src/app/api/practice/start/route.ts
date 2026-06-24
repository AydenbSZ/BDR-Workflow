import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { buildRoleplaySystemPrompt } from "@/lib/ai/prompts";
import {
  retrieveRelevantChunks,
  retrieveCompanyContext,
  retrieveActiveRules,
} from "@/lib/knowledge/retrieval";
import type { CallType } from "@/generated/prisma/enums";

const StartSessionSchema = z.object({
  callType: z.enum(["COLD_CALL", "DISCOVERY", "DEMO"]).default("COLD_CALL"),
  persona: z.enum([
    "CHIEF_DEVELOPMENT_OFFICER",
    "DIRECTOR_OF_REAL_ESTATE",
    "DIRECTOR_OF_FRANCHISE_DEVELOPMENT",
  ]),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  scenario: z.string().default("random"),
  companyName: z.string().optional(),
  industryContext: z.string().optional(),
  gongCallId: z.string().optional(),
  focusArea: z.string().max(600).optional(),
  isDrill: z.boolean().optional(),
  realtime: z.boolean().optional(),
});

/**
 * Build a grounding excerpt from a real Gong call transcript, biased toward the
 * prospect's own lines so the AI adopts their situation, objections, and tone.
 */
function buildGrounding(transcript: string | null): string {
  if (!transcript) return "";
  const lines = transcript.split("\n").filter((l) => l.trim());
  const prospectLines = lines.filter((l) => /^PROSPECT/i.test(l.trim()));
  const chosen = prospectLines.length >= 3 ? prospectLines : lines;
  return chosen.join("\n").slice(0, 2500);
}

const SCENARIO_DESCRIPTIONS: Record<string, string> = {
  // Cold call scenarios
  random:
    "A general cold call. The prospect may raise any common objection naturally.",
  competitor_in_place:
    "The prospect currently uses a competitor (Buxton, Placer.ai, Sitewise, or had SiteZeus before). They will mention this early.",
  budget_objection:
    "The prospect will say they just went through budget season or don't have budget approval.",
  ai_skepticism:
    "The prospect is skeptical about AI in site selection and will push back on the AI angle.",
  not_expanding: "The prospect says they are not expanding right now.",
  acquisition_growth:
    "The prospect says they grow through acquisition, not organic expansion.",
  email_me:
    "The prospect will try to get off the call quickly by asking you to just email information.",

  // Discovery scenarios
  disco_general:
    "A standard discovery call. The prospect agreed to talk but you must uncover their real situation, pain, and goals through good questions.",
  disco_incumbent:
    "The prospect already uses an incumbent tool (Buxton/Placer/Sitewise) and is fairly satisfied. Surface gaps and unmet needs without bashing the competitor.",
  disco_unclear_pain:
    "The prospect isn't sure they have a problem and took the call out of mild curiosity. You must help them articulate latent pain.",
  disco_multi_stakeholder:
    "The decision involves multiple stakeholders (ops, finance, franchise). Uncover the buying process and who else matters.",
  disco_aggressive_growth:
    "The prospect is in aggressive expansion mode and time-pressured. Quickly qualify fit and urgency.",

  // Demo scenarios
  demo_general:
    "A standard product demo for a prospect who completed discovery. Tailor the walkthrough to their stated needs and advance the deal.",
  demo_price_sensitive:
    "The prospect is focused on cost and ROI and will repeatedly push on pricing and payback.",
  demo_competitor_compare:
    "The prospect is actively comparing SiteZeus to a competitor and will ask how features stack up.",
  demo_technical_depth:
    "A hands-on, technical prospect who probes data accuracy, methodology, and integrations.",
  demo_skeptical_champion:
    "Your champion likes it but a skeptical stakeholder on the call challenges value and adoption.",
};

const DEFAULT_SCENARIO: Record<string, string> = {
  COLD_CALL: "random",
  DISCOVERY: "disco_general",
  DEMO: "demo_general",
};

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const data = StartSessionSchema.parse(body);

    const callType = data.callType as CallType;
    const scenarioKey =
      data.scenario && SCENARIO_DESCRIPTIONS[data.scenario]
        ? data.scenario
        : DEFAULT_SCENARIO[callType];

    // Pull benchmark examples. For AE calls we bias toward real Gong calls of
    // the matching type; for cold calls we use the scenario tag as before.
    const exampleTags =
      callType === "DISCOVERY"
        ? ["discovery", scenarioKey]
        : callType === "DEMO"
        ? ["demo", scenarioKey]
        : [scenarioKey];

    const [companyContext, rulesSummary, retrievedExamples] = await Promise.all([
      retrieveCompanyContext(),
      retrieveActiveRules(),
      retrieveRelevantChunks({
        persona: data.persona,
        tags: exampleTags,
        limit: 6,
      }),
    ]);

    const scenarioDesc =
      SCENARIO_DESCRIPTIONS[scenarioKey] || SCENARIO_DESCRIPTIONS.random;

    // Optional: ground the prospect's character in a real Gong call.
    let groundingCall = "";
    let groundedCallTitle: string | null = null;
    if (data.gongCallId) {
      const gongCall = await db.gongCall
        .findFirst({
          where: { id: data.gongCallId, excluded: false },
          select: { transcript: true, title: true },
        })
        .catch(() => null);
      if (gongCall?.transcript) {
        groundingCall = buildGrounding(gongCall.transcript);
        groundedCallTitle = gongCall.title;
      }
    }

    const systemPrompt = buildRoleplaySystemPrompt({
      callType,
      persona: data.persona,
      difficulty: data.difficulty,
      scenario: scenarioDesc,
      companyContext,
      rulesSummary,
      retrievedExamples,
      companyName: data.companyName,
      industryContext: data.industryContext,
      groundingCall,
      focusInstruction: data.focusArea,
    });

    // Drills are short, focused reps; full calls run longer.
    const maxTurns = data.isDrill ? 16 : callType === "COLD_CALL" ? 30 : 60;

    const practiceSession = await db.practiceSession.create({
      data: {
        traineeId: session.user.id,
        callType,
        persona: data.persona,
        difficulty: data.difficulty,
        scenario: scenarioKey,
        companyName: data.companyName || null,
        industryContext: data.industryContext || null,
        scenarioJson: {
          systemPrompt,
          scenarioDescription: scenarioDesc,
          callType,
          groundedGongCallId: data.gongCallId || null,
          groundedCallTitle,
          isDrill: data.isDrill || false,
          focusArea: data.focusArea || null,
          maxTurns,
        },
      },
    });

    // Realtime calls have the model greet live over audio, so we don't persist
    // a canned greeting (the transcript is captured at the end of the call).
    const greeting = data.realtime
      ? ""
      : getProspectGreeting(data.persona, callType);
    if (!data.realtime) {
      await db.practiceMessage.create({
        data: {
          sessionId: practiceSession.id,
          role: "TRAINER",
          content: greeting,
        },
      });
    }

    return NextResponse.json({
      sessionId: practiceSession.id,
      greeting,
      callType,
      persona: data.persona,
      difficulty: data.difficulty,
      scenario: scenarioKey,
      groundedCallTitle,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function getProspectGreeting(persona: string, callType: CallType): string {
  if (callType === "DISCOVERY") {
    const options = [
      "Hey, thanks for setting this up. I've got about 25 minutes — so what did you want to cover?",
      "Hi there. Yeah, I'm around. Remind me what SiteZeus does again?",
      "Hey, good to connect. I'll be honest, my calendar's packed, so let's make this useful. What's on your mind?",
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  if (callType === "DEMO") {
    const options = [
      "Hey — yeah, I'm ready when you are. I'm curious to see how this actually looks for a footprint like ours.",
      "Hi, thanks. I've got the team's questions in the back of my mind, so feel free to jump in.",
      "Hey, appreciate you walking me through it. Before we start — can it actually handle our kind of data?",
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  const greetings: Record<string, string[]> = {
    CHIEF_DEVELOPMENT_OFFICER: [
      "This is Mike. What can I do for you?",
      "Yeah, who's this?",
      "This is Sarah. I have about two minutes, what's up?",
    ],
    DIRECTOR_OF_REAL_ESTATE: [
      "This is Dave in real estate. What's going on?",
      "Hey, this is Jennifer. What do you need?",
      "Yeah? This is Tom.",
    ],
    DIRECTOR_OF_FRANCHISE_DEVELOPMENT: [
      "This is Chris, franchise development. Who am I speaking with?",
      "Hey, this is Lisa. What's this about?",
      "Yeah, this is Marcus. I'm between meetings, what do you got?",
    ],
  };

  const options = greetings[persona] || greetings.DIRECTOR_OF_REAL_ESTATE;
  return options[Math.floor(Math.random() * options.length)];
}
