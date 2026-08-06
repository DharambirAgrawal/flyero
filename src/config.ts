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

  /**
   * When set, the job/asset store uses Postgres (`src/store/db.ts`) instead
   * of the local SQLite file below — the difference between surviving a
   * redeploy and not. Render's filesystem is ephemeral and this repo's
   * render.yaml provisions no persistent disk, so `databasePath` alone is
   * fine for local dev but loses every row on every production deploy.
   * Empty by default so `npm test` and local dev keep working with zero
   * setup — SQLite is not a fallback to feel bad about, it is the correct
   * choice until there is a real database to point at.
   */
  databaseUrl: process.env.DATABASE_URL ?? "",
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
  /**
   * Where the MCP adapter reaches the REST core.
   *
   * Derived from the port this process is actually listening on, not a fixed
   * 8080. When MCP is mounted in-process (the hosted connector), it calls the
   * API over loopback — and a host that assigns its own port, as Render does,
   * would otherwise send every tool call to a port with nothing on it.
   */
  /**
   * Whether rendered PNG/SVG are cached on disk.
   *
   * Off by default: rendering is deterministic, so a render is a cache, not
   * data. Measured, renders were 83% of all stored bytes. Turn on where CPU is
   * dearer than storage.
   */
  persistRenders: str("PERSIST_RENDERS", "false") === "true",

  /**
   * The origin clients reach this service on, e.g. https://flyero.onrender.com.
   *
   * Only needed when the request's own Host header cannot be trusted; normally
   * the public origin is derived per-request. Never confuse this with
   * `flyeroApiUrl`, which is how the process talks to itself over loopback.
   */
  publicUrl: str("PUBLIC_URL", ""),

  flyeroApiUrl: str("FLYERO_API_URL", `http://127.0.0.1:${num("PORT", 8080)}`),
  flyeroApiKey: str("FLYERO_API_KEY", "dev_key_change_me"),
  webhookSigningSecret: process.env.WEBHOOK_SIGNING_SECRET ?? "",
} as const;

export const CANVAS = { w: 1080, h: 1350, safe: 64 } as const;

/** True when we can make real model calls. Tests and offline dev run without it. */
export function hasLlm(): boolean {
  return config.anthropicApiKey.length > 0;
}
