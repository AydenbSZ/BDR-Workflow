import { generateText, streamText, type ModelMessage } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { readFileSync } from "fs";
import { resolve } from "path";

type AIProvider = "anthropic" | "openai";

// Read .env file directly to avoid conflicts with system env vars
function readEnvKey(key: string): string {
  // First check process.env (may be set correctly by Next.js)
  const val = process.env[key];
  if (val && val.length > 5) return val;

  // Fallback: parse .env file directly
  try {
    const envPath = resolve(process.cwd(), ".env");
    const content = readFileSync(envPath, "utf-8");
    const match = content.match(new RegExp(`^${key}="?([^"\\n]+)"?`, "m"));
    if (match) return match[1];
  } catch {
    // ignore
  }
  return val || "";
}

function getProvider(): AIProvider {
  return (process.env.AI_PROVIDER as AIProvider) || "anthropic";
}

let _anthropic: ReturnType<typeof createAnthropic> | null = null;
let _openai: ReturnType<typeof createOpenAI> | null = null;

function getAnthropicProvider() {
  if (!_anthropic) {
    const apiKey = readEnvKey("ANTHROPIC_API_KEY");
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set in .env");
    _anthropic = createAnthropic({
      apiKey,
      baseURL: "https://api.anthropic.com/v1",
    });
  }
  return _anthropic;
}

function getOpenAIProvider() {
  if (!_openai) {
    const apiKey = readEnvKey("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY not set in .env");
    _openai = createOpenAI({ apiKey });
  }
  return _openai;
}

function getModel() {
  const provider = getProvider();
  if (provider === "openai") {
    return getOpenAIProvider()("gpt-4o");
  }
  return getAnthropicProvider()("claude-sonnet-4-20250514");
}

function getEmbeddingInfo() {
  const provider = process.env.EMBEDDING_PROVIDER || "none";
  return { provider, available: provider !== "none" };
}

export async function generateRoleplayResponse(
  systemPrompt: string,
  messages: ModelMessage[]
) {
  const model = getModel();
  return streamText({
    model,
    system: systemPrompt,
    messages,
    maxOutputTokens: 300,
    temperature: 0.8,
  });
}

export async function scorePracticeSession(
  systemPrompt: string,
  transcript: string
): Promise<string> {
  const model = getModel();
  const result = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: transcript }],
    maxOutputTokens: 4000,
    temperature: 0.3,
  });
  return result.text;
}

export async function summarizeCall(callBody: string): Promise<string> {
  const model = getModel();
  const result = await generateText({
    model,
    system:
      "Summarize this sales call in 2-3 sentences. Focus on the key outcome, objections raised, and approach used.",
    messages: [{ role: "user", content: callBody }],
    maxOutputTokens: 300,
    temperature: 0.3,
  });
  return result.text;
}

export async function embedText(text: string): Promise<number[] | null> {
  const { provider, available } = getEmbeddingInfo();
  if (!available) return null;

  if (provider === "openai") {
    const apiKey = readEnvKey("OPENAI_API_KEY");
    if (!apiKey) return null;
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        model: "text-embedding-3-small",
      }),
    });
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  }

  return null;
}

export function isAIConfigured(): boolean {
  const provider = getProvider();
  if (provider === "anthropic") return !!readEnvKey("ANTHROPIC_API_KEY");
  if (provider === "openai") return !!readEnvKey("OPENAI_API_KEY");
  return false;
}
