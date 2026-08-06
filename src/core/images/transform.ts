/**
 * Deterministic image preparation for flyer placement.
 *
 * Agents must not dump a raw phone photo into a composition and hope. They call
 * these ops so the image fits the slot: crop to the subject, cut the background,
 * soften edges, blur a plate, tint to the brand — the same work a designer does
 * in Figma before dropping a screenshot into a frame.
 *
 * Originals are never mutated. Every transform returns a new PNG buffer.
 */
import sharp from "sharp";
import { z } from "zod";

const frac = z.number().min(0).max(1);
const hex = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);

export const imageOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("crop"),
    /** Fractions of width/height to trim from each edge (uses cropSafety-style values). */
    left: frac.default(0),
    right: frac.default(0),
    top: frac.default(0),
    bottom: frac.default(0),
  }),
  z.object({
    op: z.literal("cropBox"),
    /** Normalised box: x/y/w/h in 0–1 of the current image. */
    x: frac,
    y: frac,
    w: frac,
    h: frac,
  }),
  z.object({
    op: z.literal("resize"),
    width: z.number().int().min(16).max(4096).optional(),
    height: z.number().int().min(16).max(4096).optional(),
    fit: z.enum(["cover", "contain", "fill", "inside", "outside"]).default("cover"),
    background: hex.default("#00000000"),
  }),
  z.object({
    op: z.literal("blur"),
    /** Gaussian sigma. 0.5 = subtle, 8 = heavy background plate. */
    sigma: z.number().min(0.3).max(40).default(4),
  }),
  z.object({
    op: z.literal("sharpen"),
    sigma: z.number().min(0.3).max(10).default(1),
  }),
  z.object({
    op: z.literal("grayscale"),
  }),
  z.object({
    op: z.literal("opacity"),
    value: z.number().min(0).max(1),
  }),
  z.object({
    op: z.literal("roundCorners"),
    /** Pixel radius, or fraction of min(side) when `relative` is true. */
    radius: z.number().min(0).max(2048),
    relative: z.boolean().default(false),
  }),
  z.object({
    op: z.literal("circleCrop"),
  }),
  z.object({
    op: z.literal("feather"),
    /** Soft alpha falloff from the edge inward, in pixels. */
    radius: z.number().min(1).max(128).default(16),
  }),
  z.object({
    op: z.literal("vignette"),
    strength: z.number().min(0).max(1).default(0.45),
  }),
  z.object({
    op: z.literal("tint"),
    color: hex,
    opacity: z.number().min(0).max(1).default(0.35),
  }),
  z.object({
    op: z.literal("modulate"),
    brightness: z.number().min(0.2).max(3).optional(),
    saturation: z.number().min(0).max(3).optional(),
    hue: z.number().min(-180).max(180).optional(),
  }),
  z.object({
    op: z.literal("contrast"),
    /** 1 = unchanged, >1 punchier, <1 flatter. */
    value: z.number().min(0.2).max(3).default(1.15),
  }),
  z.object({
    op: z.literal("rotate"),
    degrees: z.number().min(-180).max(180),
    background: hex.default("#00000000"),
  }),
  z.object({
    op: z.literal("flip"),
    axis: z.enum(["horizontal", "vertical"]),
  }),
  z.object({
    op: z.literal("pad"),
    top: z.number().min(0).max(1024).default(0),
    right: z.number().min(0).max(1024).default(0),
    bottom: z.number().min(0).max(1024).default(0),
    left: z.number().min(0).max(1024).default(0),
    color: hex.default("#00000000"),
  }),
  z.object({
    op: z.literal("removeBackground"),
    /**
     * chroma — knock out a solid/near-solid studio colour (logos, product on white).
     * auto — sample the four corners and remove that shared colour (best default).
     */
    mode: z.enum(["auto", "chroma"]).default("auto"),
    color: hex.optional(),
    /** 0–255 colour distance. Higher = more aggressive cut. */
    tolerance: z.number().int().min(4).max(120).default(42),
  }),
  z.object({
    op: z.literal("duotone"),
    shadows: hex,
    highlights: hex,
  }),
]);

export type ImageOp = z.infer<typeof imageOpSchema>;

export const transformRequestSchema = z.object({
  /** Ordered pipeline. Applied left → right. Cap keeps agents from thrashing. */
  ops: z.array(imageOpSchema).min(1).max(12).optional(),
  /**
   * Named recipes for common flyer jobs. Expanded server-side so the agent does
   * not have to invent the op sequence for every template.
   */
  preset: z
    .enum([
      "product-hero",
      "logo-clean",
      "soft-cutout",
      "circle-avatar",
      "bg-plate-blur",
      "screenshot-frame",
      "brand-tint",
    ])
    .optional(),
  /** Hex used by brand-tint / tint-aware presets. */
  accent: hex.optional(),
  /** Re-analyse the result with the vision cheap model (default true). */
  reanalyze: z.boolean().default(true),
});

export type TransformRequest = z.infer<typeof transformRequestSchema>;

/** Expand a preset into concrete ops. Accent is optional brand colour. */
export function expandPreset(
  preset: NonNullable<TransformRequest["preset"]>,
  accent?: string,
): ImageOp[] {
  switch (preset) {
    case "product-hero":
      return [
        { op: "removeBackground", mode: "auto", tolerance: 40 },
        { op: "feather", radius: 10 },
        { op: "sharpen", sigma: 0.8 },
      ];
    case "logo-clean":
      return [
        { op: "removeBackground", mode: "auto", tolerance: 48 },
        { op: "feather", radius: 2 },
      ];
    case "soft-cutout":
      return [
        { op: "removeBackground", mode: "auto", tolerance: 38 },
        { op: "feather", radius: 22 },
      ];
    case "circle-avatar":
      return [
        { op: "removeBackground", mode: "auto", tolerance: 36 },
        { op: "circleCrop" },
        { op: "feather", radius: 6 },
      ];
    case "bg-plate-blur":
      return [
        { op: "blur", sigma: 12 },
        { op: "modulate", saturation: 0.85, brightness: 0.92 },
      ];
    case "screenshot-frame":
      return [
        { op: "crop", left: 0.02, right: 0.02, top: 0.02, bottom: 0.02 },
        { op: "sharpen", sigma: 0.7 },
        { op: "roundCorners", radius: 0.04, relative: true },
      ];
    case "brand-tint":
      return [
        { op: "tint", color: accent ?? "#2EC4F1", opacity: 0.28 },
        { op: "contrast", value: 1.08 },
      ];
  }
}

/** Public catalogue so GET /v1/assets/transforms can teach agents what exists. */
export const TRANSFORM_CATALOGUE = {
  purpose:
    "Prepare a user image so it blends into a flyer — do not drop raw photos into components. " +
    "Transform creates a NEW assetId; the original is never overwritten. Pass the new id to compose.",
  presets: {
    "product-hero": "Cut subject from studio bg, soft edge, slight sharpen — for evidence slots",
    "logo-clean": "Knock out flat logo background so it sits on any flyer colour",
    "soft-cutout": "Gentler cutout with stronger feather — portraits / soft product shots",
    "circle-avatar": "Cutout + circular mask — face / founder / icon lockups",
    "bg-plate-blur":
      "Heavy blur (sigma 12) + quiet grade — for purely decorative atmosphere with no recognisable " +
      "subject. Never use on a flyer's evidence photo (a specific house, product, dish): it becomes " +
      "an unrecognisable colour wash and fails the cover test. For type over a real subject photo, " +
      "use photo-hero's built-in scrim instead — it darkens only the type's band, not the whole image",
    "screenshot-frame": "Slight crop + sharpen + rounded corners — UI screenshots in browser-frame",
    "brand-tint": "Wash with accent colour — unify a photo with the lineage palette",
  },
  ops: [
    "crop",
    "cropBox",
    "resize",
    "blur",
    "sharpen",
    "grayscale",
    "opacity",
    "roundCorners",
    "circleCrop",
    "feather",
    "vignette",
    "tint",
    "modulate",
    "contrast",
    "rotate",
    "flip",
    "pad",
    "removeBackground",
    "duotone",
  ],
} as const;

function parseHex(color: string): { r: number; g: number; b: number; a: number } {
  const h = color.replace("#", "");
  const full = h.length === 6 ? `${h}ff` : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: parseInt(full.slice(6, 8), 16),
  };
}

function dist(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

async function removeBackgroundChroma(
  input: Buffer,
  target: { r: number; g: number; b: number },
  tolerance: number,
): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const px = { r: out[i]!, g: out[i + 1]!, b: out[i + 2]! };
    if (dist(px, target) <= tolerance) {
      out[i + 3] = 0;
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function sampleCornerColor(input: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const points = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
    [Math.floor(w / 2), 2],
    [2, Math.floor(h / 2)],
  ] as const;
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = (y * w + x) * 4;
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
    n++;
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

async function featherEdges(input: Buffer, radius: number): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const w = info.width;
  const h = info.height;
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      if (edge >= r) continue;
      const i = (y * w + x) * 4 + 3;
      const factor = edge / r;
      out[i] = Math.round((out[i] ?? 0) * factor);
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function applyRoundMask(input: Buffer, radiusPx: number): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const r = Math.min(radiusPx, Math.floor(Math.min(w, h) / 2));
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`,
  );
  return sharp(input)
    .ensureAlpha()
    .composite([{ input: svg, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function applyCircleMask(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const size = Math.min(w, h);
  const left = Math.floor((w - size) / 2);
  const top = Math.floor((h - size) / 2);
  const cropped = await sharp(input).extract({ left, top, width: size, height: size }).ensureAlpha().toBuffer();
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
  return sharp(cropped)
    .composite([{ input: svg, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function applyOpacity(input: Buffer, value: number): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 3; i < out.length; i += 4) {
    out[i] = Math.round((out[i] ?? 0) * value);
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

async function applyVignette(input: Buffer, strength: number): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  // Radial darkening as an overlay SVG.
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><radialGradient id="g" cx="50%" cy="50%" r="65%">` +
      `<stop offset="40%" stop-color="black" stop-opacity="0"/>` +
      `<stop offset="100%" stop-color="black" stop-opacity="${strength}"/>` +
      `</radialGradient></defs>` +
      `<rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  return sharp(input)
    .ensureAlpha()
    .composite([{ input: svg, blend: "over" }])
    .png()
    .toBuffer();
}

async function applyTint(input: Buffer, color: string, opacity: number): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const c = parseHex(color);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<rect width="100%" height="100%" fill="rgba(${c.r},${c.g},${c.b},${opacity})"/></svg>`,
  );
  return sharp(input)
    .ensureAlpha()
    .composite([{ input: svg, blend: "soft-light" }])
    .png()
    .toBuffer();
}

async function applyDuotone(input: Buffer, shadows: string, highlights: string): Promise<Buffer> {
  const s = parseHex(shadows);
  const hi = parseHex(highlights);
  const gray = await sharp(input).greyscale().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(gray.data.length);
  for (let i = 0; i < gray.data.length; i += 4) {
    const t = (gray.data[i] ?? 0) / 255;
    out[i] = Math.round(s.r + (hi.r - s.r) * t);
    out[i + 1] = Math.round(s.g + (hi.g - s.g) * t);
    out[i + 2] = Math.round(s.b + (hi.b - s.b) * t);
    out[i + 3] = gray.data[i + 3] ?? 255;
  }
  return sharp(out, {
    raw: { width: gray.info.width, height: gray.info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

function resolveOps(req: TransformRequest): ImageOp[] {
  const fromPreset = req.preset ? expandPreset(req.preset, req.accent) : [];
  // logo-clean accidentally had a fake op in an earlier draft — strip unknowns via parse
  const cleanedPreset = fromPreset.filter((op) => imageOpSchema.safeParse(op).success);
  const manual = req.ops ?? [];
  const combined = [...cleanedPreset, ...manual];
  if (combined.length === 0) {
    throw Object.assign(new Error("Provide ops and/or a preset"), { code: "invalid_request" });
  }
  return combined.map((op) => imageOpSchema.parse(op));
}

/**
 * Run the pipeline. Always emits PNG (alpha-capable) so cutouts survive into SVG.
 */
export async function applyImageOps(
  input: Buffer,
  mime: string,
  req: TransformRequest,
): Promise<{ buffer: Buffer; width: number; height: number; opsApplied: ImageOp[] }> {
  if (mime === "image/svg+xml") {
    throw Object.assign(
      new Error("Transform SVG by uploading a raster, or rasterise first — vector ops are not supported yet"),
      { code: "invalid_request" },
    );
  }

  const ops = resolveOps(req);
  let pipeline = sharp(input, { failOn: "none" }).ensureAlpha();

  for (const op of ops) {
    const current = await pipeline.png().toBuffer();
    pipeline = sharp(current).ensureAlpha();

    switch (op.op) {
      case "crop": {
        const meta = await pipeline.metadata();
        const w = meta.width ?? 1;
        const h = meta.height ?? 1;
        const left = Math.round(w * op.left);
        const top = Math.round(h * op.top);
        const width = Math.max(1, w - left - Math.round(w * op.right));
        const height = Math.max(1, h - top - Math.round(h * op.bottom));
        pipeline = sharp(current).extract({ left, top, width, height }).ensureAlpha();
        break;
      }
      case "cropBox": {
        const meta = await pipeline.metadata();
        const w = meta.width ?? 1;
        const h = meta.height ?? 1;
        const left = Math.round(w * op.x);
        const top = Math.round(h * op.y);
        const width = Math.max(1, Math.round(w * op.w));
        const height = Math.max(1, Math.round(h * op.h));
        pipeline = sharp(
          await sharp(current)
            .extract({
              left: Math.min(left, w - 1),
              top: Math.min(top, h - 1),
              width: Math.min(width, w - left),
              height: Math.min(height, h - top),
            })
            .toBuffer(),
        ).ensureAlpha();
        break;
      }
      case "resize": {
        const bg = parseHex(op.background);
        pipeline = sharp(current)
          .resize({
            width: op.width,
            height: op.height,
            fit: op.fit,
            background: { r: bg.r, g: bg.g, b: bg.b, alpha: bg.a / 255 },
          })
          .ensureAlpha();
        break;
      }
      case "blur":
        pipeline = sharp(await sharp(current).blur(op.sigma).toBuffer()).ensureAlpha();
        break;
      case "sharpen":
        pipeline = sharp(await sharp(current).sharpen({ sigma: op.sigma }).toBuffer()).ensureAlpha();
        break;
      case "grayscale":
        pipeline = sharp(await sharp(current).greyscale().toBuffer()).ensureAlpha();
        break;
      case "opacity":
        pipeline = sharp(await applyOpacity(current, op.value)).ensureAlpha();
        break;
      case "roundCorners": {
        const meta = await sharp(current).metadata();
        const minSide = Math.min(meta.width ?? 1, meta.height ?? 1);
        const radius = op.relative ? op.radius * minSide : op.radius;
        pipeline = sharp(await applyRoundMask(current, radius)).ensureAlpha();
        break;
      }
      case "circleCrop":
        pipeline = sharp(await applyCircleMask(current)).ensureAlpha();
        break;
      case "feather":
        pipeline = sharp(await featherEdges(current, op.radius)).ensureAlpha();
        break;
      case "vignette":
        pipeline = sharp(await applyVignette(current, op.strength)).ensureAlpha();
        break;
      case "tint":
        pipeline = sharp(await applyTint(current, op.color, op.opacity)).ensureAlpha();
        break;
      case "modulate": {
        const mods: { brightness?: number; saturation?: number; hue?: number } = {};
        if (op.brightness !== undefined) mods.brightness = op.brightness;
        if (op.saturation !== undefined) mods.saturation = op.saturation;
        if (op.hue !== undefined) mods.hue = op.hue;
        pipeline = sharp(await sharp(current).modulate(mods).toBuffer()).ensureAlpha();
        break;
      }
      case "contrast": {
        // linear: out = value * in + (1-value)/2  — keeps midtones stable
        const a = op.value;
        const b = (1 - a) / 2;
        pipeline = sharp(await sharp(current).linear(a, b * 255).toBuffer()).ensureAlpha();
        break;
      }
      case "rotate": {
        const bg = parseHex(op.background);
        pipeline = sharp(
          await sharp(current)
            .rotate(op.degrees, {
              background: { r: bg.r, g: bg.g, b: bg.b, alpha: bg.a / 255 },
            })
            .toBuffer(),
        ).ensureAlpha();
        break;
      }
      case "flip":
        pipeline = sharp(
          await (op.axis === "horizontal" ? sharp(current).flop() : sharp(current).flip()).toBuffer(),
        ).ensureAlpha();
        break;
      case "pad": {
        const bg = parseHex(op.color);
        pipeline = sharp(
          await sharp(current)
            .extend({
              top: op.top,
              right: op.right,
              bottom: op.bottom,
              left: op.left,
              background: { r: bg.r, g: bg.g, b: bg.b, alpha: bg.a / 255 },
            })
            .toBuffer(),
        ).ensureAlpha();
        break;
      }
      case "removeBackground": {
        const target =
          op.mode === "chroma" && op.color
            ? parseHex(op.color)
            : await sampleCornerColor(current);
        pipeline = sharp(
          await removeBackgroundChroma(current, target, op.tolerance),
        ).ensureAlpha();
        break;
      }
      case "duotone":
        pipeline = sharp(await applyDuotone(current, op.shadows, op.highlights)).ensureAlpha();
        break;
    }
  }

  // Trim transparent margins after cutouts so logos don't sit in empty boxes.
  const hadCutout = ops.some((o) => o.op === "removeBackground" || o.op === "feather");
  let finalBuf = await pipeline.png().toBuffer();
  if (hadCutout) {
    try {
      finalBuf = await sharp(finalBuf).trim({ threshold: 8 }).png().toBuffer();
    } catch {
      // trim throws when the image is fully opaque — fine.
    }
  }

  const meta = await sharp(finalBuf).metadata();
  return {
    buffer: finalBuf,
    width: meta.width ?? 1,
    height: meta.height ?? 1,
    opsApplied: ops,
  };
}
