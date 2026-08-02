/**
 * Reclaims storage that does not need to exist.
 *
 * Two kinds of waste accumulate:
 *
 *  - **Cached renders.** A render is reproducible from its spec — same spec,
 *    seed and assets always give identical bytes — so a stored PNG or SVG is a
 *    cache, not data. Measured on real usage they were 83% of everything.
 *  - **Orphaned assets.** An image imported for a flyer that was never composed,
 *    or whose flyer has since gone, is bytes nobody can reach.
 *
 * Specs are never touched. They are what a flyer *is*, they are ~8KB, and
 * deleting one destroys work that cannot be recovered.
 *
 *   npx tsx scripts/prune-storage.ts            # report only
 *   npx tsx scripts/prune-storage.ts --apply    # actually delete
 */
import { readdirSync, statSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../src/config.js";

const apply = process.argv.includes("--apply");
const root = config.storageDir;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)}MB`;

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

// ── Cached renders ──────────────────────────────────────────────────────────
const renders = walk(join(root, "flyers")).filter((f) => /render\.(png|svg)$/.test(f));
const renderBytes = renders.reduce((n, f) => n + statSync(f).size, 0);

// ── Orphaned assets ─────────────────────────────────────────────────────────
// An asset counts as referenced if any surviving spec names it.
const referenced = new Set<string>();
for (const spec of walk(join(root, "flyers")).filter((f) => f.endsWith("spec.json"))) {
  try {
    for (const m of readFileSync(spec, "utf8").matchAll(/ast_[A-Z0-9]+/g)) referenced.add(m[0]);
  } catch {
    // A spec we cannot read is a spec we must not act on: treat its assets as live.
  }
}
const orphans = walk(join(root, "assets")).filter((f) => {
  const id = f.match(/ast_[A-Z0-9]+/)?.[0];
  return id ? !referenced.has(id) : false;
});
const orphanBytes = orphans.reduce((n, f) => n + statSync(f).size, 0);

console.log(`cached renders : ${renders.length} files, ${mb(renderBytes)}`);
console.log(`orphaned assets: ${orphans.length} files, ${mb(orphanBytes)}`);
console.log(`reclaimable    : ${mb(renderBytes + orphanBytes)}`);

if (!apply) {
  console.log("\nReport only. Re-run with --apply to delete.");
} else {
  for (const f of [...renders, ...orphans]) rmSync(f, { force: true });
  console.log(`\nDeleted ${renders.length + orphans.length} files.`);
  console.log("Renders rebuild on the next export; specs and referenced assets untouched.");
}
