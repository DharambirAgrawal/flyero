/**
 * Central config. Every environment value is read here exactly once so that no
 * module reaches into process.env directly (AGENTS.md: config via .env only).
 */
import "dotenv/config";
import { resolve } from "node:path";

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var ${name} (see .env.example)`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number, got ${JSON.stringify(v)}`);
  return n;
}

function list(name: string, fallback: string[] = []): string[] {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type Risk = "safe" | "studio" | "experimental";

export const config = {
  env: str("NODE_ENV", "development"),
  port: num("PORT", 8080),
  logLevel: str("LOG_LEVEL", "info"),
  apiKeys: list("API_KEYS", ["dev_key_change_me"]),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  /** Stock photography. Absent is a valid state — search reports itself unconfigured. */
  pexelsApiKey: process.env.PEXELS_API_KEY ?? "",
  models: {
    planner: str("LLM_PLANNER_MODEL", "claude-sonnet-4-5"),
    vision: str("LLM_VISION_MODEL", "claude-sonnet-4-5"),
    cheap: str("LLM_CHEAP_MODEL", "claude-haiku-4-5"),
  },

  lineagesPerRun: num("LINEAGES_PER_RUN", 3),
  maxRevisionLoops: num("MAX_REVISION_LOOPS", 3),
  maxOuterRestarts: num("MAX_OUTER_RESTARTS", 1),
  defaultRisk: str("DEFAULT_RISK", "studio") as Risk,
  jobTimeoutSeconds: num("JOB_TIMEOUT_SECONDS", 240),
  maxVisionCallsPerJob: num("MAX_VISION_CALLS_PER_JOB", 10),

  maxConcurrentJobs: num("MAX_CONCURRENT_JOBS", 2),
  maxDailyUsd: num("MAX_DAILY_USD", 20),
  costAlertUsdPerFlyer: num("COST_ALERT_USD_PER_FLYER", 1.5),

  databasePath: resolve(str("DATABASE_PATH", "./data/flyero.db")),
  storageDir: resolve(str("STORAGE_DIR", "./data/objects")),

  renderEngine: str("RENDER_ENGINE", "resvg"),
  renderScale: num("RENDER_SCALE", 2),
  fontsDir: resolve(str("FONTS_DIR", "./assets/fonts")),
  /** Ceiling on what an asset may occupy *after* normalisation. */
  maxAssetBytes: num("MAX_ASSET_BYTES", 10 * 1024 * 1024),
  /**
   * Ceiling on what may be uploaded. Deliberately much larger than
   * MAX_ASSET_BYTES: a phone photo is routinely 20–40MB, and the store
   * downscales it to canvas resolution on ingest. Rejecting it at the wire
   * would mean rejecting normal user input for being normal.
   */
  maxUploadBytes: num("MAX_UPLOAD_BYTES", 64 * 1024 * 1024),
  allowedAssetMime: list("ALLOWED_ASSET_MIME", [
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
  ]),

  mcpTransport: str("MCP_TRANSPORT", "stdio"),
  flyeroApiUrl: str("FLYERO_API_URL", "http://localhost:8080"),
  flyeroApiKey: str("FLYERO_API_KEY", "dev_key_change_me"),
  webhookSigningSecret: process.env.WEBHOOK_SIGNING_SECRET ?? "",
} as const;

export const CANVAS = { w: 1080, h: 1350, safe: 64 } as const;

/** True when we can make real model calls. Tests and offline dev run without it. */
export function hasLlm(): boolean {
  return config.anthropicApiKey.length > 0;
}
