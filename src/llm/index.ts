import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod/v4";
import { config } from "../config.js";
import { recordCost } from "../store/jobs.js";

/**
 * The single door to every model call (AGENTS.md: no pipeline stage may call a
 * provider SDK directly). Everything goes through here so per-job cost logging
 * is complete by construction.
 *
 * Two deliberate choices:
 *  - Structured outputs, not "parse the JSON out of the prose". The model is
 *    constrained to the schema, so the Composer's retry loop is about *content*
 *    quality, not about malformed braces.
 *  - No temperature. Current models reject sampling parameters outright, and
 *    DR-3 forbids temperature as a diversity mechanism regardless — variance
 *    comes from the Studio Sampler.
 */

export type LlmRole = "planner" | "vision" | "cheap";

/** USD per million tokens, from the model catalogue. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-4-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/**
 * `effort` is rejected outright by older models (Sonnet 4.5, Haiku 4.5), so it
 * is sent only where it exists. Keeping this as a capability check rather than
 * a hardcoded model means swapping models in .env stays a config change.
 */
const SUPPORTS_EFFORT = [
  "claude-opus-5",
  "claude-fable-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
];

function supportsEffort(model: string): boolean {
  return SUPPORTS_EFFORT.some((m) => model.startsWith(m));
}

function priceFor(model: string): { input: number; output: number } {
  const exact = PRICING[model];
  if (exact) return exact;
  // Unknown/dated variants: fall back to the closest family so cost is still
  // tracked rather than silently recorded as free.
  const family = Object.keys(PRICING).find((k) => model.startsWith(k));
  return family ? PRICING[family]! : { input: 5, output: 25 };
}

export function modelFor(role: LlmRole): string {
  return role === "vision"
    ? config.models.vision
    : role === "cheap"
      ? config.models.cheap
      : config.models.planner;
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    if (!config.anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set — LLM stages cannot run");
    }
    client = new Anthropic({ apiKey: config.anthropicApiKey });
  }
  return client;
}

export type CallContext = {
  jobId: string | null;
  apiKey: string;
  stage: string;
};

export type ImageInput = {
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  base64: string;
};

export type StructuredRequest<T> = {
  role: LlmRole;
  system: string;
  prompt: string;
  schema: ZodType<T>;
  schemaName: string;
  images?: ImageInput[];
  maxTokens?: number;
  /** low | medium | high | xhigh | max — thinking depth and overall spend. */
  effort?: "low" | "medium" | "high";
};

export class LlmRefusal extends Error {
  constructor(public readonly category: string | null) {
    super(`Model declined the request${category ? ` (${category})` : ""}`);
    this.name = "LlmRefusal";
  }
}

/**
 * One structured call. Returns data already validated against `schema`, so
 * callers never touch raw model text.
 */
export async function callStructured<T>(
  req: StructuredRequest<T>,
  ctx: CallContext,
): Promise<T> {
  const model = modelFor(req.role);
  const content: Anthropic.ContentBlockParam[] = [];

  for (const image of req.images ?? []) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.base64 },
    });
  }
  content.push({ type: "text", text: req.prompt });

  const response = await getClient().messages.parse({
    model,
    // Generous: on current models max_tokens caps thinking *plus* response text,
    // so a tight budget truncates the answer rather than the reasoning.
    max_tokens: req.maxTokens ?? 8000,
    system: req.system,
    messages: [{ role: "user", content }],
    output_config: {
      format: zodOutputFormat(req.schema as any),
      ...(req.effort && supportsEffort(model) ? { effort: req.effort } : {}),
    },
  });

  const usage = response.usage;
  const price = priceFor(model);
  const usd =
    (usage.input_tokens * price.input) / 1_000_000 +
    (usage.output_tokens * price.output) / 1_000_000;

  recordCost({
    jobId: ctx.jobId,
    apiKey: ctx.apiKey,
    stage: ctx.stage,
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    usd,
  });

  if (response.stop_reason === "refusal") {
    throw new LlmRefusal(response.stop_details?.category ?? null);
  }

  const parsed = response.parsed_output;
  if (parsed === null || parsed === undefined) {
    throw new Error(
      `Model returned no parseable output for ${req.schemaName} (stop_reason=${response.stop_reason})`,
    );
  }
  return parsed as T;
}

/** Rough token estimate for budgeting before a call is made. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.6);
}
