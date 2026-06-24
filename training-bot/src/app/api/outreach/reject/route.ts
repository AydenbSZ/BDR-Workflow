import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const RejectSchema = z.object({
  ids: z.array(z.string()).min(1),
  reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
    const body = await req.json();
    const { ids, reason } = RejectSchema.parse(body);

    const result = await db.outreachQueue.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectionReason: reason,
      },
    });

    return NextResponse.json({ rejected: result.count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
