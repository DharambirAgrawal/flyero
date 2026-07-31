import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
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
