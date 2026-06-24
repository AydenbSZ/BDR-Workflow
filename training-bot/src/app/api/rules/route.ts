import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

export async function GET() {
  try {
    await requireAuth();
    const rules = await db.ruleSet.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(rules);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const UpdateRulesSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  scoringJson: z.any().optional(),
  requiredKeywordsJson: z.array(z.string()).optional(),
  bannedPhrasesJson: z.array(z.string()).optional(),
  objectionRulesJson: z.any().optional(),
  rubricJson: z.any().optional(),
});

export async function PUT(req: NextRequest) {
  try {
    await requireRole(["ADMIN"]);
    const body = await req.json();
    const data = UpdateRulesSchema.parse(body);

    let rules;
    if (data.id) {
      rules = await db.ruleSet.update({
        where: { id: data.id },
        data: {
          name: data.name,
          scoringJson: data.scoringJson,
          requiredKeywordsJson: data.requiredKeywordsJson,
          bannedPhrasesJson: data.bannedPhrasesJson,
          objectionRulesJson: data.objectionRulesJson,
          rubricJson: data.rubricJson,
        },
      });
    } else {
      await db.ruleSet.updateMany({ data: { isActive: false } });
      rules = await db.ruleSet.create({
        data: {
          name: data.name || "Default Rules",
          isActive: true,
          scoringJson: data.scoringJson,
          requiredKeywordsJson: data.requiredKeywordsJson,
          bannedPhrasesJson: data.bannedPhrasesJson,
          objectionRulesJson: data.objectionRulesJson,
          rubricJson: data.rubricJson,
        },
      });
    }

    return NextResponse.json(rules);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
