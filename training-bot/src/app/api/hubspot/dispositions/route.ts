import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getDispositions } from "@/lib/hubspot/client";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await requireRole(["ADMIN", "MANAGER"]);

    const dispositions = await getDispositions();

    for (const d of dispositions) {
      await db.hubSpotDisposition.upsert({
        where: { internalId: d.id },
        create: { label: d.label, internalId: d.id },
        update: { label: d.label },
      });
    }

    const all = await db.hubSpotDisposition.findMany({
      orderBy: { label: "asc" },
    });

    return NextResponse.json(all);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await req.json();
    const { internalId } = body;

    await db.hubSpotDisposition.updateMany({
      data: { isSelected: false },
    });

    const updated = await db.hubSpotDisposition.update({
      where: { internalId },
      data: { isSelected: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
