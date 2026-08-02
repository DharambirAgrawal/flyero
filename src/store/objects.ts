import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../config.js";

/**
 * Filesystem object store (S3-compatible later — same key shape, so the swap is
 * a driver change, not a migration).
 */

function ensure(path: string): string {
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

/**
 * Bytes on disk, by kind.
 *
 * Storage is a budget now, not an afterthought: a free Postgres tier is 0.5GB
 * and a single unoptimised flyer used to cost ~3MB. You cannot manage what you
 * cannot see, so this is measurable from the API rather than by SSH.
 */
export function storageUsage(): {
  totalBytes: number;
  specs: number;
  renders: number;
  assets: number;
  flyers: number;
} {
  const walk = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
  };
  const root = config.storageDir;
  let specs = 0;
  let renders = 0;
  let assets = 0;
  const flyerIds = new Set<string>();
  for (const file of walk(root)) {
    const size = statSync(file).size;
    if (file.includes(`${join(root, "assets")}`)) assets += size;
    else if (file.endsWith("spec.json")) specs += size;
    else if (file.includes("render.")) renders += size;
    const m = file.match(/flyers\/([^/]+)\//);
    if (m) flyerIds.add(m[1]!);
  }
  return { totalBytes: specs + renders + assets, specs, renders, assets, flyers: flyerIds.size };
}

export function flyerKey(jobId: string, revision: number, name: string): string {
  return join(config.storageDir, "flyers", jobId, String(revision), name);
}

export function assetKey(assetId: string, ext: string): string {
  return join(config.storageDir, "assets", `${assetId}${ext}`);
}

export function putBuffer(path: string, data: Buffer): string {
  writeFileSync(ensure(path), data);
  return path;
}

export function putText(path: string, data: string): string {
  writeFileSync(ensure(path), data, "utf8");
  return path;
}

export function getBuffer(path: string): Buffer {
  return readFileSync(path);
}

export function getText(path: string): string {
  return readFileSync(path, "utf8");
}

export function exists(path: string): boolean {
  return existsSync(path);
}

export function extensionFor(mime: string): string {
  switch (mime) {
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    default:
      return ".bin";
  }
}
