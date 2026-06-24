import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

interface DimVal {
  score?: number;
  max?: number;
}
interface Breakdown {
  scoreBreakdown?: Record<string, DimVal>;
  objectionsEncountered?: Array<{
    objection?: string;
    rating?: string;
  }>;
}

const DIFFICULTY_ORDER = ["EASY", "MEDIUM", "HARD"];

// Map a weak scoring dimension to the best drill scenario + a focus instruction
// for the roleplay. Falls back to a generic focus when unmapped.
const DIMENSION_DRILL: Record<
  string,
  { callType: string; scenario: string; label: string; focus: string }
> = {
  // Cold call dimensions
  objectionHandling: {
    callType: "COLD_CALL",
    scenario: "competitor_in_place",
    label: "Objection Handling",
    focus:
      "Relentlessly raise objections (competitor in place, budget, AI skepticism). Push back on every weak rebuttal so the rep must handle objections cleanly.",
  },
  meetingAsk: {
    callType: "COLD_CALL",
    scenario: "email_me",
    label: "Asking for the Meeting",
    focus:
      "Be evasive about committing. Deflect with 'just email me' and vague timing so the rep must make a crisp, specific meeting ask with concrete time options.",
  },
  opener: {
    callType: "COLD_CALL",
    scenario: "random",
    label: "Opener",
    focus:
      "Answer abruptly and impatiently at the start. Reward only a sharp, relevant opener with continued engagement.",
  },
  valueProposition: {
    callType: "COLD_CALL",
    scenario: "ai_skepticism",
    label: "Value Proposition",
    focus:
      "Repeatedly ask 'so what does that actually do for me?' Force the rep to articulate concrete, persona-relevant value.",
  },
  // Discovery dimensions
  questioningQuality: {
    callType: "DISCOVERY",
    scenario: "disco_unclear_pain",
    label: "Questioning",
    focus:
      "Give thin, surface-level answers. Only open up when the rep asks strong, open-ended, layered questions. Reward good questions with richer detail.",
  },
  painDiscovery: {
    callType: "DISCOVERY",
    scenario: "disco_incumbent",
    label: "Pain Discovery",
    focus:
      "Claim things are 'mostly fine' with your incumbent tool. Make the rep dig to surface and quantify real pain before you admit gaps.",
  },
  qualification: {
    callType: "DISCOVERY",
    scenario: "disco_multi_stakeholder",
    label: "Qualification",
    focus:
      "Be vague about budget, timeline, and who decides. Force the rep to qualify process, stakeholders, and timing explicitly.",
  },
  activeListening: {
    callType: "DISCOVERY",
    scenario: "disco_general",
    label: "Active Listening",
    focus:
      "Drop important details once, in passing. Reward the rep if they reflect/summarize what you said; get mildly annoyed if they make you repeat yourself.",
  },
  // Demo dimensions
  tailoringToNeeds: {
    callType: "DEMO",
    scenario: "demo_general",
    label: "Tailoring the Demo",
    focus:
      "Lose interest quickly if the rep gives a generic feature tour. Re-engage only when they connect features to your specific stated situation.",
  },
  objectionHandlingDemo: {
    callType: "DEMO",
    scenario: "demo_competitor_compare",
    label: "Demo Objection Handling",
    focus:
      "Compare everything to a competitor and challenge pricing and data accuracy. Make the rep defend value convincingly.",
  },
  valueArticulation: {
    callType: "DEMO",
    scenario: "demo_price_sensitive",
    label: "Value Articulation",
    focus:
      "Fixate on cost and ROI. Push the rep to translate every feature into a business outcome and payback.",
  },
  trialCloseAndNextSteps: {
    callType: "DEMO",
    scenario: "demo_general",
    label: "Closing & Next Steps",
    focus:
      "Stay non-committal at the end. Make the rep earn a concrete next step with a clean trial close.",
  },
};

export async function GET() {
  try {
    const session = await requireAuth();

    const scored = (await db.practiceSession.findMany({
      where: { traineeId: session.user.id, score: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        score: true,
        callType: true,
        difficulty: true,
        scoreBreakdownJson: true,
        createdAt: true,
      },
    })) as Array<{
      score: number | null;
      callType: string;
      difficulty: string;
      scoreBreakdownJson: unknown;
    }>;

    if (scored.length === 0) {
      return NextResponse.json({
        hasHistory: false,
        recommendedCallType: "COLD_CALL",
        recommendedDifficulty: "MEDIUM",
        recommendedScenario: "random",
        message:
          "Run your first practice call and we'll start tailoring drills to your weak spots.",
      });
    }

    // --- Most-practiced call type (recent) ---
    const ctCounts: Record<string, number> = {};
    for (const s of scored) ctCounts[s.callType] = (ctCounts[s.callType] || 0) + 1;
    const primaryCallType =
      Object.entries(ctCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "COLD_CALL";

    // --- Adaptive difficulty from the 3 most recent sessions of that type ---
    const recentOfType = scored
      .filter((s) => s.callType === primaryCallType)
      .slice(0, 3);
    const currentDifficulty = recentOfType[0]?.difficulty || "MEDIUM";
    const recentAvg =
      recentOfType.length > 0
        ? recentOfType.reduce((sum, s) => sum + (s.score || 0), 0) /
          recentOfType.length
        : 0;

    let recommendedDifficulty = currentDifficulty;
    let difficultyReason = "";
    const idx = DIFFICULTY_ORDER.indexOf(currentDifficulty);
    if (recentOfType.length >= 2 && recentAvg >= 80 && idx < 2) {
      recommendedDifficulty = DIFFICULTY_ORDER[idx + 1];
      difficultyReason = `You're averaging ${Math.round(
        recentAvg
      )} on ${currentDifficulty.toLowerCase()} — time to level up.`;
    } else if (recentOfType.length >= 2 && recentAvg < 50 && idx > 0) {
      recommendedDifficulty = DIFFICULTY_ORDER[idx - 1];
      difficultyReason = `Let's rebuild confidence at ${DIFFICULTY_ORDER[
        idx - 1
      ].toLowerCase()} before pushing harder.`;
    } else {
      difficultyReason = `Keep working at ${currentDifficulty.toLowerCase()} to lock it in.`;
    }

    // --- Weakest dimension across recent sessions ---
    const dimTotals: Record<string, { sum: number; count: number }> = {};
    const objectionTally: Record<string, number> = {};
    for (const s of scored) {
      const bd = s.scoreBreakdownJson as Breakdown | null;
      if (bd?.scoreBreakdown) {
        for (const [key, val] of Object.entries(bd.scoreBreakdown)) {
          if (!val || typeof val.score !== "number") continue;
          const max = typeof val.max === "number" && val.max > 0 ? val.max : 100;
          if (!dimTotals[key]) dimTotals[key] = { sum: 0, count: 0 };
          dimTotals[key].sum += (val.score / max) * 100;
          dimTotals[key].count += 1;
        }
      }
      for (const o of bd?.objectionsEncountered || []) {
        if (
          o.objection &&
          (o.rating === "poor" || o.rating === "okay")
        ) {
          objectionTally[o.objection] = (objectionTally[o.objection] || 0) + 1;
        }
      }
    }

    const dimAverages = Object.entries(dimTotals)
      .map(([key, v]) => ({ key, avg: Math.round(v.sum / v.count) }))
      // ignore professionalism/compliance which is usually maxed and not a useful drill
      .filter((d) => !/professionalism/i.test(d.key))
      .sort((a, b) => a.avg - b.avg);

    const weakest = dimAverages[0] || null;
    const topObjectionEntry = Object.entries(objectionTally).sort(
      (a, b) => b[1] - a[1]
    )[0];

    // --- Build the drill from the weakest dimension ---
    const drill = weakest ? DIMENSION_DRILL[weakest.key] : undefined;

    let focusArea = "";
    let weakestSkill: { key: string; label: string; avg: number } | null = null;
    let recommendedCallType = primaryCallType;
    let recommendedScenario = "random";

    if (weakest && drill) {
      weakestSkill = { key: weakest.key, label: drill.label, avg: weakest.avg };
      recommendedCallType = drill.callType;
      recommendedScenario = drill.scenario;
      focusArea = drill.focus;
    } else if (weakest) {
      weakestSkill = {
        key: weakest.key,
        label: weakest.key.replace(/([A-Z])/g, " $1").trim(),
        avg: weakest.avg,
      };
      focusArea = `Probe the rep specifically on their weakest area: ${weakestSkill.label.toLowerCase()}.`;
    }

    if (topObjectionEntry) {
      focusArea += ` Make sure to raise this objection they have struggled with: "${topObjectionEntry[0]}".`;
    }

    const message = weakestSkill
      ? `Your lowest skill lately is ${weakestSkill.label} (${weakestSkill.avg}/100). ${difficultyReason}`
      : difficultyReason;

    return NextResponse.json({
      hasHistory: true,
      recommendedCallType,
      recommendedDifficulty,
      recommendedScenario,
      weakestSkill,
      topObjection: topObjectionEntry
        ? { text: topObjectionEntry[0], count: topObjectionEntry[1] }
        : null,
      focusArea: focusArea.trim(),
      message,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
