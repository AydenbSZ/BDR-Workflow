import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const searchParams = req.nextUrl.searchParams;
    const persona = searchParams.get("persona");
    const sourceType = searchParams.get("sourceType");
    const approved = searchParams.get("approved");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const where: Record<string, unknown> = { excluded: false };
    if (persona) where.persona = persona;
    if (sourceType) where.sourceType = sourceType;
    if (approved === "true") where.approved = true;
    if (approved === "false") where.approved = false;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { content: { contains: search, mode: "insensitive" } },
      ];
    }

    const [docs, total] = await Promise.all([
      db.knowledgeDocument.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { chunks: true } },
          call: {
            select: {
              hubspotCallId: true,
              ownerName: true,
              associatedCompanyName: true,
            },
          },
        },
      }),
      db.knowledgeDocument.count({ where }),
    ]);

    return NextResponse.json({
      documents: docs,
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
    await requireRole(["ADMIN", "MANAGER"]);
    const body = await req.json();
    const { id, approved, excluded, persona, tags } = body;

    const updated = await db.knowledgeDocument.update({
      where: { id },
      data: {
        ...(approved !== undefined && { approved }),
        ...(excluded !== undefined && { excluded }),
        ...(persona !== undefined && { persona }),
        ...(tags !== undefined && { tags }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
