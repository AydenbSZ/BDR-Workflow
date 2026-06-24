import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { dailyBriefing } from "@/lib/agents/daily-briefing";

async function authCheck(req: NextRequest): Promise<string> {
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret && cronSecret === process.env.CRON_SECRET) return "scheduled";
  const session = await requireRole(["ADMIN", "MANAGER"]);
  return session.user?.email ?? "unknown";
}

export async function POST(req: NextRequest) {
  try {
    const triggeredBy = await authCheck(req);
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
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET(req: NextRequest) {
  try {
    await authCheck(req);
    const runs = await db.agentRun.findMany({
      where: { agentName: "daily-briefing" },
      orderBy: { startedAt: "desc" },
      take: 10,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
