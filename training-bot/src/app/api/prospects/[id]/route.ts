import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await context.params;
    const account = await db.prospectAccount.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: { isPrimary: "desc" } },
        signals: { orderBy: { createdAt: "desc" } },
        qualifications: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    if (!account) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(account);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
    const { id } = await context.params;
    const body = await req.json();
    const account = await db.prospectAccount.update({
      where: { id },
      data: body,
    });
    return NextResponse.json(account);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
