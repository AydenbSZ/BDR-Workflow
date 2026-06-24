import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
    const searchParams = req.nextUrl.searchParams;
    const persona = searchParams.get("persona");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const approved = searchParams.get("approved");

    const where: Record<string, unknown> = {};
    if (persona) where.personaGuess = persona;
    if (approved === "true") where.approved = true;
    if (approved === "false") where.approved = false;

    const [calls, total] = await Promise.all([
      db.hubSpotCall.findMany({
        where,
        orderBy: { timestamp: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          hubspotCallId: true,
          ownerName: true,
          outcomeLabel: true,
          title: true,
          durationMs: true,
          direction: true,
          timestamp: true,
          transcriptStatus: true,
          associatedContactName: true,
          associatedContactTitle: true,
          associatedCompanyName: true,
          personaGuess: true,
          approved: true,
          excluded: true,
        },
      }),
      db.hubSpotCall.count({ where }),
    ]);

    return NextResponse.json({
      calls,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireRole(["ADMIN"]);
    const body = await req.json();
    const { id, approved, excluded, personaGuess } = body;

    const updated = await db.hubSpotCall.update({
      where: { id },
      data: {
        ...(approved !== undefined && { approved }),
        ...(excluded !== undefined && { excluded }),
        ...(personaGuess !== undefined && { personaGuess }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
