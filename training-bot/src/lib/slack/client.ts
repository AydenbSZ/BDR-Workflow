interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: Array<{ type: string; text: string; emoji?: boolean }>;
  fields?: Array<{ type: string; text: string }>;
  accessory?: Record<string, unknown>;
}

function getWebhookUrl(): string {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) throw new Error("SLACK_WEBHOOK_URL is not configured");
  return url;
}

export async function sendMessage(blocks: SlackBlock[], text?: string): Promise<void> {
  const res = await fetch(getWebhookUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: text ?? "BDR Bot Update",
      blocks,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Slack webhook error ${res.status}: ${body.slice(0, 300)}`);
  }
}

interface BriefingAccount {
  name: string;
  score: number;
  topSignal?: string;
  action?: string;
  contactName?: string;
  contactTitle?: string;
}

interface BriefingData {
  date: string;
  tier1: BriefingAccount[];
  tier2: BriefingAccount[];
  tier3: BriefingAccount[];
  callCount: number;
  emailCount: number;
  followUpCount: number;
}

export function buildBriefingBlocks(briefing: BriefingData): SlackBlock[] {
  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `BDR Daily Brief — ${briefing.date}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Calls Today:* ${briefing.callCount}` },
        { type: "mrkdwn", text: `*Emails Today:* ${briefing.emailCount}` },
        { type: "mrkdwn", text: `*Follow-ups:* ${briefing.followUpCount}` },
        { type: "mrkdwn", text: `*Tier 1 Accounts:* ${briefing.tier1.length}` },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*🔥 Tier 1 — Work TODAY*",
      },
    },
  ];

  for (const acct of briefing.tier1.slice(0, 10)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${acct.name}* (Score: ${acct.score})\n${acct.topSignal ?? ""}${acct.contactName ? `\nContact: ${acct.contactName} — ${acct.contactTitle}` : ""}${acct.action ? `\n→ ${acct.action}` : ""}`,
      },
    });
  }

  if (briefing.tier2.length > 0) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📋 Tier 2 — This Week* (${briefing.tier2.length} accounts)\n${briefing.tier2.slice(0, 5).map((a) => `• ${a.name} (${a.score})`).join("\n")}${briefing.tier2.length > 5 ? `\n_...and ${briefing.tier2.length - 5} more_` : ""}`,
        },
      }
    );
  }

  if (briefing.tier3.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🌱 Tier 3 — Nurture* (${briefing.tier3.length} accounts)`,
      },
    });
  }

  return blocks;
}

export function buildSignalAlert(signal: {
  accountName: string;
  signalType: string;
  title: string;
  url?: string;
}): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*🚨 Expansion Signal Detected*\n*Account:* ${signal.accountName}\n*Signal:* ${signal.signalType}\n*${signal.title}*${signal.url ? `\n<${signal.url}|Read more>` : ""}`,
      },
    },
  ];
}

export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_WEBHOOK_URL;
}
