/**
 * Ground planning — the coloured field the composition sits on.
 *
 * This runs inside `solveLayout`, after the boxes are placed and *before* the
 * pass that decides which text sits on something dark. That ordering is forced:
 * `box.onDark` is the only mechanism that switches type to a light ink, and it
 * lives in the solver. A ground planned in the renderer would arrive after every
 * ink decision had already been made.
 *
 * Seams are snapped to gaps between text boxes rather than being allowed to
 * land wherever the arithmetic puts them. A headline sliced in half by a colour
 * seam is a mistake, not a feature — and it also keeps the bbox coverage test
 * in `effectiveGroundUnder` honest, since no text box ever straddles an edge.
 */

import {
  archPath,
  grainTile,
  gridTile,
  halftoneTile,
  polyline,
  roundedRectPath,
  scallopedFramePath,
  stripeTile,
  wobblyFramePath,
  type Tile,
} from "../../components/shapes.js";
import type { Box, Theme } from "../../components/types.js";
import { mix, withAlpha } from "../../creative/color.js";
import type { GraphicsValue } from "../../creative/graphics.js";
import { Rng } from "../../lib/rng.js";
import type { DesignSpec } from "../compose/spec.js";
import { groundId } from "./ids.js";
import { isDarkFill } from "./ink.js";
import type { GroundKind, GroundPlan, GroundRegion, Rect, TexturePlan } from "./types.js";

/** Boxes whose ink must never be cut by a seam. */
function textBoxes(spec: DesignSpec, boxes: Record<string, Box>): Rect[] {
  const out: Rect[] = [];
  for (const el of spec.elements) {
    const box = boxes[el.id];
    if (!box) continue;
    if (el.role === "evidence" || el.role === "structure") continue;
    out.push({ x: box.x, y: box.y, w: box.w, h: box.h });
  }
  return out;
}

/**
 * Moves a horizontal seam to the nearest gap between text boxes. Returns the
 * original position when nothing is in the way.
 */
function snapSeamY(y: number, blockers: Rect[], canvasH: number): number {
  const hits = blockers.filter((b) => y > b.y - 2 && y < b.y + b.h + 2);
  if (hits.length === 0) return y;
  // Push to whichever side of the obstruction is nearer, staying on canvas.
  const top = Math.min(...hits.map((b) => b.y)) - 14;
  const bottom = Math.max(...hits.map((b) => b.y + b.h)) + 14;
  const candidates = [top, bottom].filter((c) => c > canvasH * 0.12 && c < canvasH * 0.88);
  if (candidates.length === 0) return y;
  return candidates.reduce((a, b) => (Math.abs(a - y) <= Math.abs(b - y) ? a : b));
}

function region(d: string | null, fill: string, bbox: Rect): GroundRegion {
  return { d, fill, isDark: isDarkFill(fill), bbox };
}

/** A perimeter ring's ink never legitimately reaches the content the safe margin protects — see `GroundRegion.excludeFromCoverage`. */
function ringRegion(d: string, fill: string, bbox: Rect): GroundRegion {
  return { d, fill, isDark: isDarkFill(fill), bbox, excludeFromCoverage: true };
}

/** Converts the material's texture name into a tiled pattern. */
function texturePlan(theme: Theme, rng: Rng): TexturePlan | null {
  const { texture } = theme.material.surface;
  const ink = withAlpha(theme.palette.fg, 0.05);
  const tiles: Partial<Record<string, { tile: Tile; rotate: number }>> = {
    "grid-fine": { tile: gridTile(54, 1), rotate: 0 },
    scanline: { tile: stripeTile(1, 7), rotate: 90 },
    halftone: { tile: halftoneTile(26, 1.6), rotate: 0 },
    grain: { tile: grainTile(72, 16, rng), rotate: 0 },
  };
  const chosen = tiles[texture];
  if (!chosen) return null;
  return { id: groundId("texture"), tile: chosen.tile, fill: ink, rotate: chosen.rotate };
}

/**
 * Plans the ground for one flyer.
 *
 * Draws from its own named RNG stream. Sharing the solver's stream would mean
 * that adding a single `float()` here shifted every gesture rotation angle in
 * the system, which is deterministic but impossible to reason about.
 */
export function planGround(
  spec: DesignSpec,
  theme: Theme,
  graphics: GraphicsValue,
  boxes: Record<string, Box>,
): GroundPlan {
  const rng = new Rng(`ground:${spec.seed}`);
  const { w, h } = spec.canvas;
  const base = theme.palette.bg;
  const full: Rect = { x: 0, y: 0, w, h };

  const kind: GroundKind = rng.pick(graphics.grounds);
  const texture = texturePlan(theme, rng.derive("texture"));
  const plan: GroundPlan = { kind, base, regions: [], texture, gradient: null };

  // A field colour that reads as a deliberate block against the page, not as a
  // slightly-off version of it.
  const tinted = mix(theme.palette.accent, base, 0.58);
  const deeper = mix(theme.palette.accent, base, 0.3);

  if (kind === "flat") return plan;

  if (kind === "split-horizontal") {
    const seam = snapSeamY(h * rng.range(0.42, 0.66), textBoxes(spec, boxes), h);
    const rect = { x: 0, y: seam, w, h: h - seam };
    plan.regions.push(
      region(polyline([
        { x: 0, y: seam },
        { x: w, y: seam },
        { x: w, y: h },
        { x: 0, y: h },
      ], true), tinted, rect),
    );
    return plan;
  }

  if (kind === "split-diagonal") {
    // Both ends of the seam are snapped, so the slanted edge clears type at the
    // left and the right rather than only on average.
    const blockers = textBoxes(spec, boxes);
    const left = snapSeamY(h * rng.range(0.5, 0.72), blockers, h);
    const right = snapSeamY(left + h * rng.range(-0.14, 0.14), blockers, h);
    const top = Math.min(left, right);
    plan.regions.push(
      region(
        polyline([
          { x: 0, y: left },
          { x: w, y: right },
          { x: w, y: h },
          { x: 0, y: h },
        ], true),
        tinted,
        { x: 0, y: top, w, h: h - top },
      ),
    );
    return plan;
  }

  if (kind === "arch-field") {
    const aw = w * rng.range(0.6, 0.82);
    const x = (w - aw) / 2;
    const y = h * rng.range(0.06, 0.14);
    const ah = h * rng.range(0.6, 0.76);
    plan.regions.push(region(archPath({ x, y, w: aw, h: ah }), tinted, { x, y, w: aw, h: ah }));
    return plan;
  }

  if (kind === "block-frame") {
    const inset = Math.round(spec.canvas.safe * rng.range(0.4, 0.7));
    const band = Math.max(6, Math.round(w * 0.012));
    // Drawn as a ring: an outer rounded rect with an inner one punched out.
    const outer = roundedRectPath({ x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 }, 4);
    const inner = roundedRectPath(
      { x: inset + band, y: inset + band, w: w - (inset + band) * 2, h: h - (inset + band) * 2 },
      2,
    );
    plan.regions.push(
      ringRegion(`${outer} ${inner}`, deeper, { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 }),
    );
    return plan;
  }

  if (kind === "wobble-frame") {
    // Same ring construction as `block-frame` — an outer path with an inner
    // one punched out via the renderer's evenodd fill — but the outer edge is
    // the hand-drawn wobble path instead of a rounded rect, which is what the
    // scrapbook/kawaii references actually draw their border with. The inner
    // edge gets its own independent wobble (a separate `rng.derive` stream)
    // rather than a plain rect, so the ring's thickness itself reads as
    // hand-drawn rather than a machined band with a wobbly outer lip.
    const inset = Math.round(spec.canvas.safe * rng.range(0.35, 0.6));
    const band = Math.max(8, Math.round(w * 0.014));
    const outerRect = { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 };
    const innerRect = {
      x: inset + band,
      y: inset + band,
      w: w - (inset + band) * 2,
      h: h - (inset + band) * 2,
    };
    const outer = wobblyFramePath(outerRect, rng.derive("wobble-outer"), { amplitude: band * 0.35 });
    const inner = wobblyFramePath(innerRect, rng.derive("wobble-inner"), { amplitude: band * 0.35 });
    plan.regions.push(ringRegion(`${outer} ${inner}`, deeper, outerRect));
    return plan;
  }

  if (kind === "scallop-frame") {
    const inset = Math.round(spec.canvas.safe * rng.range(0.3, 0.55));
    const band = Math.max(10, Math.round(w * 0.016));
    const outerRect = { x: inset, y: inset, w: w - inset * 2, h: h - inset * 2 };
    const innerRect = {
      x: inset + band,
      y: inset + band,
      w: w - (inset + band) * 2,
      h: h - (inset + band) * 2,
    };
    const outer = scallopedFramePath(outerRect, band * 0.4, Math.max(24, w * 0.045));
    const inner = roundedRectPath(innerRect, 2);
    plan.regions.push(ringRegion(`${outer} ${inner}`, deeper, outerRect));
    return plan;
  }

  if (kind === "gradient-wash") {
    plan.gradient = {
      id: groundId("wash"),
      from: mix(theme.palette.accent, base, 0.62),
      to: base,
      angle: rng.pick([0, 45, 90, 135]),
    };
    // The wash is recorded as a region so contrast checks can see it, using the
    // darker of the two stops — the honest worst case for type sitting on it.
    plan.regions.push(region(null, plan.gradient.from, full));
    return plan;
  }

  if (kind === "pattern-tile") {
    plan.texture = {
      id: groundId("tile"),
      tile: rng.pick([halftoneTile(30, 3.4), gridTile(46, 1.4), stripeTile(4, 22)]),
      fill: withAlpha(theme.palette.accent, 0.22),
      rotate: rng.pick([0, 30, 45, 90]),
    };
    return plan;
  }

  return plan;
}

/**
 * Marks every box that has ended up on a dark ground, and records the fill it
 * is sitting on so `inkFor` can hold contrast against the real colour instead
 * of guessing at a photographic plate.
 *
 * Uses the same 0.55 coverage threshold as the photo-plate pass, so the two
 * rules cannot disagree about what "on" means.
 */
export function markOnDarkFromGround(ground: GroundPlan, boxes: Record<string, Box>): void {
  const baseIsDark = isDarkFill(ground.base);
  const dark = ground.regions.filter((r) => r.isDark && !r.excludeFromCoverage);
  if (!baseIsDark && dark.length === 0) return;

  for (const box of Object.values(boxes)) {
    const area = Math.max(1, box.w * box.h);
    if (baseIsDark) {
      box.onDark = true;
      box.ground = ground.base;
      continue;
    }
    for (const r of dark) {
      const ox = Math.max(0, Math.min(box.x + box.w, r.bbox.x + r.bbox.w) - Math.max(box.x, r.bbox.x));
      const oy = Math.max(0, Math.min(box.y + box.h, r.bbox.y + r.bbox.h) - Math.max(box.y, r.bbox.y));
      if ((ox * oy) / area >= 0.55) {
        box.onDark = true;
        box.ground = r.fill;
        break;
      }
    }
  }
}
