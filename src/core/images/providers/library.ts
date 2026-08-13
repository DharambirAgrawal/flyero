import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { search, type SearchDocument } from "../../../lib/search.js";
import type { MediaAsset, MediaAssetType, MediaProvider } from "./types.js";

/**
 * The same seven values every other provider already types its results
 * with (`MediaAssetType`) — not a second, parallel taxonomy. A curated
 * "balloon" could be a full-bleed textured background, a small decorative
 * accent, or the literal product photo an event-supply shop is selling —
 * three completely different jobs a filename can't disambiguate ("balloon"
 * tells you the subject, not the role). Declare it in the sidecar when the
 * role isn't obvious; measured transparency (see `detectTransparency`)
 * still supplies a reasonable default when it's absent, so this is
 * optional, not one more required field.
 */
const ASSET_TYPES: readonly MediaAssetType[] = [
  "photo", "svg", "icon", "vector", "png", "background", "shape",
];

/** Plain-English role, spelled out in every search result's `description` — not left for the agent to infer from a jargon type string. */
const ROLE_DESCRIPTION: Record<MediaAssetType, string> = {
  photo: "A photograph — the depicted thing itself, usable as cover-test evidence",
  background: "A full-bleed background texture/scene, meant to fill the whole canvas",
  png: "A cut-out image with no background — a decorative accent, not the main evidence",
  icon: "A small symbolic mark, not a literal depiction",
  vector: "A vector illustration",
  svg: "An SVG graphic",
  shape: "A basic shape/divider/badge",
};

/**
 * The curated asset library — full-colour, multi-tone images the user drops
 * in themselves, distinct from `src/creative/motifs/` (single-tone, vector,
 * theme-recoloured) and distinct from a job's uploaded assets (`POST
 * /v1/assets`, ephemeral, per-job). This is the "I have images I want
 * Flyero to be able to reach for on every future job, permanently" folder.
 *
 * There is no database engine here — this directory *is* the store. No
 * SQLite table, no separate index file: `loadCuratedLibrary` reads the
 * folder tree once at startup into an in-memory `Map`, the same way
 * `src/creative/motifs/` does. What you see with `ls` is everything there
 * is to see.
 *
 * Convention, one image + one sidecar per item, organised into subfolders by
 * subject however is useful (folders are for browsing, not part of the id):
 *
 *   src/creative/library/<subject>/<name>.png   (or .jpg / .jpeg / .webp)
 *   src/creative/library/<subject>/<name>.json  — see `Sidecar` below
 *
 * Only `title` is required. `transparent` is NOT something you declare —
 * it's measured from the actual pixels (`sharp().stats()`, real alpha
 * values below 255 present, not just an unused alpha channel) every time
 * the library loads, so it can never be wrong or go stale. This is the
 * direct answer to "how will the agent know if an image has no
 * background": it's in every search result automatically, computed, not
 * asserted. `usage` is free text for the one thing a computer can't infer —
 * what the image is *for* ("hero photo of the storefront", "decorative
 * corner accent", "full-bleed background texture") — surfaced in the
 * MediaAsset's own `description` field so an agent reads it as guidance,
 * not just another tag to pattern-match.
 */

const DEFAULT_LIBRARY_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "creative",
  "library",
);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export type CuratedItem = {
  id: string;
  title: string;
  tags: string[];
  usage?: string;
  license?: string;
  author?: string;
  category?: string;
  filePath: string;
  mime: string;
  /** Measured from real pixels at load time — see this file's header. */
  transparent: boolean;
  width?: number;
  height?: number;
  /** Declared in the sidecar, or defaulted from `transparent` — see `resolveAssetType`. */
  assetType: MediaAssetType;
};

type Sidecar = {
  title?: string;
  tags?: string[];
  usage?: string;
  license?: string;
  author?: string;
  type?: string;
};

function resolveAssetType(declared: string | undefined, relFile: string, transparent: boolean): MediaAssetType {
  if (declared === undefined) {
    // No declared role — fall back to what's actually measurable: a
    // transparent image is a cutout ("png", this codebase's convention for
    // "pre-cut sticker"), an opaque one is a photo. A reasonable default,
    // not a guess at intent — declare "type" when this isn't what you mean.
    return transparent ? "png" : "photo";
  }
  if ((ASSET_TYPES as readonly string[]).includes(declared)) return declared as MediaAssetType;
  throw new Error(
    `${relFile}'s sidecar sets "type": ${JSON.stringify(declared)}, which isn't one of ` +
      `${ASSET_TYPES.join(", ")}.`,
  );
}

/** True only if the image actually has transparent pixels, not merely an unused alpha channel. */
async function detectTransparency(buffer: Buffer): Promise<boolean> {
  const meta = await sharp(buffer).metadata();
  if (!meta.hasAlpha) return false;
  try {
    const { channels } = await sharp(buffer).stats();
    const alpha = channels[channels.length - 1];
    return (alpha?.min ?? 255) < 255;
  } catch {
    // Stats failed for some reason (corrupt file, unusual colour space) —
    // fall back to the cheaper, less precise "has an alpha channel at all"
    // signal rather than silently reporting no transparency.
    return true;
  }
}

/**
 * Reads every image + sidecar pair under `dir` (default: the real curated
 * library). Parameterised so tests can point it at a throwaway fixture
 * directory instead of needing real licensed images checked in to exercise
 * the loader. Async because transparency detection reads real pixels.
 */
export async function loadCuratedLibrary(dir: string = DEFAULT_LIBRARY_DIR): Promise<Map<string, CuratedItem>> {
  const out = new Map<string, CuratedItem>();
  if (!existsSync(dir)) return out;

  const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && IMAGE_EXTENSIONS.has(extname(e.name).toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const entryDir = (entry as { parentPath?: string; path?: string }).parentPath ?? entry.path ?? dir;
    const ext = extname(entry.name);
    const base = entry.name.slice(0, -ext.length);
    const relFile = join(entryDir, entry.name).slice(dir.length + 1);
    const id = relFile.slice(0, -ext.length);

    const sidecarPath = join(entryDir, `${base}.json`);
    if (!existsSync(sidecarPath)) {
      throw new Error(
        `Curated asset ${relFile} has no matching ${base}.json sidecar — every curated image needs one, ` +
          `with at least "title" set.`,
      );
    }
    let sidecar: Sidecar;
    try {
      sidecar = JSON.parse(readFileSync(sidecarPath, "utf8"));
    } catch (err) {
      throw new Error(`${base}.json (sidecar for ${relFile}) is not valid JSON: ${(err as Error).message}`);
    }
    if (!sidecar.title) {
      throw new Error(`${base}.json (sidecar for ${relFile}) must set "title".`);
    }

    const category = relFile.includes("/") ? relFile.split("/")[0] : undefined;
    if (out.has(id)) {
      const prior = out.get(id)!;
      throw new Error(`Curated asset id "${id}" is used twice: ${prior.filePath} and ${relFile}`);
    }

    const filePath = join(entryDir, entry.name);
    const buffer = readFileSync(filePath);
    const [transparent, meta] = await Promise.all([detectTransparency(buffer), sharp(buffer).metadata()]);

    out.set(id, {
      id,
      title: sidecar.title,
      tags: sidecar.tags ?? [],
      usage: sidecar.usage,
      license: sidecar.license,
      author: sidecar.author,
      category,
      filePath,
      mime: MIME_BY_EXTENSION[ext.toLowerCase()]!,
      transparent,
      width: meta.width,
      height: meta.height,
      assetType: resolveAssetType(sidecar.type, relFile, transparent),
    });
  }
  return out;
}

let CURATED_LIBRARY: Map<string, CuratedItem> = await loadCuratedLibrary();

/** Re-reads the folder from disk — for tests, and for a running server to pick up newly dropped-in files without a restart. */
export async function reloadCuratedLibrary(dir?: string): Promise<void> {
  CURATED_LIBRARY = await loadCuratedLibrary(dir);
}

/**
 * Reads the raw bytes for a curated asset by id — the read side of
 * `library:<id>` download URLs, called from `fetchCandidate`
 * (`src/core/images/search.ts`) instead of an HTTP fetch. No network round
 * trip, and no risk of the self-referencing-loopback-URL bug already fixed
 * once in this codebase (`shareUrl`'s own comment, `src/mcp/server.ts`) —
 * this reads straight off local disk inside the same process.
 */
export function readCuratedAsset(id: string): { buffer: Buffer; mime: string } | null {
  const item = CURATED_LIBRARY.get(id);
  if (!item) return null;
  return { buffer: readFileSync(item.filePath), mime: item.mime };
}

export function hasCuratedAsset(id: string): boolean {
  return CURATED_LIBRARY.has(id);
}

function toMediaAsset(item: CuratedItem): MediaAsset {
  const ref = `library:${item.id}`;
  const usageNote = item.usage ? ` — ${item.usage}` : "";
  return {
    id: `library::${item.id}`,
    title: item.title,
    // States the role explicitly instead of leaving it to be inferred from
    // the filename — "balloon" alone doesn't say whether this specific file
    // is a background texture, a decorative accent or the literal product
    // photo, and those are three different jobs in a composition. Says the
    // measured transparency too, since "png"/"background"/etc. alone reads
    // as jargon without it.
    description:
      `${ROLE_DESCRIPTION[item.assetType]}. ` +
      `${item.transparent ? "Transparent background (cutout)." : "Opaque background (not a cutout)."}` +
      usageNote,
    provider: "library",
    assetType: item.assetType,
    thumbnailUrl: ref,
    downloadUrl: ref,
    sourceUrl: ref,
    width: item.width,
    height: item.height,
    license: item.license,
    author: item.author,
    tags: [
      ...(item.category ? [item.category] : []),
      ...item.tags,
      item.assetType,
      item.transparent ? "transparent-background" : "opaque-background",
    ],
  };
}

export const libraryProvider: MediaProvider = {
  name: "library",

  configured: () => true,

  async search(query, page, perPage) {
    const items = [...CURATED_LIBRARY.values()];
    const q = query.trim();
    const ranked = q
      ? search(
          items.map((item): SearchDocument => ({
            id: item.id,
            fields: [
              { text: item.id, weight: 2 },
              { text: item.title, weight: 3 },
              { text: item.tags.join(" "), weight: 2 },
              { text: item.usage ?? "", weight: 2 },
              { text: item.category ?? "", weight: 1 },
              // Searchable by role too — "water background" should rank a
              // background-typed water image over a photo-typed one.
              { text: item.assetType, weight: 1 },
            ],
          })),
          q,
          items.length,
        ).map((h) => CURATED_LIBRARY.get(h.id)!)
      : items; // bare "library"/empty query browses everything, like shapesProvider does
    const offset = (page - 1) * perPage;
    return ranked.slice(offset, offset + perPage).map(toMediaAsset);
  },
};
