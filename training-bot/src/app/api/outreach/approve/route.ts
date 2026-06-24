import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const ApproveSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole(["ADMIN", "MANAGER"]);
    const body = await req.json();
    const { ids } = ApproveSchema.parse(body);

    const result = await db.outreachQueue.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: {
        status: "APPROVED",
        approvedBy: session.user?.email ?? "unknown",
        approvedAt: new Date(),
      },
    });

    return NextResponse.json({ approved: result.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
