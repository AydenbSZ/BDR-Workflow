import { db } from "@/lib/db";
import type { AgentFn, AgentResult } from "./types";

export async function runAgent<TInput>(
  agentName: string,
  agentFn: AgentFn<TInput>,
  input: TInput,
  triggeredBy: string
): Promise<{ runId: string; resultPromise: Promise<AgentResult> }> {
  const run = await db.agentRun.create({
    data: {
      agentName,
      status: "RUNNING",
      triggeredBy,
      inputSummary: JSON.stringify(input).slice(0, 2000),
    },
  });

  const resultPromise = executeAgent(run.id, agentName, agentFn, input, triggeredBy);

  return { runId: run.id, resultPromise };
}

async function executeAgent<TInput>(
  runId: string,
  agentName: string,
  agentFn: AgentFn<TInput>,
  input: TInput,
  triggeredBy: string
): Promise<AgentResult> {
  const ctx = { runId, triggeredBy, db };

  try {
    const result = await agentFn(ctx, input);

    await db.agentRun.update({
      where: { id: runId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        outputSummary: result.summary.slice(0, 2000),
        accountsFound: result.counts.accountsFound ?? 0,
        contactsFound: result.counts.contactsFound ?? 0,
        errorsCount: result.errors.length,
        errorDetails: result.errors.length > 0 ? result.errors : undefined,
      },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await db.agentRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        outputSummary: `Failed: ${message}`.slice(0, 2000),
        errorsCount: 1,
        errorDetails: [message],
      },
    });

    return {
      success: false,
      summary: `Agent ${agentName} failed: ${message}`,
      counts: {},
      errors: [message],
    };
  }
}

export async function getAgentStatus(agentName: string) {
  const [lastRun, runningNow] = await Promise.all([
    db.agentRun.findFirst({
      where: { agentName },
      orderBy: { startedAt: "desc" },
    }),
    db.agentRun.findFirst({
      where: { agentName, status: "RUNNING" },
    }),
  ]);

  return { lastRun, isRunning: !!runningNow };
}

export async function getAllAgentStatuses() {
  const agentNames = [
    "account-finder",
    "contact-finder",
    "qualification",
    "execution",
    "personalization",
    "daily-briefing",
  ];

  const statuses: Record<string, { lastRun: unknown; isRunning: boolean }> = {};

  await Promise.all(
    agentNames.map(async (name) => {
      statuses[name] = await getAgentStatus(name);
    })
  );

  return statuses;
}
