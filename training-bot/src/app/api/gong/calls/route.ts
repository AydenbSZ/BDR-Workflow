import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(req.url);
    const callType = searchParams.get("callType");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    const where: Record<string, unknown> = { excluded: false };
    if (callType === "DISCOVERY" || callType === "DEMO") {
      where.callType = callType;
    }

    const calls = await db.gongCall.findMany({
      where,
      take: limit,
      orderBy: { callDate: "desc" },
      select: {
        id: true,
        gongCallId: true,
        title: true,
        url: true,
        callType: true,
        callTypeConfidence: true,
        durationSec: true,
        callDate: true,
        participantsJson: true,
        transcriptStatus: true,
        approved: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ calls });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const UpdateSchema = z.object({
  id: z.string(),
  callType: z.enum(["DISCOVERY", "DEMO"]).optional(),
  approved: z.boolean().optional(),
  excluded: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    await requireRole(["ADMIN", "MANAGER"]);
    const body = await req.json();
    const data = UpdateSchema.parse(body);

    const updateData: Record<string, unknown> = {};
    if (data.callType) updateData.callType = data.callType;
    if (data.approved !== undefined) updateData.approved = data.approved;
    if (data.excluded !== undefined) updateData.excluded = data.excluded;

    const call = await db.gongCall.update({
      where: { id: data.id },
      data: updateData,
    });

    // Keep the linked KnowledgeDocument(s) in sync so retrieval reflects the
    // corrected call type and approval state.
    if (data.callType || data.approved !== undefined || data.excluded !== undefined) {
      const docs = await db.knowledgeDocument.findMany({
        where: { gongCallId: call.id },
        select: { id: true },
      });
      for (const doc of docs) {
        const docUpdate: Record<string, unknown> = {};
        if (data.approved !== undefined) docUpdate.approved = data.approved;
        if (data.excluded !== undefined) docUpdate.excluded = data.excluded;
        if (data.callType) {
          const typeTag = data.callType.toLowerCase();
          docUpdate.tags = ["gong", "ae", typeTag];
        }
        await db.knowledgeDocument.update({ where: { id: doc.id }, data: docUpdate });
        if (data.callType) {
          await db.knowledgeChunk.updateMany({
            where: { documentId: doc.id },
            data: { tags: ["gong", "ae", data.callType.toLowerCase()] },
          });
        }
      }
    }

    return NextResponse.json({ call });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
