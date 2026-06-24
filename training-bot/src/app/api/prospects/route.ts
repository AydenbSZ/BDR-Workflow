import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const params = req.nextUrl.searchParams;
    const status = params.get("status");
    const minScore = params.get("minScore");
    const industry = params.get("industry");
    const search = params.get("search");
    const page = parseInt(params.get("page") ?? "1", 10);
    const limit = parseInt(params.get("limit") ?? "20", 10);
    const sort = params.get("sort") ?? "expansionScore";
    const order = params.get("order") ?? "desc";

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (minScore) where.expansionScore = { gte: parseInt(minScore, 10) };
    if (industry) where.industry = { contains: industry, mode: "insensitive" };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { domain: { contains: search, mode: "insensitive" } },
      ];
    }

    const [accounts, total] = await Promise.all([
      db.prospectAccount.findMany({
        where,
        include: {
          _count: { select: { contacts: true, signals: true } },
        },
        orderBy: { [sort]: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.prospectAccount.count({ where }),
    ]);

    return NextResponse.json({ accounts, total, page, limit });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const CreateSchema = z.object({
  name: z.string().min(1),
  domain: z.string().optional(),
  industry: z.string().optional(),
  locationCount: z.number().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
    const body = await req.json();
    const data = CreateSchema.parse(body);
    const account = await db.prospectAccount.create({ data });
    return NextResponse.json(account);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
