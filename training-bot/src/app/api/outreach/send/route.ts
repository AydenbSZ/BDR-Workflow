import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { runAgent } from "@/lib/agents/runner";
import { execution } from "@/lib/agents/execution";
import { z } from "zod";

const SendSchema = z.object({
  ids: z.array(z.string()).min(1).optional(),
  sequenceId: z.string().optional(),
  senderEmail: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const body = await req.json();
    const data = SendSchema.parse(body);

    let outreachIds = data.ids;
    if (!outreachIds) {
      const approved = await db.outreachQueue.findMany({
        where: { status: "APPROVED" },
        select: { id: true },
      });
      outreachIds = approved.map((a) => a.id);
    }

    if (outreachIds.length === 0) {
      return NextResponse.json({ error: "No approved outreach items to send" }, { status: 400 });
    }

    const { runId, resultPromise } = await runAgent(
      "execution",
      execution,
      {
        outreachIds,
        sequenceId: data.sequenceId,
        senderEmail: data.senderEmail,
      },
      session.user?.email ?? "unknown"
    );
    resultPromise.catch(() => {});

    return NextResponse.json({ runId, status: "started", count: outreachIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
