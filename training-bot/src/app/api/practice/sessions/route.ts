import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const role = (session.user as { role: string }).role;
    const searchParams = req.nextUrl.searchParams;
    const traineeId = searchParams.get("traineeId");
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const where: Record<string, unknown> = {};
    if (role === "TRAINEE") {
      where.traineeId = session.user.id;
    } else if (traineeId) {
      where.traineeId = traineeId;
    }

    const sessions = await db.practiceSession.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        trainee: { select: { id: true, name: true, email: true } },
        _count: { select: { messages: true } },
      },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
