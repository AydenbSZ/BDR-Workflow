import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { AgentContext, AgentResult } from "./types";
import { buildQualificationPrompt } from "./prompts/qualification";

function getModel() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const anthropic = createAnthropic({ apiKey });
  return anthropic("claude-sonnet-4-20250514");
}

interface QualificationInput {
  accountIds?: string[];
}

export async function qualification(
  ctx: AgentContext,
  input: QualificationInput
): Promise<AgentResult> {
  const errors: string[] = [];
  let scored = 0;

  const accounts = input.accountIds
    ? await ctx.db.prospectAccount.findMany({
        where: { id: { in: input.accountIds } },
        include: { signals: true, contacts: true },
      })
    : await ctx.db.prospectAccount.findMany({
        where: {
          OR: [
            { expansionScore: null },
            { status: { in: ["NEW", "RESEARCHED"] } },
          ],
        },
        include: { signals: true, contacts: true },
        take: 50,
      });

  if (accounts.length === 0) {
    return {
      success: true,
      summary: "No accounts to score",
      counts: { scored: 0 },
      errors: [],
    };
  }

  // Batch accounts for Claude (up to 10 at a time)
  const batches: (typeof accounts)[] = [];
  for (let i = 0; i < accounts.length; i += 10) {
    batches.push(accounts.slice(i, i + 10));
  }

  for (const batch of batches) {
    try {
      const systemPrompt = buildQualificationPrompt();
      const userMessage = `Score these accounts:\n\n${batch
        .map(
          (a: any) =>
            `Account ID: ${a.id}
Name: ${a.name}
Industry: ${a.industry ?? "Unknown"}
Locations: ${a.locationCount ?? "Unknown"}
Employees: ${a.employeeCount ?? "Unknown"}
Revenue: ${a.annualRevenue ?? "Unknown"}
Signals (${a.signals.length}):
${a.signals.map((s: any) => `  - [${s.type}] ${s.title} (confidence: ${s.confidence ?? "N/A"})`).join("\n")}
Contacts found: ${a.contacts.length}`
        )
        .join("\n\n---\n\n")}`;

      const result = await generateText({
        model: getModel(),
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxOutputTokens: 4000,
        temperature: 0.2,
      });

      let qualifications: Array<{
        accountId: string;
        score: number;
        positiveSignals: string[];
        negativeSignals: string[];
        reasoning: string;
        recommendedAction: string;
      }> = [];

      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          qualifications = data.qualifications ?? [];
        }
      } catch {
        errors.push("Failed to parse AI qualification response");
        continue;
      }

      for (const q of qualifications) {
        try {
          const account = batch.find((a: any) => a.id === q.accountId);
          if (!account) continue;

          const score = Math.max(0, Math.min(100, q.score));

          await ctx.db.qualificationScore.create({
            data: {
              accountId: q.accountId,
              score,
              positiveSignals: q.positiveSignals,
              negativeSignals: q.negativeSignals,
              reasoning: q.reasoning,
              recommendedAction: q.recommendedAction,
            },
          });

          let newStatus = account.status;
          if (score >= 60) newStatus = "QUALIFIED";
          else if (score < 30) newStatus = "DISQUALIFIED";
          else newStatus = "NURTURE";

          // Don't downgrade status if already further in pipeline
          const statusOrder = ["NEW", "RESEARCHED", "QUALIFIED", "OUTREACH", "MEETING_BOOKED", "DISQUALIFIED", "NURTURE"];
          const currentIdx = statusOrder.indexOf(account.status);
          const newIdx = statusOrder.indexOf(newStatus);
          if (newIdx <= currentIdx && account.status !== "NEW" && account.status !== "RESEARCHED") {
            newStatus = account.status;
          }

          await ctx.db.prospectAccount.update({
            where: { id: q.accountId },
            data: {
              expansionScore: score,
              status: newStatus as "NEW" | "RESEARCHED" | "QUALIFIED" | "OUTREACH" | "MEETING_BOOKED" | "DISQUALIFIED" | "NURTURE",
            },
          });

          scored++;
        } catch (error) {
          errors.push(`Failed to save score for ${q.accountId}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      errors.push(`Batch scoring failed: ${(error as Error).message}`);
    }
  }

  return {
    success: errors.length === 0,
    summary: `Scored ${scored} accounts out of ${accounts.length}`,
    counts: { scored, total: accounts.length },
    errors,
  };
}
