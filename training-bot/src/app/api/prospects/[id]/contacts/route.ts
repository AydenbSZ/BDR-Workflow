import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await context.params;
    const contacts = await db.prospectContact.findMany({
      where: { accountId: id },
      include: { _count: { select: { outreachItems: true } } },
      orderBy: { isPrimary: "desc" },
    });
    return NextResponse.json({ contacts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
