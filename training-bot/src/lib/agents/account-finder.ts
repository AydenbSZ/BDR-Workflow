import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { AgentContext, AgentResult } from "./types";
import { ICP_CONFIG } from "./types";
import { buildAccountFinderPrompt } from "./prompts/account-finder";
import { searchNews, searchGoogle } from "@/lib/search/client";
import { searchCompanies } from "@/lib/hubspot/client";
import { searchOrganizations } from "@/lib/apollo/client";

function getModel() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const anthropic = createAnthropic({ apiKey });
  return anthropic("claude-sonnet-4-20250514");
}

interface AccountFinderInput {
  queries?: string[];
  maxResults?: number;
}

interface ParsedAccount {
  name: string;
  domain?: string;
  industry?: string;
  subIndustry?: string;
  locationCount?: number;
  headquarters?: string;
  signals: Array<{
    type: string;
    title: string;
    description?: string;
    url?: string;
    confidence?: number;
    signalDate?: string;
  }>;
  messagingAngle?: string;
}

export async function accountFinder(
  ctx: AgentContext,
  input: AccountFinderInput
): Promise<AgentResult> {
  const errors: string[] = [];
  let accountsFound = 0;
  let signalsFound = 0;

  const queries = input.queries ?? [...ICP_CONFIG.searchQueries];
  const allSearchResults: string[] = [];

  // Step 1: Run search queries
  for (const query of queries.slice(0, 10)) {
    try {
      const [newsResults, webResults] = await Promise.all([
        searchNews(query, 5).catch(() => []),
        searchGoogle(query, 5).catch(() => []),
      ]);

      for (const r of newsResults) {
        allSearchResults.push(
          `[NEWS] ${r.title}\nSource: ${r.source} | Date: ${r.date}\nSnippet: ${r.snippet}\nURL: ${r.link}`
        );
      }
      for (const r of webResults) {
        allSearchResults.push(
          `[WEB] ${r.title}\nSnippet: ${r.snippet}\nURL: ${r.link}`
        );
      }
    } catch (error) {
      errors.push(`Search failed for "${query}": ${(error as Error).message}`);
    }
  }

  if (allSearchResults.length === 0) {
    return {
      success: false,
      summary: "No search results found",
      counts: { accountsFound: 0, signalsFound: 0 },
      errors: errors.length > 0 ? errors : ["No search results returned"],
    };
  }

  // Step 2: Send to Claude for extraction
  const systemPrompt = buildAccountFinderPrompt();
  const userMessage = `Analyze these search results and extract ICP accounts with expansion signals:\n\n${allSearchResults.slice(0, 50).join("\n\n---\n\n")}`;

  let parsed: ParsedAccount[] = [];
  try {
    const result = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxOutputTokens: 4000,
      temperature: 0.2,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0]);
      parsed = data.accounts ?? [];
    }
  } catch (error) {
    errors.push(`AI extraction failed: ${(error as Error).message}`);
  }

  // Step 3: Deduplicate against HubSpot and enrich via Apollo
  for (const account of parsed) {
    try {
      // Check HubSpot for existing company
      let hubspotCompanyId: string | undefined;
      if (account.domain) {
        try {
          const existing = await searchCompanies([
            { propertyName: "domain", operator: "EQ", value: account.domain },
          ]);
          if (existing.results.length > 0) {
            hubspotCompanyId = existing.results[0].id;
          }
        } catch {
          // HubSpot search failed — continue without dedup
        }
      }

      // Check if already in our DB
      const existingAccount = account.domain
        ? await ctx.db.prospectAccount.findFirst({
            where: { domain: account.domain },
          })
        : await ctx.db.prospectAccount.findFirst({
            where: { name: account.name },
          });

      // Try Apollo enrichment for location count
      let apolloOrgId: string | undefined;
      let locationCount = account.locationCount;
      let employeeCount: number | undefined;
      let annualRevenue: string | undefined;

      if (account.domain || account.name) {
        try {
          const apolloResult = await searchOrganizations({
            organizationName: account.name,
            organizationDomains: account.domain ? [account.domain] : undefined,
            limit: 1,
          });
          if (apolloResult.organizations.length > 0) {
            const org = apolloResult.organizations[0];
            apolloOrgId = org.id;
            if (org.num_retail_locations) locationCount = org.num_retail_locations;
            if (org.estimated_num_employees) employeeCount = org.estimated_num_employees;
            if (org.annual_revenue_printed) annualRevenue = org.annual_revenue_printed;
          }
        } catch {
          // Apollo not configured or failed — continue
        }
      }

      if (existingAccount) {
        // Update existing account with new signals
        await ctx.db.prospectAccount.update({
          where: { id: existingAccount.id },
          data: {
            locationCount: locationCount ?? existingAccount.locationCount,
            employeeCount: employeeCount ?? existingAccount.employeeCount,
            annualRevenue: annualRevenue ?? existingAccount.annualRevenue,
            lastResearchedAt: new Date(),
          },
        });

        // Add new signals
        for (const signal of account.signals) {
          const existing = await ctx.db.expansionSignal.findFirst({
            where: {
              accountId: existingAccount.id,
              title: signal.title,
            },
          });
          if (!existing) {
            await ctx.db.expansionSignal.create({
              data: {
                accountId: existingAccount.id,
                type: mapSignalType(signal.type),
                source: "serper_search",
                title: signal.title,
                description: signal.description,
                url: signal.url,
                confidence: signal.confidence,
                signalDate: signal.signalDate ? new Date(signal.signalDate) : undefined,
              },
            });
            signalsFound++;
          }
        }
      } else {
        // Create new account
        const newAccount = await ctx.db.prospectAccount.create({
          data: {
            name: account.name,
            domain: account.domain,
            industry: account.industry,
            subIndustry: account.subIndustry,
            locationCount,
            headquarters: account.headquarters,
            employeeCount,
            annualRevenue,
            hubspotCompanyId,
            apolloOrgId,
            notes: account.messagingAngle,
            lastResearchedAt: new Date(),
          },
        });

        for (const signal of account.signals) {
          await ctx.db.expansionSignal.create({
            data: {
              accountId: newAccount.id,
              type: mapSignalType(signal.type),
              source: "serper_search",
              title: signal.title,
              description: signal.description,
              url: signal.url,
              confidence: signal.confidence,
              signalDate: signal.signalDate ? new Date(signal.signalDate) : undefined,
            },
          });
          signalsFound++;
        }

        accountsFound++;
      }
    } catch (error) {
      errors.push(`Failed to process ${account.name}: ${(error as Error).message}`);
    }
  }

  return {
    success: errors.length === 0,
    summary: `Found ${accountsFound} new accounts with ${signalsFound} expansion signals from ${allSearchResults.length} search results`,
    counts: { accountsFound, signalsFound, searchResults: allSearchResults.length },
    errors,
  };
}

function mapSignalType(type: string): "EXPANSION_ANNOUNCEMENT" | "FRANCHISE_GROWTH" | "FUNDING_ROUND" | "PE_ACQUISITION" | "DEVELOPMENT_HIRING" | "NEW_MARKET_ENTRY" | "LOCATION_CLOSURE" | "EXECUTIVE_HIRE" | "NEWS_MENTION" {
  const valid = [
    "EXPANSION_ANNOUNCEMENT", "FRANCHISE_GROWTH", "FUNDING_ROUND",
    "PE_ACQUISITION", "DEVELOPMENT_HIRING", "NEW_MARKET_ENTRY",
    "LOCATION_CLOSURE", "EXECUTIVE_HIRE", "NEWS_MENTION",
  ] as const;
  const upper = type.toUpperCase().replace(/\s+/g, "_");
  if (valid.includes(upper as (typeof valid)[number])) {
    return upper as (typeof valid)[number];
  }
  return "NEWS_MENTION";
}
