import sharp from "sharp";
import { ulid } from "ulid";
import { Resvg } from "@resvg/resvg-js";
import * as z from "zod/v4";
import { dbAll, dbGet, dbRun, nowIso } from "./db.js";
import { assetKey, extensionFor, getBuffer, putBuffer } from "./objects.js";
import { imageSize } from "../lib/imagesize.js";
import { callStructured, type CallContext } from "../llm/index.js";
import { config, hasLlm } from "../config.js";

/**
 * Asset upload + analysis. Analysis happens once, at upload, so generation jobs
 * reference an assetId and never re-transmit binary data (API.md §2).
 */

export type AssetKind = "logo" | "screenshot" | "reference";

export type AssetAnalysis = {
  recommendedRoles: string[];
  palette: string[];
  /** 8x8 mean relative luminance, row-major. See `computeToneMap`. */
  toneMap?: number[];
  cropSafety: { left: number; right: number; top: number; bottom: number };
  /** Normalised centre of the subject; cover crops keep this point visible. */
  focalPoint?: { x: number; y: number };
  /** Normalised subject bounds when one dominant subject is visible. */
  subjectBox?: { x: number; y: number; w: number; h: number } | null;
  /** Normalised calm regions that can accept type without covering the subject. */
  textSafeZones?: Array<{ x: number; y: number; w: number; h: number }>;
  background: "opaque" | "transparent" | "unknown";
};

export type AssetRecord = {
  id: string;
  kind: AssetKind;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  path: string;
  analysis: AssetAnalysis;
  /** Source asset when this one was produced by a transform. Null for uploads. */
  parentId: string | null;
  /** JSON list of ops that produced this variant (null for originals). */
  transforms: unknown[] | null;
  /** Where an imported photograph came from. Null for direct uploads. */
  provenance: { source: string; sourceUrl: string; author: string } | null;
};

const analysisSchema = z.object({
  recommendedRoles: z
    .array(z.string().max(40))
    .max(4)
    .describe("Where this image would work in a flyer, e.g. 'hero-evidence', 'feature-demo'"),
  palette: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .max(5)
    .describe("Dominant colours as 6-digit hex"),
  cropSafety: z.object({
    left: z.number().min(0).max(0.5),
    right: z.number().min(0).max(0.5),
    top: z.number().min(0).max(0.5),
    bottom: z.number().min(0).max(0.5),
  }),
  focalPoint: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  subjectBox: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0.01).max(1),
      h: z.number().min(0.01).max(1),
    })
    .nullable(),
  textSafeZones: z
    .array(
      z.object({
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().min(0.05).max(1),
        h: z.number().min(0.05).max(1),
      }),
    )
    .max(3),
  background: z.enum(["opaque", "transparent", "unknown"]),
  /**
   * An 8x8 grid of mean relative luminance (0-1), row-major.
   *
   * Measured from the pixels with sharp, not asked of a model: it must be
   * deterministic, free, and available even with no API key. This is the fact
   * whose absence made every photo-related bug possible — without it nothing
   * downstream can know whether a photograph is bright or dark *where the type
   * is going*, so ink was chosen by guesswork and legibility was discovered by
   * rendering a PNG and looking at it.
   */
  toneMap: z.array(z.number().min(0).max(1)).length(64).optional(),
});

/** Cells per side of the tone map. */
export const TONE_GRID = 8;

/**
 * Mean luminance per cell of an 8x8 grid. Uses the sRGB luma weights rather
 * than a plain channel average, because green carries most perceived brightness
 * and a flat average calls a green canopy far darker than the eye does.
 */
export async function computeToneMap(buffer: Buffer): Promise<number[] | undefined> {
  try {
    const { data, info } = await sharp(buffer)
      .removeAlpha()
      .resize(TONE_GRID, TONE_GRID, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const out: number[] = [];
    for (let i = 0; i < TONE_GRID * TONE_GRID; i++) {
      const o = i * info.channels;
      const r = (data[o] ?? 0) / 255;
      const g = (data[o + 1] ?? 0) / 255;
      const b = (data[o + 2] ?? 0) / 255;
      out.push(Math.min(1, Math.max(0, 0.2126 * r + 0.7152 * g + 0.0722 * b)));
    }
    return out;
  } catch {
    // A tone map is an optimisation, not a requirement: without it consumers
    // treat the image as "busy, unknown brightness", which is the safe answer.
    return undefined;
  }
}

const FALLBACK_ANALYSIS: AssetAnalysis = {
  recommendedRoles: ["hero-evidence"],
  palette: [],
  cropSafety: { left: 0.05, right: 0.05, top: 0.05, bottom: 0.05 },
  focalPoint: { x: 0.5, y: 0.5 },
  subjectBox: null,
  textSafeZones: [],
  background: "unknown",
};

async function analyze(
  buf: Buffer,
  mime: string,
  kind: AssetKind,
  ctx: CallContext,
): Promise<AssetAnalysis> {
  // SVG can't be sent as an image block, and without a key we simply record less.
  if (!hasLlm() || mime === "image/svg+xml") return FALLBACK_ANALYSIS;
  try {
    return await callStructured(
      {
        role: "cheap",
        system:
          "You analyse images that will be placed inside marketing flyers. Report what you see, " +
          "not what would be flattering. cropSafety is the fraction of each edge that can be cropped " +
          "without losing anything meaningful. focalPoint is the dominant subject's visual centre. " +
          "subjectBox and textSafeZones are normalised 0-1 rectangles; safe zones must not cover the subject.",
        prompt: `This image was uploaded as a "${kind}". Describe where it could sit in a flyer, its dominant colours, safe crop, dominant subject/focal point, and up to three quiet regions that could carry type.`,
        schema: analysisSchema,
        schemaName: "asset_analysis",
        images: [{ mediaType: mime as any, base64: buf.toString("base64") }],
        maxTokens: 2000,
        effort: "low",
      },
      ctx,
    );
  } catch {
    // Analysis is an optimisation, not a requirement — never fail an upload on it.
    return FALLBACK_ANALYSIS;
  }
}

/**
 * Longest edge we keep. The canvas is 1080×1350 and renders at 2×, so anything
 * beyond this cannot show a single extra pixel — it only bloats the exported
 * SVG, which carries its assets as data URIs to stay self-contained. A 24-megapixel
 * phone photo becomes a 24 MB base64 blob if left alone.
 */
/**
 * The canvas is 1080x1350, so anything past ~1600px on its long edge is detail
 * nobody will ever see. 2400 was chosen when storage was free; on a 0.5GB
 * database it is three times the pixels the renderer can use.
 */
const MAX_ASSET_EDGE = 1600;

/**
 * Bakes EXIF orientation into the pixel grid.
 *
 * A phone/camera JPEG routinely carries an orientation tag telling a viewer
 * to rotate on display; sharp does not apply that automatically, and
 * `imageSize()` below reads the raw frame header, which ignores it too. Skip
 * this and a sideways photo gets measured sideways, downscaled sideways, and
 * re-encoded sideways with the tag dropped — nothing left downstream to ever
 * correct it. Pexels/Unsplash pre-rotate server-side, which is why this was
 * invisible before providers that serve real camera-original files (Wikimedia,
 * Openverse, a user's own phone upload) started passing bytes through here.
 */
async function normalizeOrientation(buffer: Buffer, mime: string): Promise<Buffer> {
  if (mime === "image/svg+xml") return buffer;
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.orientation || meta.orientation === 1) return buffer;
    return await sharp(buffer).rotate().toBuffer();
  } catch {
    // Let downstream decoding fail (or not) on its own terms.
    return buffer;
  }
}

/** Re-encodes an oversized raster through the renderer we already depend on. */
async function downscale(
  buffer: Buffer,
  mime: string,
  from: { width: number; height: number },
): Promise<{ buffer: Buffer; width: number; height: number; mime: string } | null> {
  if (mime === "image/svg+xml") return null;
  const longest = Math.max(from.width, from.height);
  if (longest <= MAX_ASSET_EDGE) return null;

  const scale = MAX_ASSET_EDGE / longest;
  const width = Math.round(from.width * scale);
  const height = Math.round(from.height * scale);
  /**
   * Photographs are stored as WebP, not PNG.
   *
   * This used to rasterise through resvg and emit PNG — lossless, and therefore
   * catastrophic for a photograph: measured, imported photos landed at 2-4MB
   * each while the same image as JPEG was 108KB. Seventeen of them came to
   * 47MB. PNG is the right format for a logo with flat colour and the wrong one
   * for a mountain.
   *
   * Anything with transparency stays PNG, because WebP-ing a logo's alpha away
   * would put a white box on the flyer.
   */
  try {
    const meta = await sharp(buffer).metadata();
    const keepAlpha = meta.hasAlpha === true;
    const pipeline = sharp(buffer).resize(width, height, { fit: "fill" });
    const out = keepAlpha
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer()
      : await pipeline.webp({ quality: 82 }).toBuffer();
    return {
      buffer: out,
      width,
      height,
      mime: keepAlpha ? "image/png" : "image/webp",
    };
  } catch {
    // If the decoder cannot handle it, keep the original and let the size limit
    // speak for itself rather than silently corrupting the asset.
    return null;
  }
}

export async function createAsset(
  input: {
    buffer: Buffer;
    mime: string;
    kind: AssetKind;
    apiKey: string;
    /** Set when the image was imported from a stock provider rather than uploaded. */
    provenance?: { source: string; sourceUrl: string; author: string };
  },
): Promise<AssetRecord> {
  if (!config.allowedAssetMime.includes(input.mime)) {
    throw Object.assign(new Error(`Unsupported asset type ${input.mime}`), { code: "invalid_request" });
  }

  const normalized = await normalizeOrientation(input.buffer, input.mime);
  const original = imageSize(normalized, input.mime);
  const reduced = await downscale(normalized, input.mime, original);

  const buffer = reduced?.buffer ?? normalized;
  const mime = reduced?.mime ?? input.mime;
  const width = reduced?.width ?? original.width;
  const height = reduced?.height ?? original.height;

  // Checked *after* normalisation: a large photograph is a normal thing for a
  // user to have, and it is our job to make it usable, not to reject it.
  if (buffer.length > config.maxAssetBytes) {
    throw Object.assign(
      new Error(
        `Asset is ${Math.round(buffer.length / 1024 / 1024)}MB after downscaling, over MAX_ASSET_BYTES (${Math.round(config.maxAssetBytes / 1024 / 1024)}MB)`,
      ),
      { code: "invalid_request" },
    );
  }

  const id = `ast_${ulid()}`;
  const path = assetKey(id, extensionFor(mime));
  putBuffer(path, buffer);

  const analysis = await analyze(buffer, mime, input.kind, {
    jobId: null,
    apiKey: input.apiKey,
    stage: "asset-analysis",
  });
  // Measured locally and merged in, so it survives the analysis falling back.
  analysis.toneMap = await computeToneMap(buffer);

  await dbRun(
    `INSERT INTO assets (id, api_key, kind, mime, bytes, width, height, path, analysis, created_at, parent_id, transforms, source, source_url, author)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, NULL, $11, $12, $13)`,
    [
      id,
      input.apiKey,
      input.kind,
      mime,
      buffer.length,
      width,
      height,
      path,
      JSON.stringify(analysis),
      nowIso(),
      input.provenance?.source ?? null,
      input.provenance?.sourceUrl ?? null,
      input.provenance?.author ?? null,
    ],
  );

  return {
    id,
    kind: input.kind,
    mime,
    bytes: buffer.length,
    width,
    height,
    path,
    analysis,
    parentId: null,
    transforms: null,
    provenance: input.provenance ?? null,
  };
}

type AssetRow = {
  id: string;
  kind: AssetKind;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  path: string;
  analysis: string;
  parent_id: string | null;
  transforms: string | null;
  source: string | null;
  source_url: string | null;
  author: string | null;
};

function rowToRecord(row: AssetRow): AssetRecord {
  return {
    id: row.id,
    kind: row.kind,
    mime: row.mime,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    path: row.path,
    analysis: JSON.parse(row.analysis) as AssetAnalysis,
    parentId: row.parent_id ?? null,
    transforms: row.transforms ? (JSON.parse(row.transforms) as unknown[]) : null,
    provenance: row.source
      ? { source: row.source, sourceUrl: row.source_url ?? "", author: row.author ?? "" }
      : null,
  };
}

export async function getAsset(id: string): Promise<AssetRecord | null> {
  const row = await dbGet<AssetRow>("SELECT * FROM assets WHERE id = $1", [id]);
  return row ? rowToRecord(row) : null;
}

export async function getAssets(ids: string[]): Promise<AssetRecord[]> {
  if (ids.length === 0) return [];
  // One round trip rather than N, and order preserved to match the caller's
  // asset_ids list — an IN () query does not promise result order.
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await dbAll<AssetRow>(`SELECT * FROM assets WHERE id IN (${placeholders})`, ids);
  const byId = new Map(rows.map((r) => [r.id, rowToRecord(r)]));
  return ids.map((id) => byId.get(id)).filter((a): a is AssetRecord => a !== undefined);
}

/** data: URI so exported SVG is self-contained and opens anywhere. */
export function assetDataUri(asset: AssetRecord): string {
  return `data:${asset.mime};base64,${getBuffer(asset.path).toString("base64")}`;
}

/**
 * Persist a transformed variant. Parent stays untouched so the agent can try
 * several preparations of the same upload without re-uploading.
 */
export async function createDerivedAsset(input: {
  parent: AssetRecord;
  buffer: Buffer;
  mime: string;
  width: number;
  height: number;
  opsApplied: unknown[];
  apiKey: string;
  reanalyze: boolean;
}): Promise<AssetRecord> {
  if (input.buffer.length > config.maxAssetBytes) {
    throw Object.assign(
      new Error(
        `Transformed asset is ${Math.round(input.buffer.length / 1024 / 1024)}MB, over MAX_ASSET_BYTES`,
      ),
      { code: "invalid_request" },
    );
  }

  const id = `ast_${ulid()}`;
  const path = assetKey(id, extensionFor(input.mime));
  putBuffer(path, input.buffer);

  let analysis = input.parent.analysis;
  if (input.reanalyze) {
    analysis = await analyze(input.buffer, input.mime, input.parent.kind, {
      jobId: null,
      apiKey: input.apiKey,
      stage: "asset-transform-analysis",
    });
    // Cutouts are transparent by construction.
    if (input.opsApplied.some((o) => (o as { op?: string })?.op === "removeBackground")) {
      analysis = { ...analysis, background: "transparent" };
    }
  } else if (input.opsApplied.some((o) => (o as { op?: string })?.op === "removeBackground")) {
    analysis = { ...analysis, background: "transparent" };
  }
  // Transforms change the pixels even when semantic re-analysis is disabled.
  // Never carry the parent's luminance grid into a crop/duotone/blur variant.
  analysis = { ...analysis, toneMap: await computeToneMap(input.buffer) };

  await dbRun(
    `INSERT INTO assets (id, api_key, kind, mime, bytes, width, height, path, analysis, created_at, parent_id, transforms, source, source_url, author)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id,
      input.apiKey,
      input.parent.kind,
      input.mime,
      input.buffer.length,
      input.width,
      input.height,
      path,
      JSON.stringify(analysis),
      nowIso(),
      input.parent.id,
      JSON.stringify(input.opsApplied),
      // A crop of a stock photograph is still that photographer's photograph.
      input.parent.provenance?.source ?? null,
      input.parent.provenance?.sourceUrl ?? null,
      input.parent.provenance?.author ?? null,
    ],
  );

  return {
    id,
    provenance: input.parent.provenance,
    kind: input.parent.kind,
    mime: input.mime,
    bytes: input.buffer.length,
    width: input.width,
    height: input.height,
    path,
    analysis,
    parentId: input.parent.id,
    transforms: input.opsApplied,
  };
}
