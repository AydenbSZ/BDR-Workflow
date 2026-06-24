import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { AgentContext, AgentResult } from "./types";
import { buildDailyBriefingPrompt } from "./prompts/daily-briefing";
import { sendMessage, buildBriefingBlocks, isSlackConfigured } from "@/lib/slack/client";

function getModel() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const anthropic = createAnthropic({ apiKey });
  return anthropic("claude-sonnet-4-20250514");
}

export async function dailyBriefing(
  ctx: AgentContext,
): Promise<AgentResult> {
  const errors: string[] = [];

  // Gather pipeline data
  const [accounts, recentSignals, pendingOutreach, staleOutreach] = await Promise.all([
    ctx.db.prospectAccount.findMany({
      where: { status: { notIn: ["DISQUALIFIED"] } },
      include: {
        contacts: { where: { isPrimary: true } },
        signals: { orderBy: { createdAt: "desc" }, take: 3 },
      },
      orderBy: { expansionScore: "desc" },
      take: 100,
    }),
    ctx.db.expansionSignal.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      include: { account: true },
      orderBy: { createdAt: "desc" },
    }),
    ctx.db.outreachQueue.findMany({
      where: { status: "PENDING" },
      include: { contact: { include: { account: true } } },
    }),
    ctx.db.outreachQueue.findMany({
      where: {
        status: "SENT",
        sentAt: { lte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      },
      include: { contact: { include: { account: true } } },
    }),
  ]);

  const systemPrompt = buildDailyBriefingPrompt();
  const userMessage = `Generate today's daily briefing based on this pipeline data:

## Accounts (${accounts.length} total, sorted by score)
${accounts
  .slice(0, 50)
  .map(
    (a: any) =>
      `- ${a.name} | Score: ${a.expansionScore ?? "unscored"} | Status: ${a.status} | Locations: ${a.locationCount ?? "?"} | Signals: ${a.signals.length}${a.contacts[0] ? ` | Contact: ${a.contacts[0].firstName} ${a.contacts[0].lastName} (${a.contacts[0].title})` : ""}`
  )
  .join("\n")}

## Recent Signals (last 7 days: ${recentSignals.length})
${recentSignals
  .slice(0, 20)
  .map((s: any) => `- [${s.type}] ${s.account.name}: ${s.title}`)
  .join("\n")}

## Pending Outreach (${pendingOutreach.length} items awaiting approval)
${pendingOutreach
  .slice(0, 10)
  .map((o: any) => `- ${o.type} to ${o.contact.firstName} ${o.contact.lastName} at ${o.contact.account.name}`)
  .join("\n")}

## Stale Outreach (sent 3+ days ago, no follow-up: ${staleOutreach.length})
${staleOutreach
  .slice(0, 10)
  .map((o: any) => `- ${o.type} to ${o.contact.firstName} ${o.contact.lastName} at ${o.contact.account.name} (sent ${o.sentAt?.toISOString().split("T")[0]})`)
  .join("\n")}`;

  let briefingData: {
    tier1: Array<{ accountId: string; accountName: string; score: number; topSignal?: string; action?: string; contactName?: string; contactTitle?: string }>;
    tier2: Array<{ accountId: string; accountName: string; score: number; topSignal?: string }>;
    tier3: Array<{ accountId: string; accountName: string; score: number }>;
    callList: Array<{ contactId: string; contactName: string; contactTitle?: string; accountName: string; phone?: string; talkingPoints?: string; priority: number }>;
    emailList: Array<{ contactId: string; contactName: string; accountName: string; priority: number; reason?: string }>;
    followUps: Array<{ contactId: string; contactName: string; accountName: string; lastActivity?: string; recommendedAction?: string }>;
    summary: string;
  } | null = null;

  try {
    const result = await generateText({
      model: getModel(),
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      maxOutputTokens: 6000,
      temperature: 0.3,
    });

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      briefingData = JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    errors.push(`AI briefing generation failed: ${(error as Error).message}`);
  }

  if (!briefingData) {
    return {
      success: false,
      summary: "Failed to generate briefing",
      counts: {},
      errors: errors.length > 0 ? errors : ["No briefing data produced"],
    };
  }

  // Save to database
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    await ctx.db.dailyBriefing.upsert({
      where: { date: today },
      create: {
        date: today,
        tier1Json: briefingData.tier1,
        tier2Json: briefingData.tier2,
        tier3Json: briefingData.tier3,
        callListJson: briefingData.callList,
        emailListJson: briefingData.emailList,
        followUpsJson: briefingData.followUps,
        generatedBy: ctx.runId,
      },
      update: {
        tier1Json: briefingData.tier1,
        tier2Json: briefingData.tier2,
        tier3Json: briefingData.tier3,
        callListJson: briefingData.callList,
        emailListJson: briefingData.emailList,
        followUpsJson: briefingData.followUps,
        generatedBy: ctx.runId,
      },
    });
  } catch (error) {
    errors.push(`Failed to save briefing: ${(error as Error).message}`);
  }

  // Send to Slack
  if (isSlackConfigured()) {
    try {
      const blocks = buildBriefingBlocks({
        date: today.toISOString().split("T")[0],
        tier1: briefingData.tier1.map((a) => ({
          name: a.accountName,
          score: a.score,
          topSignal: a.topSignal,
          action: a.action,
          contactName: a.contactName,
          contactTitle: a.contactTitle,
        })),
        tier2: briefingData.tier2.map((a) => ({
          name: a.accountName,
          score: a.score,
          topSignal: a.topSignal,
        })),
        tier3: briefingData.tier3.map((a) => ({
          name: a.accountName,
          score: a.score,
        })),
        callCount: briefingData.callList.length,
        emailCount: briefingData.emailList.length,
        followUpCount: briefingData.followUps.length,
      });

      await sendMessage(blocks, `BDR Daily Brief — ${today.toISOString().split("T")[0]}`);

      await ctx.db.dailyBriefing.update({
        where: { date: today },
        data: { slackSent: true },
      });
    } catch (error) {
      errors.push(`Slack send failed: ${(error as Error).message}`);
    }
  }

  return {
    success: errors.length === 0,
    summary: briefingData.summary ?? `Briefing generated: ${briefingData.tier1.length} Tier 1, ${briefingData.tier2.length} Tier 2, ${briefingData.tier3.length} Tier 3`,
    counts: {
      tier1: briefingData.tier1.length,
      tier2: briefingData.tier2.length,
      tier3: briefingData.tier3.length,
      calls: briefingData.callList.length,
      emails: briefingData.emailList.length,
      followUps: briefingData.followUps.length,
    },
    errors,
  };
}
