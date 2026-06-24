import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { Prisma } from "@/generated/prisma/client";
import type { AgentContext, AgentResult } from "./types";
import { buildPersonalizationPrompt } from "./prompts/personalization";
import { retrieveCompanyContext } from "@/lib/knowledge/retrieval";

function getModel() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const anthropic = createAnthropic({ apiKey });
  return anthropic("claude-sonnet-4-20250514");
}

interface PersonalizationInput {
  contactIds?: string[];
}

export async function personalization(
  ctx: AgentContext,
  input: PersonalizationInput
): Promise<AgentResult> {
  const errors: string[] = [];
  let outreachCreated = 0;

  const contacts = input.contactIds
    ? await ctx.db.prospectContact.findMany({
        where: { id: { in: input.contactIds } },
        include: { account: { include: { signals: true } } },
      })
    : await ctx.db.prospectContact.findMany({
        where: {
          personalizationJson: { equals: Prisma.JsonNull },
          account: {
            status: { in: ["QUALIFIED", "RESEARCHED"] },
            expansionScore: { gte: 50 },
          },
        },
        include: { account: { include: { signals: true } } },
        take: 20,
      });

  if (contacts.length === 0) {
    return {
      success: true,
      summary: "No contacts to personalize",
      counts: { outreachCreated: 0 },
      errors: [],
    };
  }

  // Get company context for SiteZeus positioning
  let companyContext = "";
  try {
    companyContext = await retrieveCompanyContext();
  } catch {
    companyContext = "SiteZeus is an AI-powered location intelligence platform that helps multi-unit brands make smarter expansion decisions through site selection, revenue forecasting, white-space analysis, and territory planning.";
  }

  const systemPrompt = buildPersonalizationPrompt(companyContext);

  // Process contacts in batches of 5
  const batches: (typeof contacts)[] = [];
  for (let i = 0; i < contacts.length; i += 5) {
    batches.push(contacts.slice(i, i + 5));
  }

  for (const batch of batches) {
    try {
      const userMessage = `Generate personalized outreach for these contacts:\n\n${batch
        .map(
          (c: any) =>
            `Contact ID: ${c.id}
Name: ${c.firstName} ${c.lastName}
Title: ${c.title ?? "Unknown"}
Email: ${c.email ?? "None"}
LinkedIn: ${c.linkedinUrl ?? "None"}
Company: ${c.account.name}
Industry: ${c.account.industry ?? "Unknown"}
Locations: ${c.account.locationCount ?? "Unknown"}
Expansion Signals:
${c.account.signals.map((s: any) => `  - [${s.type}] ${s.title}`).join("\n") || "  None found"}`
        )
        .join("\n\n---\n\n")}`;

      const result = await generateText({
        model: getModel(),
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxOutputTokens: 6000,
        temperature: 0.5,
      });

      let outreach: Array<{
        contactId: string;
        email: { subject: string; body: string };
        linkedin: string;
        callOpener: string;
        objections: Array<{ objection: string; context: string; response: string }>;
      }> = [];

      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          outreach = data.outreach ?? [];
        }
      } catch {
        errors.push("Failed to parse personalization response");
        continue;
      }

      for (const item of outreach) {
        try {
          const contact = batch.find((c: any) => c.id === item.contactId);
          if (!contact) continue;

          // Save personalization data
          await ctx.db.prospectContact.update({
            where: { id: contact.id },
            data: {
              personalizationJson: {
                email: item.email,
                linkedin: item.linkedin,
                callOpener: item.callOpener,
                objections: item.objections,
              },
            },
          });

          // Create outreach queue items
          if (item.email && contact.email) {
            await ctx.db.outreachQueue.create({
              data: {
                contactId: contact.id,
                type: "EMAIL",
                subject: item.email.subject,
                content: item.email.body,
                status: "PENDING",
              },
            });
            outreachCreated++;
          }

          if (item.linkedin && contact.linkedinUrl) {
            await ctx.db.outreachQueue.create({
              data: {
                contactId: contact.id,
                type: "LINKEDIN",
                content: item.linkedin,
                status: "PENDING",
              },
            });
            outreachCreated++;
          }

          if (item.callOpener) {
            await ctx.db.outreachQueue.create({
              data: {
                contactId: contact.id,
                type: "CALL",
                content: item.callOpener,
                status: "PENDING",
              },
            });
            outreachCreated++;
          }
        } catch (error) {
          errors.push(`Failed to save outreach for ${item.contactId}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      errors.push(`Batch personalization failed: ${(error as Error).message}`);
    }
  }

  return {
    success: errors.length === 0,
    summary: `Created ${outreachCreated} outreach items for ${contacts.length} contacts`,
    counts: { outreachCreated, contactsProcessed: contacts.length },
    errors,
  };
}
