import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
    const params = req.nextUrl.searchParams;
    const status = params.get("status");
    const type = params.get("type");
    const page = parseInt(params.get("page") ?? "1", 10);
    const limit = parseInt(params.get("limit") ?? "20", 10);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [items, total] = await Promise.all([
      db.outreachQueue.findMany({
        where,
        include: {
          contact: {
            include: { account: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.outreachQueue.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
