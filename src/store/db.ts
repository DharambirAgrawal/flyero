import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

/**
 * SQLite job store. The schema is written to survive the Postgres migration
 * (ROADMAP L6): no SQLite-specific types, explicit timestamps, JSON in TEXT.
 */

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  mkdirSync(dirname(config.databasePath), { recursive: true });
  db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id           TEXT PRIMARY KEY,
      api_key      TEXT NOT NULL,
      kind         TEXT NOT NULL,
      mime         TEXT NOT NULL,
      bytes        INTEGER NOT NULL,
      width        INTEGER NOT NULL,
      height       INTEGER NOT NULL,
      path         TEXT NOT NULL,
      analysis     TEXT NOT NULL,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS batches (
      id           TEXT PRIMARY KEY,
      api_key      TEXT NOT NULL,
      prompt       TEXT NOT NULL,
      runs         INTEGER NOT NULL,
      risk         TEXT NOT NULL,
      format       TEXT NOT NULL DEFAULT 'portrait-4x5',
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id             TEXT PRIMARY KEY,
      api_key        TEXT NOT NULL,
      batch_id       TEXT,
      status         TEXT NOT NULL,
      stage          TEXT,
      prompt         TEXT NOT NULL,
      product_name   TEXT,
      risk           TEXT NOT NULL,
      format         TEXT NOT NULL DEFAULT 'portrait-4x5',
      brand          TEXT,
      asset_ids      TEXT NOT NULL DEFAULT '[]',
      callback_url   TEXT,
      job_seed       TEXT NOT NULL,
      revision       INTEGER NOT NULL DEFAULT 0,
      idea           TEXT,
      lineage        TEXT,
      gates          TEXT,
      below_bar      INTEGER NOT NULL DEFAULT 0,
      failed_gates   TEXT,
      reason         TEXT,
      cost_usd       REAL NOT NULL DEFAULT 0,
      llm_calls      INTEGER NOT NULL DEFAULT 0,
      error          TEXT,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL,
      FOREIGN KEY (batch_id) REFERENCES batches(id)
    );

    CREATE TABLE IF NOT EXISTS revisions (
      job_id       TEXT NOT NULL,
      revision     INTEGER NOT NULL,
      spec         TEXT NOT NULL,
      layout       TEXT NOT NULL,
      gates        TEXT NOT NULL,
      instruction  TEXT,
      created_at   TEXT NOT NULL,
      PRIMARY KEY (job_id, revision),
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    /* The process log is a future training asset — never deleted, never skipped. */
    CREATE TABLE IF NOT EXISTS process_logs (
      job_id       TEXT NOT NULL,
      revision     INTEGER NOT NULL,
      log          TEXT NOT NULL,
      created_at   TEXT NOT NULL,
      PRIMARY KEY (job_id, revision),
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );

    CREATE TABLE IF NOT EXISTS cost_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id        TEXT,
      api_key       TEXT NOT NULL,
      stage         TEXT NOT NULL,
      model         TEXT NOT NULL,
      input_tokens  INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      usd           REAL NOT NULL,
      created_at    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_api_key ON jobs(api_key, created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_batch ON jobs(batch_id);
    CREATE INDEX IF NOT EXISTS idx_cost_key_date ON cost_events(api_key, created_at);
  `);

  // Additive columns for derived (transformed) assets — originals stay immutable.
  const assetCols = database.prepare("PRAGMA table_info(assets)").all() as Array<{ name: string }>;
  const names = new Set(assetCols.map((c) => c.name));
  if (!names.has("parent_id")) {
    database.exec("ALTER TABLE assets ADD COLUMN parent_id TEXT");
  }
  if (!names.has("transforms")) {
    database.exec("ALTER TABLE assets ADD COLUMN transforms TEXT");
  }
  // Provenance for imported stock photography. Pexels requires attribution, and
  // an asset that cannot say where it came from cannot be credited.
  if (!names.has("source")) {
    database.exec("ALTER TABLE assets ADD COLUMN source TEXT");
  }
  if (!names.has("source_url")) {
    database.exec("ALTER TABLE assets ADD COLUMN source_url TEXT");
  }
  if (!names.has("author")) {
    database.exec("ALTER TABLE assets ADD COLUMN author TEXT");
  }

  // Format (canvas size) was added after `jobs`/`batches` shipped — default
  // existing rows to the size every job before this change actually rendered at.
  const jobCols = database.prepare("PRAGMA table_info(jobs)").all() as Array<{ name: string }>;
  if (!jobCols.some((c) => c.name === "format")) {
    database.exec("ALTER TABLE jobs ADD COLUMN format TEXT NOT NULL DEFAULT 'portrait-4x5'");
  }
  const batchCols = database.prepare("PRAGMA table_info(batches)").all() as Array<{ name: string }>;
  if (!batchCols.some((c) => c.name === "format")) {
    database.exec("ALTER TABLE batches ADD COLUMN format TEXT NOT NULL DEFAULT 'portrait-4x5'");
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Test seam — closes and forgets the handle so a fresh DATABASE_PATH takes effect. */
export function closeDb(): void {
  db?.close();
  db = null;
}
