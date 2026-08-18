import { Rng } from "../lib/rng.js";
import { ensureContrast, hsl, hueFamily, mix, toHsl, type Hsl } from "./color.js";
import type { ColorLogicId, DimensionValue } from "./types.js";

export type Palette = {
  bg: string;
  fg: string;
  accent: string;
  /**
   * A second, related accent — analogous in hue to `accent`, not a clash.
   * Exists for compositions that need more than one colour of *emphasis* in
   * the same family (a balloon cluster, a multi-pennant bunting string)
   * without becoming a second unrelated palette. Never the only accent
   * anything is required to use; treat `accent` as the primary always.
   */
  accent2: string;
  muted: string;
};

/**
 * Colour logic values are *generators*, not fixed palettes (ARCHITECTURE.md §4).
 * Each receives the seeded RNG and any brand colours the user supplied, and
 * returns a palette that already satisfies WCAG-AA for fg-on-bg.
 */
export type ColorLogicValue = DimensionValue<ColorLogicId> & {
  generate: (rng: Rng, brand: string[]) => Palette;
};

/** Brand hue if supplied, otherwise a seeded hue that avoids the banned navy/cyan band. */
function baseHue(rng: Rng, brand: string[]): number {
  const fromBrand = brand.find((c) => hueFamily(c) !== "neutral");
  if (fromBrand) return toHsl(fromBrand).h;
  // 185–265 is the "AI tech" cyan→blue→purple band; sample around it, not in it.
  // The green band stops at 158 because grounds now carry real saturation, and
  // anything past that reads as cyan — the very family the banned list targets.
  const bands: Array<[number, number]> = [
    [14, 52],
    [52, 96],
    [96, 158],
    [268, 344],
    [344, 374],
  ];
  const [lo, hi] = rng.pick(bands);
  return rng.range(lo, hi) % 360;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function circularHueDistance(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/**
 * Brand colours the user actually chose, strongest chroma first. When these
 * exist they are used *literally* wherever the logic allows — a user who gave
 * us orchid purple and vivid pink must see orchid purple and vivid pink, not a
 * cream poster that merely rhymes with them. Washing brand colour down to a
 * hue is the single fastest way to look like template output.
 */
function saturatedBrand(brand: string[]): Hsl[] {
  return brand
    .map(toHsl)
    .filter((c) => c.s >= 0.18 && c.l > 0.08 && c.l < 0.92)
    .sort((a, b) => b.s - a.s);
}

function brandPrimary(brand: string[]): Hsl | null {
  return saturatedBrand(brand)[0] ?? null;
}

/** A second brand colour far enough in hue to read as a different colour. */
function brandSecondary(brand: string[], primary: Hsl): Hsl | null {
  return saturatedBrand(brand).find((c) => circularHueDistance(c.h, primary.h) > 24) ?? null;
}

/** The brand colour as an accent: full chroma kept, lightness pulled into range. */
function brandAccent(p: Hsl): string {
  return hsl(p.h, clamp(p.s, 0.55, 0.95), clamp(p.l, 0.36, 0.56));
}

/**
 * `accent2` derived from `accent` alone — a fixed hue rotation, not a fresh
 * random draw — so it stays visibly *related* to the accent every generator
 * already computed carefully (brand colour, banned-band avoidance, the lot)
 * rather than risking a second independent roll landing somewhere that
 * clashes with everything else. Lightness nudges toward the opposite end of
 * the accent's own lightness so the two stay distinguishable next to each
 * other, not just in hue.
 */
function relatedAccent(accent: string): string {
  const a = toHsl(accent);
  const h2 = (a.h + 36) % 360;
  const l2 = clamp(a.l + (a.l > 0.5 ? -0.14 : 0.14), 0.16, 0.82);
  return hsl(h2, a.s, l2);
}

/**
 * Every generator returns through here, so a palette is legible by construction
 * rather than by later critique. The accent is held to the large-text threshold
 * because it carries CTA labels, rules and marks — never body copy.
 */
function finish(bg: string, fg: string, accent: string, muted: string): Palette {
  const resolvedAccent = ensureContrast(accent, bg, true);
  return {
    bg,
    fg: ensureContrast(fg, bg),
    accent: resolvedAccent,
    accent2: ensureContrast(relatedAccent(resolvedAccent), bg, true),
    muted: ensureContrast(muted, bg, true),
  };
}

export const COLOR_LOGIC: readonly ColorLogicValue[] = [
  {
    id: "single-accent-on-action",
    brief:
      "Near-neutral everywhere; one saturated accent reserved strictly for actionable elements. Nothing else may use the accent.",
    adventurousness: 1,
    generate: (rng, brand) => {
      const p = brandPrimary(brand);
      const h = p?.h ?? baseHue(rng, brand);
      const bg = hsl(h, rng.range(0.06, 0.13), rng.range(0.93, 0.97));
      const fg = hsl(h, rng.range(0.14, 0.24), rng.range(0.1, 0.16));
      const accent = p ? brandAccent(p) : hsl(h, rng.range(0.72, 0.9), rng.range(0.42, 0.5));
      return finish(bg, fg, accent, mix(fg, bg, 0.45));
    },
  },
  {
    id: "duotone-evidence",
    brief: "Two related hues only: the evidence is rendered in the second hue so it reads as a distinct material.",
    adventurousness: 2,
    generate: (rng, brand) => {
      const p = brandPrimary(brand);
      const s = p ? brandSecondary(brand, p) : null;
      const h = p?.h ?? baseHue(rng, brand);
      const h2 = s?.h ?? (h + rng.range(24, 46)) % 360;
      const bg = hsl(h, rng.range(0.14, 0.24), rng.range(0.91, 0.95));
      const fg = hsl(h, rng.range(0.34, 0.5), rng.range(0.12, 0.19));
      const accent = s ? brandAccent(s) : hsl(h2, rng.range(0.62, 0.8), rng.range(0.4, 0.48));
      return finish(bg, fg, accent, mix(fg, bg, 0.4));
    },
  },
  {
    id: "warm-neutral-cool-accent",
    brief: "A warm neutral ground with one cool accent — warmth carries the body, cool marks the intervention.",
    adventurousness: 1,
    generate: (rng, brand) => {
      const warm = rng.range(24, 44);
      // Any brand colour that is already cool-side keeps its identity as the
      // accent; otherwise the accent is derived, but at real chroma either way.
      const coolBrand = saturatedBrand(brand).find((c) => c.h >= 90 && c.h <= 330) ?? null;
      const cool = coolBrand?.h ?? (baseHue(rng, brand) + 150) % 360;
      const bg = hsl(warm, rng.range(0.24, 0.36), rng.range(0.92, 0.95));
      const fg = hsl(warm, rng.range(0.28, 0.4), rng.range(0.13, 0.19));
      const accent = coolBrand
        ? brandAccent(coolBrand)
        : hsl(cool, rng.range(0.56, 0.74), rng.range(0.34, 0.44));
      return finish(bg, fg, accent, mix(fg, bg, 0.42));
    },
  },
  {
    id: "inverted-dark-field",
    brief:
      "Dark ground with light type. The dark must be a real hue (ink, oxblood, forest, aubergine) — never navy with a cyan glow.",
    adventurousness: 2,
    generate: (rng, brand) => {
      // Explicitly excludes the 185–265 navy band the banned list targets.
      const candidates = [rng.range(8, 30), rng.range(96, 160), rng.range(292, 344)];
      const p = brandPrimary(brand);
      const h = p?.h ?? rng.pick(candidates);
      const safeH = h > 185 && h < 265 ? (h + 120) % 360 : h;
      // A dark brand colour (forest, aubergine, oxblood) becomes the ground itself.
      const darkBrand = saturatedBrand(brand).find(
        (c) => c.l < 0.4 && !(c.h > 185 && c.h < 265),
      );
      const bg = darkBrand
        ? hsl(darkBrand.h, clamp(darkBrand.s, 0.24, 0.6), clamp(darkBrand.l, 0.1, 0.18))
        : hsl(safeH, rng.range(0.22, 0.4), rng.range(0.1, 0.15));
      const fg = hsl(safeH, rng.range(0.06, 0.14), rng.range(0.92, 0.97));
      const s2 = p ? brandSecondary(brand, p) : null;
      const accent = s2
        ? hsl(s2.h, clamp(s2.s, 0.6, 0.95), clamp(s2.l, 0.55, 0.68))
        : hsl((safeH + rng.range(28, 58)) % 360, rng.range(0.66, 0.86), rng.range(0.55, 0.64));
      return finish(bg, fg, accent, mix(fg, bg, 0.42));
    },
  },
  {
    id: "paper-and-ink",
    brief: "Two colours only — a stock and an ink. Everything is achieved with weight and scale, not hue.",
    adventurousness: 1,
    generate: (rng, brand) => {
      const p = brandPrimary(brand);
      const h = p?.h ?? baseHue(rng, brand);
      const bg = hsl(rng.range(34, 52), rng.range(0.16, 0.3), rng.range(0.93, 0.97));
      const fg = hsl(h, p ? clamp(p.s, 0.5, 0.85) : rng.range(0.5, 0.72), rng.range(0.14, 0.2));
      return finish(bg, fg, fg, mix(fg, bg, 0.48));
    },
  },
  {
    id: "two-accent-before-after",
    brief:
      "Two opposed accents that encode the before state and the after state; the after accent also carries the CTA.",
    adventurousness: 2,
    generate: (rng, brand) => {
      const p = brandPrimary(brand);
      const h = p?.h ?? baseHue(rng, brand);
      const opposite = (h + rng.range(150, 200)) % 360;
      const bg = hsl(h, rng.range(0.07, 0.14), rng.range(0.93, 0.96));
      const fg = hsl(h, rng.range(0.22, 0.34), rng.range(0.12, 0.18));
      // The "after" accent carries the CTA — the brand colour, if there is one.
      const accent = p ? brandAccent(p) : hsl(opposite, rng.range(0.66, 0.84), rng.range(0.4, 0.48));
      const muted = hsl(h, rng.range(0.1, 0.18), rng.range(0.55, 0.66));
      return finish(bg, fg, accent, muted);
    },
  },
  {
    id: "monochrome-with-signal",
    brief: "Everything greyscale except one element that carries the only chroma on the canvas.",
    adventurousness: 2,
    generate: (rng, brand) => {
      const p = brandPrimary(brand);
      const bg = hsl(0, 0, rng.range(0.94, 0.97));
      const fg = hsl(0, 0, rng.range(0.1, 0.16));
      // The single chroma on the canvas is the brand's, verbatim, when given.
      const accent = p
        ? hsl(p.h, clamp(p.s, 0.7, 1), clamp(p.l, 0.42, 0.54))
        : hsl(baseHue(rng, brand), rng.range(0.78, 0.94), rng.range(0.44, 0.52));
      return finish(bg, fg, accent, hsl(0, 0, rng.range(0.48, 0.58)));
    },
  },
  {
    id: "tinted-ground",
    brief: "A saturated but mid-light ground the type sits directly on; the accent is darker than the ground.",
    adventurousness: 3,
    generate: (rng, brand) => {
      const p = brandPrimary(brand);
      const h = p?.h ?? baseHue(rng, brand);
      // The most vibrant logic in the set: the ground *is* the colour. With a
      // brand colour supplied the ground keeps its real chroma, only lifted.
      const bg = p
        ? hsl(h, clamp(p.s * 0.9, 0.42, 0.66), rng.range(0.74, 0.83))
        : hsl(h, rng.range(0.4, 0.56), rng.range(0.76, 0.84));
      const fg = hsl(h, rng.range(0.65, 0.85), rng.range(0.1, 0.16));
      const s2 = p ? brandSecondary(brand, p) : null;
      const accent = s2
        ? hsl(s2.h, clamp(s2.s, 0.6, 0.9), clamp(s2.l, 0.26, 0.38))
        : hsl((h + rng.range(160, 200)) % 360, rng.range(0.6, 0.8), rng.range(0.28, 0.36));
      return finish(bg, fg, accent, mix(fg, bg, 0.4));
    },
  },
  {
    id: "saturated-field",
    brief:
      "The ground IS the brand colour at full strength — a deep saturated field edge to edge, with light type set straight on it and one bright accent for the action.",
    adventurousness: 2,
    generate: (rng, brand) => {
      const p = brandPrimary(brand);
      const h = p?.h ?? baseHue(rng, brand);
      /**
       * The palette that was missing. Seven of the eight original logics put a
       * near-white paper under everything (measured: 84-93% luminance), which is
       * why output read as a document rather than a poster — campaign and event
       * posters commit to a colour and set light type straight onto it.
       *
       * Mid-dark, genuinely saturated: dark enough for white type to clear AA,
       * light enough that the hue still reads as a colour rather than as black.
       */
      /*
       * Lightness 0.24-0.36 was too pale for the white ink this logic declares:
       * measured worst case, white fell to 3.07:1 against its own ground and
       * every element the solver set in white came out unreadable. A saturated
       * field only works as a *dark* field.
       *
       * That worst case lives outside this one band. Yellow/yellow-green hues
       * (~45-95°) carry much higher relative luminance than the rest of the
       * wheel at the same HSL lightness, so the same 0.13-0.22 ceiling that
       * reads as a rich jewel-tone field for blue or magenta reads as muddy
       * khaki here — a live flyer landed exactly there (hue 57°, L 0.20,
       * "#5a540e") and the shop's own colour read as dishwater, not vibrant.
       * A sweep of contrastRatio("#ffffff", hsl(h,s,L)) across this band at
       * full saturation stays AA-safe (>=4.5:1) up to L=0.26 — narrower than
       * the 0.24-0.36 range that failed elsewhere, but real headroom this
       * band was never given.
       */
      const muddyYellowBand = h >= 45 && h <= 95;
      const lightnessCeiling = muddyYellowBand ? 0.26 : 0.22;
      const bg = hsl(h, clamp((p?.s ?? 0.7) * 1.05, 0.44, 0.78), rng.range(0.13, lightnessCeiling));
      const fg = "#ffffff";
      const s2 = p ? brandSecondary(brand, p) : null;
      // The accent has to sing against a saturated ground, so it is lifted well
      // clear of the ground's own lightness rather than merely shifted in hue.
      const accent = s2
        ? hsl(s2.h, clamp(s2.s, 0.55, 0.95), clamp(s2.l, 0.62, 0.78))
        : hsl((h + rng.range(24, 64)) % 360, rng.range(0.62, 0.9), rng.range(0.62, 0.76));
      return finish(bg, fg, accent, mix(fg, bg, 0.34));
    },
  },
  {
    id: "colour-block-duo",
    brief:
      "Two committed colours meeting on a hard edge — a saturated field carrying most of the page and a lighter block holding the words.",
    adventurousness: 2,
    generate: (rng, brand) => {
      const p = brandPrimary(brand);
      const h = p?.h ?? baseHue(rng, brand);
      // Light enough to take dark type, saturated enough to still be a colour —
      // the "big flat block" register the reference posters lean on.
      const bg = hsl(h, clamp((p?.s ?? 0.6) * 0.85, 0.3, 0.55), rng.range(0.62, 0.74));
      const fg = hsl(h, rng.range(0.72, 0.92), rng.range(0.09, 0.15));
      const s2 = p ? brandSecondary(brand, p) : null;
      const accent = s2
        ? hsl(s2.h, clamp(s2.s, 0.6, 0.92), clamp(s2.l, 0.22, 0.34))
        : hsl((h + rng.range(150, 210)) % 360, rng.range(0.65, 0.88), rng.range(0.24, 0.34));
      return finish(bg, fg, accent, mix(fg, bg, 0.38));
    },
  },
  {
    id: "soft-pastel-multi",
    brief:
      "Multiple soft pastel hues rather than one hard accent — a gentle warm-white ground, rose or lavender marks, nothing saturated or dark. The kawaii/celebration register.",
    adventurousness: 2,
    generate: (rng, brand) => {
      const p = brandPrimary(brand);
      /**
       * Not `baseHue()`'s full range. A pastel only reads as "soft and
       * pretty" rather than "washed-out and muddy" in specific hue families —
       * pink, lavender, soft blue, mint. Yellow-green and orange desaturate
       * into khaki/olive once `ensureContrast` darkens them for AA text, which
       * is exactly the muddy result this logic exists to avoid. Chosen over
       * `baseHue()`'s bands rather than reusing them for that reason.
       */
      const pastelBands: Array<[number, number]> = [
        [340, 376], // pink
        [260, 300], // lavender
        [190, 225], // soft blue
        [150, 180], // mint
      ];
      const h = p?.h ?? rng.range(...rng.pick(pastelBands)) % 360;
      // A near-white ground, but never fully desaturated — a true pastel page
      // still carries a whisper of hue, which is what separates it from the
      // "document" white every near-neutral logic already produces.
      const bg = hsl(h, rng.range(0.14, 0.24), rng.range(0.94, 0.97));
      const fg = hsl(h, rng.range(0.22, 0.34), rng.range(0.2, 0.28));
      // Pastel is moderate saturation at *high* lightness, not full chroma —
      // `finish` will darken this via ensureContrast if the ground is too
      // close in lightness to clear AA, which lands it at "dusty" rather than
      // "pale," and that is still the right family, just not washed out.
      const accent = p
        ? hsl(p.h, clamp(p.s * 0.55, 0.32, 0.55), clamp(p.l, 0.6, 0.74))
        : hsl(h, rng.range(0.42, 0.58), rng.range(0.64, 0.74));
      return finish(bg, fg, accent, mix(fg, bg, 0.5));
    },
  },
] as const;

export const COLOR_LOGIC_IDS = COLOR_LOGIC.map((c) => c.id);

export function colorLogicById(id: ColorLogicId): ColorLogicValue {
  const found = COLOR_LOGIC.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown colour logic ${id}`);
  return found;
}
