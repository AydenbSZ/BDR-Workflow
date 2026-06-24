import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export async function GET() {
  try {
    await requireAuth();
    const ctx = await db.companyContext.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const UpdateContextSchema = z.object({
  id: z.string().optional(),
  positioning: z.string().optional(),
  valuePropsJson: z.array(z.string()).optional(),
  personasJson: z.any().optional(),
  competitorNotesJson: z.any().optional(),
  discoveryQuestionsJson: z.array(z.string()).optional(),
  keywordsJson: z.array(z.string()).optional(),
  cautionPhrasesJson: z.array(z.string()).optional(),
  openersJson: z.any().optional(),
  closesJson: z.any().optional(),
  aiNotesJson: z.any().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    await requireRole(["ADMIN"]);
    const body = await req.json();
    const data = UpdateContextSchema.parse(body);

    let ctx;
    if (data.id) {
      ctx = await db.companyContext.update({
        where: { id: data.id },
        data: {
          positioning: data.positioning,
          valuePropsJson: data.valuePropsJson,
          personasJson: data.personasJson,
          competitorNotesJson: data.competitorNotesJson,
          discoveryQuestionsJson: data.discoveryQuestionsJson,
          keywordsJson: data.keywordsJson,
          cautionPhrasesJson: data.cautionPhrasesJson,
          openersJson: data.openersJson,
          closesJson: data.closesJson,
          aiNotesJson: data.aiNotesJson,
        },
      });
    } else {
      await db.companyContext.updateMany({ data: { isActive: false } });
      ctx = await db.companyContext.create({
        data: {
          isActive: true,
          positioning: data.positioning,
          valuePropsJson: data.valuePropsJson,
          personasJson: data.personasJson,
          competitorNotesJson: data.competitorNotesJson,
          discoveryQuestionsJson: data.discoveryQuestionsJson,
          keywordsJson: data.keywordsJson,
          cautionPhrasesJson: data.cautionPhrasesJson,
          openersJson: data.openersJson,
          closesJson: data.closesJson,
          aiNotesJson: data.aiNotesJson,
        },
      });
    }

    return NextResponse.json(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
