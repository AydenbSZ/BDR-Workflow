import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { dailyBriefing } from "@/lib/agents/daily-briefing";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const dateParam = req.nextUrl.searchParams.get("date");
    const date = dateParam ? new Date(dateParam) : new Date();
    date.setHours(0, 0, 0, 0);

    const briefing = await db.dailyBriefing.findUnique({
      where: { date },
    });

    return NextResponse.json({ briefing });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cronSecret = req.headers.get("x-cron-secret");
    let triggeredBy: string;
    if (cronSecret && cronSecret === process.env.CRON_SECRET) {
      triggeredBy = "scheduled";
    } else {
      const session = await requireRole(["ADMIN", "MANAGER"]);
      triggeredBy = session.user?.email ?? "unknown";
    }

    const { runId, resultPromise } = await runAgent(
      "daily-briefing",
      dailyBriefing,
      undefined,
      triggeredBy
    );
    resultPromise.catch(() => {});

    return NextResponse.json({ runId, status: "started" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
