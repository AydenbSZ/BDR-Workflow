import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { execution } from "@/lib/agents/execution";
import { z } from "zod";

const ExecutionSchema = z.object({
  outreachIds: z.array(z.string()).min(1),
  sequenceId: z.string().optional(),
  senderEmail: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const body = await req.json();
    const data = ExecutionSchema.parse(body);
    const { runId, resultPromise } = await runAgent(
      "execution",
      execution,
      data,
      session.user?.email ?? "unknown"
    );
    resultPromise.catch(() => {});
    return NextResponse.json({ runId, status: "started" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function GET() {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
    const runs = await db.agentRun.findMany({
      where: { agentName: "execution" },
      orderBy: { startedAt: "desc" },
      take: 10,
    });
    return NextResponse.json({ runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
