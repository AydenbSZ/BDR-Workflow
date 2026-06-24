import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getOwners } from "@/lib/hubspot/client";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await requireRole(["ADMIN", "MANAGER"]);

    const owners = await getOwners();

    for (const owner of owners) {
      await db.hubSpotOwner.upsert({
        where: { hubspotOwnerId: owner.id },
        create: {
          hubspotOwnerId: owner.id,
          hubspotUserId: owner.userId?.toString() ?? null,
          email: owner.email ?? null,
          firstName: owner.firstName ?? null,
          lastName: owner.lastName ?? null,
          teamName: owner.teams?.[0]?.name ?? null,
          archived: owner.archived,
        },
        update: {
          hubspotUserId: owner.userId?.toString() ?? null,
          email: owner.email ?? null,
          firstName: owner.firstName ?? null,
          lastName: owner.lastName ?? null,
          teamName: owner.teams?.[0]?.name ?? null,
          archived: owner.archived,
        },
      });
    }

    const allOwners = await db.hubSpotOwner.findMany({
      orderBy: { lastName: "asc" },
    });

    return NextResponse.json(allOwners);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const body = await req.json();
    const { hubspotOwnerId, isCurrentBdr } = body;

    const updated = await db.hubSpotOwner.update({
      where: { hubspotOwnerId },
      data: { isCurrentBdr },
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
