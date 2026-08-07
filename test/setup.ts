import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Tests get their own database and object store, and deliberately no API key:
 * the suite must never spend money or touch the developer's real data. The
 * live end-to-end run is a separate, explicit script.
 */
const root = mkdtempSync(join(tmpdir(), "flyero-test-"));

process.env.DATABASE_PATH = join(root, "test.db");
process.env.STORAGE_DIR = join(root, "objects");
// Cleared even if the developer's .env sets it for the real Render deploy —
// tests must never touch the production Neon database.
process.env.DATABASE_URL = "";
process.env.API_KEYS = "test_key_1,test_key_2";
// The MCP server's own tools call the REST API over real loopback fetch
// (config.flyeroApiUrl/flyeroApiKey — "how the process talks to itself"),
// authenticating with this key. It defaults to "dev_key_change_me", which
// is not in API_KEYS above, so any MCP tool that wraps a REST call (
// upload_asset, export_flyer, …) 401'd against its own server in every test
// — until now masked by whichever key an incidental stale local dev server
// happened to be running with, not by this actually being wired correctly.
process.env.FLYERO_API_KEY = "test_key_1";
process.env.ANTHROPIC_API_KEY = "";
process.env.LOG_LEVEL = "silent";
process.env.MAX_CONCURRENT_JOBS = "4";
process.env.JOB_TIMEOUT_SECONDS = "30";
