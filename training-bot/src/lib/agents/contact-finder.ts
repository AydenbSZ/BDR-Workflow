import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { AgentContext, AgentResult } from "./types";
import { ICP_CONFIG } from "./types";
import { buildContactFinderPrompt } from "./prompts/contact-finder";
import { searchPeople, isApolloConfigured } from "@/lib/apollo/client";
import { searchContacts } from "@/lib/hubspot/client";

function getModel() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const anthropic = createAnthropic({ apiKey });
  return anthropic("claude-sonnet-4-20250514");
}

interface ContactFinderInput {
  accountIds?: string[];
}

export async function contactFinder(
  ctx: AgentContext,
  input: ContactFinderInput
): Promise<AgentResult> {
  const errors: string[] = [];
  let contactsFound = 0;

  // Get accounts to research
  const accounts = input.accountIds
    ? await ctx.db.prospectAccount.findMany({
        where: { id: { in: input.accountIds } },
        include: { signals: true, contacts: true },
      })
    : await ctx.db.prospectAccount.findMany({
        where: {
          status: { in: ["NEW", "RESEARCHED"] },
          expansionScore: { gte: 50 },
        },
        include: { signals: true, contacts: true },
        orderBy: { expansionScore: "desc" },
        take: 20,
      });

  if (accounts.length === 0) {
    // If no scored accounts, take newest accounts
    const fallbackAccounts = await ctx.db.prospectAccount.findMany({
      where: { status: "NEW" },
      include: { signals: true, contacts: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (fallbackAccounts.length === 0) {
      return {
        success: true,
        summary: "No accounts to research",
        counts: { contactsFound: 0 },
        errors: [],
      };
    }
    accounts.push(...fallbackAccounts);
  }

  for (const account of accounts) {
    try {
      if (!isApolloConfigured()) {
        errors.push(`Apollo not configured — skipping ${account.name}`);
        continue;
      }

      const domain = account.domain;
      if (!domain) {
        errors.push(`No domain for ${account.name} — skipping`);
        continue;
      }

      // Search Apollo for contacts
      const allTitles = [
        ...ICP_CONFIG.targetTitles.primary,
        ...ICP_CONFIG.targetTitles.secondary,
      ];

      const apolloResult = await searchPeople({
        organizationDomains: [domain],
        personTitles: allTitles,
        personSeniorities: [...ICP_CONFIG.apolloSeniorities],
        limit: 10,
      });

      if (apolloResult.people.length === 0) {
        continue;
      }

      // Use Claude to rank and extract personalization
      const systemPrompt = buildContactFinderPrompt();
      const userMessage = `Company: ${account.name} (${account.domain})
Industry: ${account.industry ?? "Unknown"}
Locations: ${account.locationCount ?? "Unknown"}
Signals: ${account.signals.map((s: { title: string }) => s.title).join("; ")}

Apollo contacts found:
${apolloResult.people
  .map(
    (p) =>
      `- ${p.first_name} ${p.last_name} | ${p.title} | ${p.email ?? "no email"} | ${p.linkedin_url ?? "no linkedin"} | Seniority: ${p.seniority}`
  )
  .join("\n")}`;

      const result = await generateText({
        model: getModel(),
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxOutputTokens: 2000,
        temperature: 0.2,
      });

      let rankedContacts: Array<{
        firstName: string;
        lastName: string;
        title: string;
        email?: string;
        phone?: string;
        linkedinUrl?: string;
        seniority?: string;
        isPrimary: boolean;
        personalizationAngles: string[];
      }> = [];

      try {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          rankedContacts = data.contacts ?? [];
        }
      } catch {
        // Fall back to using Apollo data directly
        rankedContacts = apolloResult.people.slice(0, 3).map((p, i) => ({
          firstName: p.first_name ?? "",
          lastName: p.last_name ?? "",
          title: p.title ?? "",
          email: p.email ?? undefined,
          phone: p.phone_numbers?.[0]?.raw_number,
          linkedinUrl: p.linkedin_url ?? undefined,
          seniority: p.seniority ?? undefined,
          isPrimary: i === 0,
          personalizationAngles: [],
        }));
      }

      // Save contacts, dedup against HubSpot
      for (const contact of rankedContacts) {
        try {
          // Check HubSpot for existing contact
          let hubspotContactId: string | undefined;
          if (contact.email) {
            try {
              const existing = await searchContacts([
                { propertyName: "email", operator: "EQ", value: contact.email },
              ]);
              if (existing.results.length > 0) {
                hubspotContactId = existing.results[0].id;
              }
            } catch {
              // Continue without HubSpot dedup
            }
          }

          // Check if already in our DB
          const existingContact = contact.email
            ? await ctx.db.prospectContact.findFirst({
                where: { email: contact.email, accountId: account.id },
              })
            : null;

          const apolloPerson = apolloResult.people.find(
            (p) =>
              p.email === contact.email ||
              (p.first_name === contact.firstName && p.last_name === contact.lastName)
          );

          if (!existingContact) {
            await ctx.db.prospectContact.create({
              data: {
                accountId: account.id,
                firstName: contact.firstName,
                lastName: contact.lastName,
                title: contact.title,
                email: contact.email,
                phone: contact.phone,
                linkedinUrl: contact.linkedinUrl,
                apolloContactId: apolloPerson?.id,
                hubspotContactId,
                seniority: contact.seniority,
                isPrimary: contact.isPrimary,
                personalizationJson: contact.personalizationAngles.length > 0
                  ? { angles: contact.personalizationAngles }
                  : undefined,
              },
            });
            contactsFound++;
          }
        } catch (error) {
          errors.push(
            `Failed to save contact ${contact.firstName} ${contact.lastName}: ${(error as Error).message}`
          );
        }
      }

      // Update account status
      if (account.status === "NEW") {
        await ctx.db.prospectAccount.update({
          where: { id: account.id },
          data: { status: "RESEARCHED", lastResearchedAt: new Date() },
        });
      }
    } catch (error) {
      errors.push(`Failed for ${account.name}: ${(error as Error).message}`);
    }
  }

  return {
    success: errors.length === 0,
    summary: `Found ${contactsFound} contacts across ${accounts.length} accounts`,
    counts: { contactsFound, accountsProcessed: accounts.length },
    errors,
  };
}
