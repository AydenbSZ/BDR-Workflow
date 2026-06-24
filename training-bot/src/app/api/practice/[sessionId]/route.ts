import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const session = await requireAuth();
    const { sessionId } = await params;
    const role = (session.user as { role: string }).role;

    const practiceSession = await db.practiceSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        trainee: { select: { id: true, name: true, email: true } },
      },
    });

    if (!practiceSession) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (
      role === "TRAINEE" &&
      practiceSession.traineeId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(practiceSession);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
