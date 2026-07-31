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
process.env.API_KEYS = "test_key_1,test_key_2";
process.env.ANTHROPIC_API_KEY = "";
process.env.LOG_LEVEL = "silent";
process.env.MAX_CONCURRENT_JOBS = "4";
process.env.JOB_TIMEOUT_SECONDS = "30";
