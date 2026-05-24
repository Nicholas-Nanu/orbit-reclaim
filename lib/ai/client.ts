import Anthropic from "@anthropic-ai/sdk";

// Single source of truth for AI calls. We use the Anthropic SDK pointed at
// DeepSeek's Anthropic-compatible endpoint (https://api.deepseek.com/anthropic).
// See CLAUDE.md §2/§7.
export const AI_MODEL = process.env.AI_MODEL ?? "deepseek-v4-flash";

const BASE_URL =
  process.env.ANTHROPIC_BASE_URL ?? "https://api.deepseek.com/anthropic";

let cached: Anthropic | null = null;

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local.");
  }
  cached ??= new Anthropic({ apiKey, baseURL: BASE_URL });
  return cached;
}

/**
 * Reasoning-effort tiers. DeepSeek-V4-Flash supports thinking modes, but the
 * Anthropic-compatible endpoint doesn't reliably expose OpenAI-style
 * `reasoning_effort`, so we model effort as a token budget: heavier modes get a
 * larger budget for more thorough answers. (Swapping in true thinking-mode
 * params later is a one-line change here.)
 */
export type ReasoningEffort = "off" | "high" | "max";

export function effortParams(effort: ReasoningEffort): { max_tokens: number } {
  switch (effort) {
    case "max":
      return { max_tokens: 8192 };
    case "high":
      return { max_tokens: 4096 };
    default:
      return { max_tokens: 1024 };
  }
}

/**
 * Streams a completion as plain-text chunks (async generator of token strings).
 * Centralizes the Anthropic streaming-event handling used by the AI routes.
 */
export async function* streamText(args: {
  system: string;
  user: string;
  effort: ReasoningEffort;
}): AsyncGenerator<string> {
  const client = getClient();
  const stream = (await client.messages.create({
    model: AI_MODEL,
    ...effortParams(args.effort),
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    stream: true,
  })) as unknown as AsyncIterable<{
    type: string;
    delta?: { type: string; text?: string };
  }>;

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta" &&
      event.delta.text
    ) {
      yield event.delta.text;
    }
  }
}
