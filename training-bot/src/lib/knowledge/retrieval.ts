import { db } from "@/lib/db";
import type { Persona } from "@/generated/prisma/enums";

interface RetrievalQuery {
  persona?: Persona;
  scenario?: string;
  tags?: string[];
  limit?: number;
}

export async function retrieveRelevantChunks(
  query: RetrievalQuery
): Promise<string> {
  const { persona, tags, limit = 10 } = query;

  const where: Record<string, unknown> = {};

  if (persona) {
    where.OR = [{ persona }, { persona: null }];
  }

  if (tags && tags.length > 0) {
    where.tags = { hasSome: tags };
  }

  where.document = {
    approved: true,
    excluded: false,
  };

  const chunks = await db.knowledgeChunk.findMany({
    where,
    take: limit,
    orderBy: { createdAt: "desc" },
    include: { document: { select: { title: true, sourceType: true } } },
  });

  if (chunks.length === 0) {
    return "No specific training examples available yet. Use general sales best practices.";
  }

  return chunks
    .map(
      (c: { content: string; document: { title: string; sourceType: string } }, i: number) =>
        `[Example ${i + 1} - ${c.document.title} (${c.document.sourceType})]:\n${c.content}`
    )
    .join("\n\n---\n\n");
}

export async function retrieveCompanyContext(): Promise<string> {
  const ctx = await db.companyContext.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!ctx) return "No company context configured.";

  const sections: string[] = [];

  if (ctx.positioning) sections.push(`Positioning: ${ctx.positioning}`);

  if (ctx.valuePropsJson) {
    const props = ctx.valuePropsJson as string[];
    sections.push(`Value Propositions:\n${props.map((p) => `- ${p}`).join("\n")}`);
  }

  if (ctx.personasJson) {
    sections.push(`Persona Notes:\n${JSON.stringify(ctx.personasJson, null, 2)}`);
  }

  if (ctx.competitorNotesJson) {
    sections.push(
      `Competitor Notes:\n${JSON.stringify(ctx.competitorNotesJson, null, 2)}`
    );
  }

  if (ctx.keywordsJson) {
    const keywords = ctx.keywordsJson as string[];
    sections.push(`Approved Keywords: ${keywords.join(", ")}`);
  }

  if (ctx.cautionPhrasesJson) {
    const caution = ctx.cautionPhrasesJson as string[];
    sections.push(`Caution Phrases: ${caution.join(", ")}`);
  }

  return sections.join("\n\n");
}

export async function retrieveActiveRules(): Promise<string> {
  const rules = await db.ruleSet.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!rules) return "No scoring rules configured.";

  const sections: string[] = [];

  if (rules.rubricJson) {
    sections.push(`Scoring Rubric:\n${JSON.stringify(rules.rubricJson, null, 2)}`);
  }

  if (rules.requiredKeywordsJson) {
    const keywords = rules.requiredKeywordsJson as string[];
    sections.push(`Required Keywords: ${keywords.join(", ")}`);
  }

  if (rules.bannedPhrasesJson) {
    const banned = rules.bannedPhrasesJson as string[];
    sections.push(`Caution/Banned Phrases: ${banned.join(", ")}`);
  }

  if (rules.objectionRulesJson) {
    sections.push(
      `Objection Rules:\n${JSON.stringify(rules.objectionRulesJson, null, 2)}`
    );
  }

  return sections.join("\n\n");
}
