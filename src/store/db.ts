import Database from "better-sqlite3";
import { Pool, type QueryResult } from "pg";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

/**
 * The job/asset store, on one of two backends.
 *
 * SQLite (`better-sqlite3`, a local file) when `DATABASE_URL` is unset —
 * this is local dev and `npm test`, and it must keep working with zero setup.
 * Postgres (`pg`) when it is set — this is production. Render's filesystem is
 * ephemeral and this repo provisions no persistent disk, so a SQLite file
 * there is wiped on every deploy; the whole reason this file has two backends
 * is that AGENTS.md law 10 (the process log is never deleted) cannot hold
 * against a filesystem that gets discarded out from under it.
 *
 * Every caller writes ONE dialect of SQL — Postgres-style `$1, $2, ...`
 * placeholders — through `dbRun`/`dbAll`/`dbGet` below. For the SQLite path
 * those get translated positionally to `?`; nobody writing a query needs to
 * know which backend is live. The schema itself needs no such translation:
 * it was already written to avoid SQLite-only syntax (see the comment that
 * used to sit here), so the same `CREATE TABLE` text runs unmodified on both.
 */

export const usingPostgres = config.databaseUrl.length > 0;

let sqliteDb: Database.Database | null = null;
let pgPool: Pool | null = null;

function getSqlite(): Database.Database {
  if (sqliteDb) return sqliteDb;
  mkdirSync(dirname(config.databasePath), { recursive: true });
  sqliteDb = new Database(config.databasePath);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.pragma("foreign_keys = ON");
  return sqliteDb;
}

function getPool(): Pool {
  if (pgPool) return pgPool;
  pgPool = new Pool({ connectionString: config.databaseUrl, max: 5 });
  return pgPool;
}

/**
 * `$1, $2, ...` (Postgres) → `?` (SQLite). Postgres lets a query reuse the same
 * `$N` more than once (e.g. `created_at, updated_at) VALUES (..., $11, $11)`);
 * SQLite's `?` is positional only, so each occurrence needs its own bound
 * value. Expand params by placeholder NUMBER rather than by position so both
 * dialects accept the exact same query text and params array.
 */
function toSqlite(sql: string, params: unknown[]): { sql: string; params: unknown[] } {
  const expanded: unknown[] = [];
  const text = sql.replace(/\$(\d+)/g, (_match, n: string) => {
    expanded.push(params[Number(n) - 1]);
    return "?";
  });
  return { sql: text, params: expanded };
}

let migrated = false;

/** Every exported function below calls this first; it is a no-op after the first call. */
async function ensureMigrated(): Promise<void> {
  if (migrated) return;
  migrated = true;
  if (usingPostgres) await migratePostgres(getPool());
  else migrateSqlite(getSqlite());
}

const SCHEMA = `
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

  /* TEXT id (a ulid), not an autoincrement integer — the one place the old
     schema was SQLite-flavoured. A ulid is sortable and unique either way,
     so both backends share the exact same DDL instead of branching for it. */
  CREATE TABLE IF NOT EXISTS cost_events (
    id            TEXT PRIMARY KEY,
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
`;

/** Columns added after their table first shipped — additive, checked before ALTER so a fresh DB and an old one converge on the same shape. */
const ADDITIVE_COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: "assets", column: "parent_id", ddl: "ALTER TABLE assets ADD COLUMN parent_id TEXT" },
  { table: "assets", column: "transforms", ddl: "ALTER TABLE assets ADD COLUMN transforms TEXT" },
  { table: "assets", column: "source", ddl: "ALTER TABLE assets ADD COLUMN source TEXT" },
  { table: "assets", column: "source_url", ddl: "ALTER TABLE assets ADD COLUMN source_url TEXT" },
  { table: "assets", column: "author", ddl: "ALTER TABLE assets ADD COLUMN author TEXT" },
  { table: "assets", column: "download_url", ddl: "ALTER TABLE assets ADD COLUMN download_url TEXT" },
  {
    table: "jobs",
    column: "format",
    ddl: "ALTER TABLE jobs ADD COLUMN format TEXT NOT NULL DEFAULT 'portrait-4x5'",
  },
  {
    table: "batches",
    column: "format",
    ddl: "ALTER TABLE batches ADD COLUMN format TEXT NOT NULL DEFAULT 'portrait-4x5'",
  },
];

function migrateSqlite(database: Database.Database): void {
  database.exec(SCHEMA);
  for (const col of ADDITIVE_COLUMNS) {
    const cols = database.prepare(`PRAGMA table_info(${col.table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === col.column)) database.exec(col.ddl);
  }
}

async function migratePostgres(pool: Pool): Promise<void> {
  await pool.query(SCHEMA);
  for (const col of ADDITIVE_COLUMNS) {
    const res = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
      [col.table, col.column],
    );
    if (res.rows.length === 0) await pool.query(col.ddl);
  }
}

/** Statements that don't return rows — INSERT/UPDATE/DELETE/DDL. */
export async function dbRun(sql: string, params: unknown[] = []): Promise<void> {
  await ensureMigrated();
  if (usingPostgres) {
    await getPool().query(sql, params);
    return;
  }
  const converted = toSqlite(sql, params);
  getSqlite().prepare(converted.sql).run(...(converted.params as never[]));
}

/** SELECTs returning any number of rows. */
export async function dbAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureMigrated();
  if (usingPostgres) {
    const res: QueryResult = await getPool().query(sql, params);
    return res.rows as T[];
  }
  const converted = toSqlite(sql, params);
  return getSqlite().prepare(converted.sql).all(...(converted.params as never[])) as T[];
}

/** SELECTs expecting zero or one row. */
export async function dbGet<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await dbAll<T>(sql, params);
  return rows[0] ?? null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Test seam — closes and forgets both handles so a fresh DATABASE_PATH/DATABASE_URL takes effect. */
export function closeDb(): void {
  sqliteDb?.close();
  sqliteDb = null;
  void pgPool?.end();
  pgPool = null;
  migrated = false;
}
