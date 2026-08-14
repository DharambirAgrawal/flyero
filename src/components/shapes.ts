/**
 * Path geometry. Pure functions in, SVG `d` strings out — no React, no theme,
 * no state. Everything here is deterministic: the organic shapes take an `Rng`
 * so the same seed always yields the same curve (AGENTS.md law 3).
 *
 * This module exists because Flyero had no vector vocabulary at all. Every
 * reference flyer worth imitating is built from blobs, arcs, stripes, dashed
 * routes and starbursts; before this file the renderer could draw a rounded
 * rectangle and a straight line and nothing else.
 *
 * Coordinates are absolute canvas units unless a function says otherwise.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mix } from "../creative/color.js";
import type { Rng } from "../lib/rng.js";
import { search, type SearchDocument } from "../lib/search.js";

/**
 * Fixed-precision formatting. Two decimals is well below a pixel at poster
 * scale, and rounding here is what keeps the golden-SVG test byte-identical —
 * raw floats leak platform-dependent tails like 95.20000000000005.
 */
function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

const TAU = Math.PI * 2;

export type Point = { x: number; y: number };

export type Rect = { x: number; y: number; w: number; h: number };

/** Closes a run of points with Catmull-Rom curves converted to cubic Béziers. */
function closedSpline(pts: Point[]): string {
  const count = pts.length;
  if (count < 3) throw new Error("closedSpline needs at least 3 points");
  let d = `M ${n(pts[0]!.x)} ${n(pts[0]!.y)}`;
  for (let i = 0; i < count; i++) {
    const p0 = pts[(i - 1 + count) % count]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % count]!;
    const p3 = pts[(i + 2) % count]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2.x)} ${n(p2.y)}`;
  }
  return `${d} Z`;
}

/**
 * Organic closed blob: points spaced around an ellipse, each pushed in or out,
 * then splined. `wobble` is how far the radius may vary (0 = a plain ellipse).
 *
 * Generalised from the version that used to live inside `masked-image`, which
 * was the only organic shape in the repo and could not be reached from anywhere
 * else.
 */
export function blobPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rng: Pick<Rng, "float">,
  opts: { points?: number; wobble?: number } = {},
): string {
  const count = Math.max(3, opts.points ?? 8);
  const wobble = opts.wobble ?? 0.22;
  const pts = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * TAU;
    const jitter = 1 - wobble + rng.float() * wobble;
    return { x: cx + Math.cos(angle) * rx * jitter, y: cy + Math.sin(angle) * ry * jitter };
  });
  return closedSpline(pts);
}

/** A regular ellipse as a path, for when a shape slot wants one uniform type. */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return (
    `M ${n(cx - rx)} ${n(cy)}` +
    ` A ${n(rx)} ${n(ry)} 0 1 1 ${n(cx + rx)} ${n(cy)}` +
    ` A ${n(rx)} ${n(ry)} 0 1 1 ${n(cx - rx)} ${n(cy)} Z`
  );
}

/**
 * Open sine wave running left to right. Used as a divider, as the top edge of a
 * colour band, and as the spine a squiggle is built from.
 */
export function wavePath(
  x: number,
  y: number,
  width: number,
  amplitude: number,
  wavelength: number,
  phase = 0,
): string {
  const cycles = Math.max(1, Math.round(width / Math.max(1, wavelength)));
  const step = width / cycles;
  const dir = phase === 0 ? 1 : -1;
  let d = `M ${n(x)} ${n(y)}`;
  for (let i = 0; i < cycles; i++) {
    const x0 = x + i * step;
    const sign = i % 2 === 0 ? dir : -dir;
    d +=
      ` Q ${n(x0 + step / 2)} ${n(y + amplitude * sign)}` +
      ` ${n(x0 + step)} ${n(y)}`;
  }
  return d;
}

/**
 * A tight hand-drawn underline squiggle. Same maths as `wavePath` with a short
 * wavelength; separate because the call sites mean different things and the
 * defaults differ by an order of magnitude.
 */
export function squigglePath(x: number, y: number, width: number, amplitude = 6): string {
  return wavePath(x, y, width, amplitude, Math.max(12, amplitude * 3.2));
}

/** Star with `points` spikes, alternating outer and inner radius. */
export function starPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points = 5,
  rotation = -Math.PI / 2,
): string {
  const verts: Point[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rotation + (i / (points * 2)) * TAU;
    verts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return polyline(verts, true);
}

/**
 * The four-pointed sparkle — concave sides rather than straight ones, which is
 * what separates it from a thin star. The stickers, price badges and "new!"
 * marks on every reference sheet are built from this one shape.
 */
export function sparklePath(cx: number, cy: number, r: number, waist = 0.18): string {
  const w = r * waist;
  return (
    `M ${n(cx)} ${n(cy - r)}` +
    ` C ${n(cx + w)} ${n(cy - w)} ${n(cx + w)} ${n(cy - w)} ${n(cx + r)} ${n(cy)}` +
    ` C ${n(cx + w)} ${n(cy + w)} ${n(cx + w)} ${n(cy + w)} ${n(cx)} ${n(cy + r)}` +
    ` C ${n(cx - w)} ${n(cy + w)} ${n(cx - w)} ${n(cy + w)} ${n(cx - r)} ${n(cy)}` +
    ` C ${n(cx - w)} ${n(cy - w)} ${n(cx - w)} ${n(cy - w)} ${n(cx)} ${n(cy - r)} Z`
  );
}

/**
 * Starburst badge — many short sharp spikes, the shape a price or a "50% OFF"
 * sits inside. Distinct from `starPath` only in intent and default spike count,
 * but the call sites read far better for having both.
 */
export function burstPath(cx: number, cy: number, outerR: number, innerR: number, spikes = 12): string {
  return starPath(cx, cy, outerR, innerR, spikes, -Math.PI / 2);
}

/**
 * Scalloped seal — a circle with small rounded bumps around its rim, the
 * "quality stamp" shape stickers and crests use. Distinct from `burstPath`'s
 * sharp spikes, which read as loud rather than official.
 */
export function scallopedCirclePath(cx: number, cy: number, r: number, bumps = 16): string {
  const bumpDepth = r * 0.08;
  const step = TAU / (bumps * 2);
  const pts: Point[] = [];
  for (let i = 0; i < bumps * 2; i++) {
    const angle = i * step;
    const radius = i % 2 === 0 ? r : r - bumpDepth;
    pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
  }
  return polyline(pts, true);
}

/**
 * A short rotated strip — washi tape stuck across a corner. `angleDeg` rotates
 * the strip about its own centre before it is handed back as a plain path, so
 * the caller never needs an SVG `transform`.
 */
export function tapeStripPath(cx: number, cy: number, w: number, h: number, angleDeg: number): string {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ].map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
  return polyline(corners, true);
}

/** Open circular arc, angles in radians, sweeping clockwise from `start`. */
export function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const x0 = cx + Math.cos(start) * r;
  const y0 = cy + Math.sin(start) * r;
  const x1 = cx + Math.cos(end) * r;
  const y1 = cy + Math.sin(end) * r;
  const large = Math.abs(end - start) > Math.PI ? 1 : 0;
  const sweep = end > start ? 1 : 0;
  return `M ${n(x0)} ${n(y0)} A ${n(r)} ${n(r)} 0 ${large} ${sweep} ${n(x1)} ${n(y1)}`;
}

/**
 * The invisible baseline an arched headline is set along. Returned separately
 * from `arcPath` because text on a path must never be visible itself, and
 * because the sweep direction decides whether the words curve up or down.
 */
export function arcTextPath(
  cx: number,
  cy: number,
  r: number,
  opts: { direction?: "up" | "down"; spread?: number } = {},
): string {
  const spread = opts.spread ?? Math.PI * 0.66;
  if (opts.direction === "down") {
    // Cap: the baseline bows upward, so text reads along the top of the circle.
    const start = -Math.PI / 2 - spread / 2;
    const end = -Math.PI / 2 + spread / 2;
    return arcPath(cx, cy + r, r, start, end);
  }
  // Cup: the baseline bows downward, text reads along the bottom of the circle.
  const start = Math.PI / 2 + spread / 2;
  const end = Math.PI / 2 - spread / 2;
  return arcPath(cx, cy - r, r, start, end);
}

/**
 * Id for the invisible path an arched headline is set along.
 *
 * `checkEditability` (`src/core/export/index.ts:54`) fails any export
 * containing a `<path>` whose id mentions headline/copy/text/label — and the
 * element being arched is very often called exactly `headline`, so the obvious
 * `${id}-guide` would fail every export of an arched flyer. The words are
 * substituted rather than stripped so distinct elements keep distinct ids.
 */
export function arcGuideId(elementId: string): string {
  // The replacements use "_", which `specElementSchema` forbids in an element
  // id (`/^[a-z0-9-]+$/`). That makes the encoding injective: an element
  // literally named "hl" cannot collide with the sanitised form of "headline",
  // which a plain abbreviation would.
  const safe = elementId
    .replace(/headline/gi, "_h")
    .replace(/copy/gi, "_c")
    .replace(/text/gi, "_t")
    .replace(/label/gi, "_l");
  return `arcguide-${safe}`;
}

/** Regular polygon; `rotation` in radians, 0 puts a vertex due east. */
export function polygonPath(cx: number, cy: number, r: number, sides: number, rotation = 0): string {
  if (sides < 3) throw new Error("polygonPath needs at least 3 sides");
  const verts = Array.from({ length: sides }, (_, i) => {
    const angle = rotation + (i / sides) * TAU;
    return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
  });
  return polyline(verts, true);
}

/** Banner ribbon: a rectangle with swallow-tail notches cut into both ends. */
export function ribbonPath(x: number, y: number, w: number, h: number, notch = h * 0.32): string {
  const cut = Math.min(notch, w / 2 - 1);
  return polyline(
    [
      { x, y },
      { x: x + w, y },
      { x: x + w - cut, y: y + h / 2 },
      { x: x + w, y: y + h },
      { x, y: y + h },
      { x: x + cut, y: y + h / 2 },
    ],
    true,
  );
}

/**
 * A hanging string of pennants — the party-bunting banner draped across the
 * top of an event poster. Not a new drawing technique: the cord is a sampled
 * sag curve like `dashedRoutePath` bows between two points, and each pennant
 * is the same swallow-tail-free triangle shape used elsewhere. Returned as
 * separate pieces (the cord to stroke, one triangle per pennant to fill,
 * each with its own alternating index) because a cord and a filled pennant
 * need different paint — one `d` string forcing one fill/stroke would have
 * to compromise on both.
 *
 * The cord's sag and the pennants' drop are budgeted as fixed fractions of
 * `rect.h` (40% / 60%) rather than derived from the pennant width, so the
 * whole shape is *guaranteed* to fit inside `rect` — deliberately, since the
 * caller uses this same rect as the keep-out bbox before any of this geometry
 * exists. A bbox that understates its own ink is exactly the bug a full-page
 * frame decoration had; this shape budgets its way out of repeating it.
 */
export function buntingStringPath(
  rect: Rect,
  count: number,
): { cord: string; pennants: { d: string; index: number }[] } {
  const { x, y, w, h } = rect;
  const sag = h * 0.4;
  const dropBudget = h * 0.6;
  const pennantW = Math.min((w / count) * 0.6, dropBudget / 1.15);
  const anchors: Point[] = Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    return { x: x + t * w, y: y + Math.sin(t * Math.PI) * sag };
  });
  const cord = polyline(anchors, false);
  const pennants = Array.from({ length: count }, (_, i) => {
    const a = anchors[i]!;
    const b = anchors[i + 1]!;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    return {
      d: polyline(
        [
          { x: mx - pennantW / 2, y: my },
          { x: mx + pennantW / 2, y: my },
          { x: mx, y: my + pennantW * 1.15 },
        ],
        true,
      ),
      index: i,
    };
  });
  return { cord, pennants };
}

/**
 * A rectangle with one ragged edge, as if torn from paper. `edge` names the
 * side that tears; the other three stay straight so the shape still butts
 * cleanly against a layout box.
 */
export function tornEdgePath(
  rect: Rect,
  edge: "top" | "bottom" | "left" | "right",
  rng: Pick<Rng, "float">,
  opts: { amplitude?: number; teeth?: number } = {},
): string {
  const { x, y, w, h } = rect;
  const horizontal = edge === "top" || edge === "bottom";
  const span = horizontal ? w : h;
  // Below about 5% of the span a tear reads as a wobbly line rather than torn
  // paper, so the default errs on the visible side.
  const amplitude = opts.amplitude ?? Math.max(6, Math.min(span * 0.05, 22));
  const teeth = Math.max(4, opts.teeth ?? Math.round(span / 42));

  // Walk the torn side, jittering along the axis perpendicular to it.
  const tear: Point[] = [];
  for (let i = 0; i <= teeth; i++) {
    const t = i / teeth;
    const offset = (rng.float() - 0.5) * 2 * amplitude;
    if (edge === "top") tear.push({ x: x + t * w, y: y + offset });
    else if (edge === "bottom") tear.push({ x: x + w - t * w, y: y + h + offset });
    else if (edge === "left") tear.push({ x: x + offset, y: y + h - t * h });
    else tear.push({ x: x + w + offset, y: y + t * h });
  }

  const corners: Record<typeof edge, Point[]> = {
    top: [
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
    bottom: [
      { x, y },
      { x: x + w, y },
    ],
    left: [
      { x: x + w, y },
      { x: x + w, y: y + h },
    ],
    right: [
      { x, y: y + h },
      { x, y },
    ],
  };

  return polyline([...tear, ...corners[edge]], true);
}

/**
 * The bowed dashed line joining two points — the flight path that connects
 * circular photo cutouts on a travel poster. `bow` is how far the arc lifts off
 * the straight line, as a fraction of the distance between the endpoints; the
 * sign decides which side it bulges toward.
 */
export function dashedRoutePath(from: Point, to: Point, bow = 0.28): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  // Control point pushed along the normal of the chord.
  const cx = midX - dy * bow;
  const cy = midY + dx * bow;
  return `M ${n(from.x)} ${n(from.y)} Q ${n(cx)} ${n(cy)} ${n(to.x)} ${n(to.y)}`;
}

/** Midpoint of the curve `dashedRoutePath` draws — where a plane motif rides. */
export function routeMidpoint(from: Point, to: Point, bow = 0.28): Point & { angle: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const cx = (from.x + to.x) / 2 - dy * bow;
  const cy = (from.y + to.y) / 2 + dx * bow;
  // Quadratic at t=0.5, and its tangent there (which is simply the chord).
  return {
    x: 0.25 * from.x + 0.5 * cx + 0.25 * to.x,
    y: 0.25 * from.y + 0.5 * cy + 0.25 * to.y,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

/**
 * Checkerboard cells covering `rect`. Returns only the filled squares, so the
 * caller draws half as many nodes as a full grid would need.
 */
export function checkerRects(rect: Rect, cell: number): Rect[] {
  const out: Rect[] = [];
  const cols = Math.ceil(rect.w / cell);
  const rows = Math.ceil(rect.h / cell);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if ((row + col) % 2 !== 0) continue;
      const x = rect.x + col * cell;
      const y = rect.y + row * cell;
      out.push({
        x,
        y,
        w: Math.min(cell, rect.x + rect.w - x),
        h: Math.min(cell, rect.y + rect.h - y),
      });
    }
  }
  return out;
}

/** Parallel stripes filling `rect`. Rotate the group to get diagonals. */
export function stripeRects(rect: Rect, stripeWidth: number, gap: number): Rect[] {
  const out: Rect[] = [];
  const pitch = stripeWidth + gap;
  if (pitch <= 0) return out;
  for (let x = rect.x; x < rect.x + rect.w; x += pitch) {
    out.push({ x, y: rect.y, w: Math.min(stripeWidth, rect.x + rect.w - x), h: rect.h });
  }
  return out;
}

/**
 * A single repeating tile, to be emitted as `<pattern>` and referenced by one
 * `fill="url(#…)"`.
 *
 * This is the form to reach for by default. The `*Rects` helpers above
 * enumerate every cell, which is fine for a deliberate six-square accent but
 * catastrophic for a field: the existing grain texture emits 900 `<circle>`
 * elements and a halftone field ~1600, where the equivalent pattern is a few
 * hundred bytes. Diagonals come from `patternTransform`, not from rotating
 * thousands of nodes.
 */
export type Tile = { w: number; h: number; d: string };

/** Two filled squares on a 2×2 grid — the classic check. */
export function checkerTile(cell: number): Tile {
  return {
    w: cell * 2,
    h: cell * 2,
    d:
      polyline([{ x: 0, y: 0 }, { x: cell, y: 0 }, { x: cell, y: cell }, { x: 0, y: cell }], true) +
      " " +
      polyline(
        [
          { x: cell, y: cell },
          { x: cell * 2, y: cell },
          { x: cell * 2, y: cell * 2 },
          { x: cell, y: cell * 2 },
        ],
        true,
      ),
  };
}

/** One bar per pitch; rotate the pattern to get diagonal stripes. */
export function stripeTile(stripeWidth: number, gap: number): Tile {
  const pitch = stripeWidth + gap;
  return {
    w: pitch,
    h: pitch,
    d: polyline(
      [
        { x: 0, y: 0 },
        { x: stripeWidth, y: 0 },
        { x: stripeWidth, y: pitch },
        { x: 0, y: pitch },
      ],
      true,
    ),
  };
}

/** One dot per cell — halftone, confetti ground, risograph dot field. */
export function halftoneTile(cell: number, radius: number): Tile {
  return { w: cell, h: cell, d: ellipsePath(cell / 2, cell / 2, radius, radius) };
}

/**
 * Irregular speckle for paper grain. The dots are jittered *within the tile*,
 * so the field still reads as grain rather than as a lattice, while costing a
 * dozen nodes instead of the 900 circles the old background emitted.
 *
 * Seeded rather than `feTurbulence` on purpose: turbulence is an implementation
 * detail of the renderer's noise function, so a resvg upgrade would silently
 * change every flyer and the golden test — which compares runs to each other,
 * not to a stored baseline — would not notice.
 */
export function grainTile(size: number, count: number, rng: Pick<Rng, "float">): Tile {
  let d = "";
  for (let i = 0; i < count; i++) {
    const x = rng.float() * size;
    const y = rng.float() * size;
    const r = 0.5 + rng.float();
    d += `${ellipsePath(x, y, r, r)} `;
  }
  return { w: size, h: size, d: d.trim() };
}

/** Thin cross-hatch, for graph-paper and blueprint grounds. */
export function gridTile(cell: number, lineWidth: number): Tile {
  return {
    w: cell,
    h: cell,
    d:
      polyline([{ x: 0, y: 0 }, { x: cell, y: 0 }, { x: cell, y: lineWidth }, { x: 0, y: lineWidth }], true) +
      " " +
      polyline([{ x: 0, y: 0 }, { x: lineWidth, y: 0 }, { x: lineWidth, y: cell }, { x: 0, y: cell }], true),
  };
}

/**
 * Concentric arcs — the rainbow/sunburst band that sits behind a headline in
 * half the retro references. Returned outermost first so they stack correctly
 * when drawn in order.
 */
export function arcBands(
  cx: number,
  cy: number,
  outerR: number,
  bands: number,
  opts: { spread?: number; direction?: "up" | "down" } = {},
): { d: string; radius: number }[] {
  const spread = opts.spread ?? Math.PI;
  const up = opts.direction !== "down";
  const start = up ? Math.PI : 0;
  const end = up ? Math.PI + spread : spread;
  return Array.from({ length: bands }, (_, i) => {
    const radius = outerR * (1 - i / bands);
    return { d: arcPath(cx, cy, radius, start, end), radius };
  });
}

/** Straight-segment path through points, optionally closed. */
export function polyline(points: Point[], close = false): string {
  if (points.length === 0) return "";
  const [head, ...rest] = points;
  let d = `M ${n(head!.x)} ${n(head!.y)}`;
  for (const p of rest) d += ` L ${n(p.x)} ${n(p.y)}`;
  return close ? `${d} Z` : d;
}

/** Rounded rectangle as a path, so it can go anywhere a `d` is expected. */
export function roundedRectPath(rect: Rect, radius: number): string {
  const r = Math.max(0, Math.min(radius, rect.w / 2, rect.h / 2));
  const { x, y, w, h } = rect;
  if (r === 0) return polyline([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], true);
  return (
    `M ${n(x + r)} ${n(y)}` +
    ` H ${n(x + w - r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}` +
    ` V ${n(y + h - r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}` +
    ` H ${n(x + r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}` +
    ` V ${n(y + r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)} Z`
  );
}

/**
 * An arch — a rectangle whose top is a semicircle. The single most common
 * photo-frame shape in contemporary poster design, and the reason
 * `masked-image` has an `arch` variant.
 */
export function archPath(rect: Rect): string {
  const { x, y, w, h } = rect;
  const r = w / 2;
  const shoulder = Math.max(y + r, y);
  return (
    `M ${n(x)} ${n(y + h)}` +
    ` V ${n(shoulder)}` +
    ` A ${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(shoulder)}` +
    ` V ${n(y + h)} Z`
  );
}

// ---------------------------------------------------------------------------
// Motifs
// ---------------------------------------------------------------------------

/**
 * Hand-authored flat vector marks, each drawn inside a 0–100 square so callers
 * can place and scale them uniformly. These are authored rather than pulled
 * from an icon library on purpose: a bundled icon set would drag in a licence,
 * a build step and a house style that is not ours.
 *
 * `fillRule: "evenodd"` where a subpath punches a hole (the pin, the camera).
 * `stroke: true` draws it as an outline instead of a fill — the hand-drawn
 * line-art register (a sketched cake, a bow) that a filled silhouette cannot
 * reach; callers must check it, since a stroked path with no fill would
 * otherwise render as nothing.
 */
/**
 * The six theme slots any recolourable mark can draw from — shared by
 * `composed-figure`'s own `tone` prop (`figure.tsx` imports this rather
 * than declaring a second copy) and by a multi-layer motif's per-layer
 * `data-tone`. Deliberately the *same* six names as the flyer's resolved
 * palette (`ink`/`accent`/`accent2`/`muted`/`paper`/`ground`), not free-form
 * colour names — a motif that used arbitrary colour words instead of these
 * would need its own resolver per caller instead of reusing the one the
 * rest of the renderer already has.
 */
export const MOTIF_TONES = ["ink", "accent", "accent2", "muted", "paper", "ground"] as const;
export type MotifTone = (typeof MOTIF_TONES)[number];

/** One independently-recolourable region of a multi-layer motif. */
export type MotifLayer = { tone: MotifTone; d: string; fillRule?: "evenodd" };

export type Motif = {
  /** Every layer's `d` concatenated into one path — the single-colour render every caller already knows how to draw, always populated even for a multi-layer motif so nothing breaks if a caller doesn't (yet) know about `layers`. */
  d: string;
  fillRule?: "evenodd";
  stroke?: boolean;
  /** From the SVG's own `<title>` — a short, human (and agent) readable description. */
  title?: string;
  /**
   * From the SVG's own `<desc>` — the longer usage note an agent actually
   * needs (what it looks like, when to reach for it, what it is not). Title
   * is the one-liner; this is the paragraph. Searched at the same weight as
   * the title, so a query for "bakery" can find a cake whose id never says so.
   */
  desc?: string;
  /** From `data-tags` on the `<svg>` — extra search terms that wouldn't fit a sentence. */
  tags?: string[];
  /** The subfolder it was found in (e.g. "celebration"), if any. */
  category?: string;
  /**
   * Present only when the source file tagged its paths with `data-tone` —
   * each layer drawn in its own resolved theme colour instead of one flat
   * fill. Absent for the (still fully supported) single-colour convention.
   */
  layers?: MotifLayer[];
};

/**
 * Directional motifs — ones that point somewhere — are all authored pointing
 * along **+x (due right)**. Callers aim them by rotating to a bearing, and that
 * only composes correctly if every mark starts from the same zero. The plane
 * was first drawn nosing up-right, which made `rotate(routeAngle)` aim it about
 * 45° off course; the convention exists so that cannot recur.
 */
export const DIRECTIONAL_MOTIFS = ["plane", "arrow"] as const;

/**
 * Every motif, loaded from `src/creative/motifs/**\/*.svg` — one file per
 * motif, filename (minus `.svg`) is the id. Lives in `src/creative/`
 * alongside every other hand-authored design-content file (metaphors,
 * materials, colour logic, gestures, …) — motifs are creative library
 * content, not component code, the same way those are. Organised into
 * subfolders by subject (`celebration/`, `nature/`, `communication/`,
 * `objects/` today) — folders are for a human browsing the tree; the id is
 * always just the filename, flat, so `draw.motif` in a
 * composition never needs to know the path. Two files with the same name in
 * different folders is a startup error (`loadMotifData` below), not a silent
 * pick-one — ids must stay unique across the whole tree.
 *
 * This used to be a ~280-line object literal of hand-built path strings.
 * Moved to a folder for one reason: growing this library should not require
 * reading TypeScript. Drop in a single-colour SVG — a shape you drew, one
 * exported from an icon tool, anything with plain `<path>` elements on a
 * `viewBox="0 0 100 100"` — and it becomes a usable, theme-recolourable
 * motif with no code change. `readdirSync`/`readFileSync` run once, at
 * import time (Node ESM allows synchronous fs at module scope; there is no
 * build step here — `tsx` runs this file directly in dev, test and prod
 * alike, so the folder resolves identically everywhere, no matter how many
 * files are in it).
 *
 * The convention a dropped-in file must follow, same shape `Motif` already
 * required:
 * - `viewBox="0 0 100 100"`, one or more `<path d="…">` elements. Multiple
 *   paths concatenate into one `d` string, same as `ellipsePath(...) +
 *   ellipsePath(...)` did inline before.
 * - `fill-rule="evenodd"` on any path → the motif punches holes (a ring, a
 *   cutout eye) instead of unioning overlapping loops.
 * - `fill="none"` on any path → sketched line art (`stroke: true`): drawn
 *   with the theme's ink as a stroke, not a fill.
 * - `data-tone="ink|accent|accent2|muted|paper|ground"` on EVERY path (all
 *   or none — a mix is a startup error) → a multi-layer motif. Each path
 *   still leaves the actual colour unspecified — `data-tone` names which of
 *   the flyer's six theme slots that region resolves against, not a colour
 *   itself, so the whole file still repaints correctly in any palette. Two
 *   balloons in one motif, one `accent` and one `accent2`, read as two real
 *   objects instead of one flat silhouette; `src/creative/motifs/
 *   celebration/balloon-bunch.svg` is a real, working example, not just
 *   documentation. Paths sharing a tone concatenate into one layer, same as
 *   the single-colour case. Cannot combine with `fill="none"` line art in
 *   the same file (sketched line art is inherently one stroke colour).
 * - Directional motifs point along +x (due right) — callers rotate to aim.
 * - **`<title>One short sentence.</title>`** — the one-liner. Required; no
 *   fallback synthesises one from the filename.
 * - **`<desc>…</desc>`** — the paragraph an agent actually needs: what it
 *   looks like, when to reach for it, what it is not, which regions recolour.
 *   Searched at the same weight as the title.
 * - **`data-tags="cake,birthday,bakery"`** on the `<svg>` — extra search
 *   terms that wouldn't read naturally in a sentence. Comma-separated.
 *
 * What does NOT belong here: a real multi-colour illustration with actual
 * baked-in colour choices (an icon-pack export, a downloaded illustration),
 * a raster image, or a gradient in the file. Every motif — single-layer or
 * multi-layer — is recoloured to the flyer's own palette at render time,
 * never carrying a colour of its own; `data-tone` names *which* theme slot a
 * region resolves against, it is not itself a colour. `loadMotifData` checks
 * for exactly the file-had-its-own-colours mistake (a colourful icon pack
 * SVG dropped in instead of a plain recolourable one) and fails loudly
 * rather than silently flattening or
 * mis-rendering it. A full-colour asset (a logo, a supplied photo) embeds
 * as-is through `POST /v1/assets` instead — see the "asset vs motif"
 * distinction in `docs/GAP-ANALYSIS.md` (2026-08-05). Effects like a glow,
 * reflection or drop shadow (the Canva-style polish) are also not something
 * to bake into the file — they're a render-time concern here too, computed
 * from the flyer's own light (`shaded: true`, see `figure.tsx`), for the
 * same reason: baked-in lighting can't adapt to a different palette or a
 * different part of the page.
 */
const MOTIFS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "creative", "motifs");

function svgAttr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
}

function unescapeSvgText(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim();
}

/** First `<title>…</title>` text content, if the file has one. */
function svgTitle(xml: string): string | undefined {
  const text = xml.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  if (text === undefined) return undefined;
  return unescapeSvgText(text);
}

/** First `<desc>…</desc>` text content, if the file has one. */
function svgDesc(xml: string): string | undefined {
  const text = xml.match(/<desc>([\s\S]*?)<\/desc>/)?.[1];
  if (text === undefined) return undefined;
  return unescapeSvgText(text);
}

/** `data-tags` on the root `<svg>`, split on commas. */
function svgTags(xml: string): string[] | undefined {
  const raw = xml.match(/<svg\b[^>]*\bdata-tags="([^"]*)"/)?.[1];
  if (!raw) return undefined;
  const tags = raw.split(",").map((t) => t.trim()).filter(Boolean);
  return tags.length > 0 ? tags : undefined;
}

/**
 * The mistake this guards against: someone drops in a real multi-colour SVG
 * (an icon pack export, a downloaded illustration with baked-in fills and
 * gradients) expecting it to "just work" like a motif. It would load and
 * render — with every path forced to the caller's single recolour tone,
 * destroying whatever made it multi-colour — which is a worse failure than
 * an error, because nothing about the render looks obviously broken, it
 * just looks wrong in a way that's hard to trace back to "the source file
 * wasn't single-tone." Fail at load time instead, naming the file.
 *
 * This does NOT reject a *declared* multi-layer motif (`data-tone="…"` on
 * each path, no relation checked by this function — that's an attribute,
 * not a colour, and stays unset here on purpose; `resolveLayers` validates
 * the tone names separately). The two are different things: an arbitrary
 * baked-in hex value is a colour nobody chose for this flyer's palette; a
 * named tone is still resolved by the caller, the same guarantee every
 * single-colour motif already has, just applied per region instead of to
 * the whole shape.
 */
function rejectIfNotSingleTone(file: string, xml: string): void {
  if (/<(image|linearGradient|radialGradient)\b/.test(xml)) {
    throw new Error(
      `Motif file ${file} embeds a raster image or a gradient — motifs must be single-tone vector ` +
        `paths, recoloured at render time. A full-colour illustration belongs in POST /v1/assets instead.`,
    );
  }
  const fills = [...xml.matchAll(/\bfill="([^"]*)"/g)]
    .map((m) => m[1])
    .filter((v) => v !== "none" && v !== "currentColor" && !v.startsWith("url("));
  const distinctColours = new Set(fills);
  if (distinctColours.size > 0) {
    throw new Error(
      `Motif file ${file} sets an explicit fill colour (${[...distinctColours].join(", ")}) on a path. ` +
        `Motifs must leave colour unspecified — it is set by the caller at render time so the same file ` +
        `works in any palette (or, for a deliberately multi-region motif, tag the path with data-tone="…" ` +
        `instead of a fill colour — see MOTIF_TONES). Remove the fill attribute (or set fill="none" for line art).`,
    );
  }
}

/**
 * Groups a motif's `<path>` tags into named, independently-recolourable
 * layers when any path declares `data-tone` — the multi-colour convention.
 * `undefined` (not an empty array) when no path uses it, so a classic
 * single-colour motif's `Motif.layers` stays absent, not `[]`.
 */
function resolveLayers(
  file: string,
  pathTags: string[],
): MotifLayer[] | undefined {
  const withTone = pathTags.filter((tag) => svgAttr(tag, "data-tone") !== undefined);
  if (withTone.length === 0) return undefined;
  if (withTone.length !== pathTags.length) {
    throw new Error(
      `Motif file ${file} tags some <path> elements with data-tone and leaves others untagged — once a ` +
        `motif declares layers, every path needs a data-tone (a path with no assigned layer would never ` +
        `be drawn in any colour).`,
    );
  }
  const byTone = new Map<MotifTone, { ds: string[]; fillRule?: "evenodd" }>();
  const order: MotifTone[] = [];
  for (const tag of pathTags) {
    const tone = svgAttr(tag, "data-tone")!;
    if (!(MOTIF_TONES as readonly string[]).includes(tone)) {
      throw new Error(
        `Motif file ${file} has a path with data-tone="${tone}", which isn't one of ${MOTIF_TONES.join(", ")}.`,
      );
    }
    const d = svgAttr(tag, "d");
    if (!d) continue;
    if (!byTone.has(tone as MotifTone)) {
      byTone.set(tone as MotifTone, { ds: [] });
      order.push(tone as MotifTone);
    }
    const entry = byTone.get(tone as MotifTone)!;
    entry.ds.push(d);
    if (svgAttr(tag, "fill-rule") === "evenodd") entry.fillRule = "evenodd";
  }
  return order.map((tone) => {
    const { ds, fillRule } = byTone.get(tone)!;
    return { tone, d: ds.join(" "), ...(fillRule ? { fillRule } : {}) };
  });
}

/** Exported so tests can point it at a throwaway fixture directory — same pattern as `loadCuratedLibrary`. */
export function loadMotifData(dir: string = MOTIFS_DIR): Record<string, Motif> {
  const out: Record<string, Motif> = {};
  const seenAt = new Map<string, string>();
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name.endsWith(".svg"))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const id = entry.name.slice(0, -4);
    // `entry.parentPath` (Node 20.12+) / `entry.path` (older) is the
    // directory the recursive walk found this file in.
    const entryDir = (entry as { parentPath?: string; path?: string }).parentPath ?? entry.path ?? dir;
    const relFile = join(entryDir, entry.name).slice(dir.length + 1);
    const prior = seenAt.get(id);
    if (prior) {
      throw new Error(`Motif id "${id}" is used twice: ${prior} and ${relFile} — ids must be unique across all subfolders`);
    }
    seenAt.set(id, relFile);

    const xml = readFileSync(join(entryDir, entry.name), "utf8");
    rejectIfNotSingleTone(relFile, xml);
    const pathTags = [...xml.matchAll(/<path\b[^>]*\/?>/g)].map((m) => m[0]);
    if (pathTags.length === 0) {
      throw new Error(`Motif file ${relFile} has no <path> element — nothing to draw`);
    }
    const d = pathTags
      .map((tag) => svgAttr(tag, "d"))
      .filter((v): v is string => Boolean(v))
      .join(" ");
    const fillRule = pathTags.some((tag) => svgAttr(tag, "fill-rule") === "evenodd")
      ? ("evenodd" as const)
      : undefined;
    const stroke = pathTags.some((tag) => svgAttr(tag, "fill") === "none");
    const layers = resolveLayers(relFile, pathTags);
    if (layers && stroke) {
      throw new Error(
        `Motif file ${relFile} mixes data-tone layers with fill="none" line art — a multi-colour motif ` +
          `must be fully filled; sketched/stroked motifs stay single-tone.`,
      );
    }
    const title = svgTitle(xml);
    const desc = svgDesc(xml);
    const tags = svgTags(xml);
    // Both the motifs README and CLAUDE.md's "Creative library conventions"
    // say these are required — enforce it here too, not just in prose. A
    // library heading toward hundreds of files needs the load-time check;
    // "an agent will notice the empty description" does not scale.
    if (!title) {
      throw new Error(`Motif file ${relFile} has no <title> — every motif needs one (see src/creative/motifs/README.md).`);
    }
    if (!desc) {
      throw new Error(`Motif file ${relFile} has no <desc> — every motif needs one (see src/creative/motifs/README.md).`);
    }
    // The subfolder a motif was found in (e.g. "celebration"), or undefined
    // for one placed directly in motifs/ — purely descriptive metadata for
    // search/browsing, never part of the id.
    const category = relFile.includes("/") ? relFile.split("/")[0] : undefined;
    out[id] = {
      d,
      ...(fillRule ? { fillRule } : {}),
      ...(stroke ? { stroke } : {}),
      ...(title ? { title } : {}),
      ...(desc ? { desc } : {}),
      ...(tags ? { tags } : {}),
      ...(category ? { category } : {}),
      ...(layers ? { layers } : {}),
    };
  }
  return out;
}

const MOTIF_DATA: Record<string, Motif> = loadMotifData();

export const MOTIFS: Record<string, Motif> = MOTIF_DATA;

export type MotifName = string;

export const MOTIF_NAMES = Object.keys(MOTIFS) as MotifName[];

export type MotifSearchResult = {
  id: string;
  title?: string;
  desc?: string;
  tags?: string[];
  category?: string;
  stroke: boolean;
  /** Theme slots this motif paints, when it is multi-layer. Absent for a single-colour mark. */
  tones?: MotifTone[];
  score: number;
};

/**
 * Real, ranked search over the motif library — not a dump of every id for an
 * agent (or a person) to read through, and not ad-hoc point-scoring either.
 * BM25 (`src/lib/search.ts` — read that file's header for why this is BM25
 * and not embeddings) over id/title/desc/tags/category, id weighted highest
 * so an exact or near id match still wins ties.
 */
export function searchMotifs(query: string, limit = 8): MotifSearchResult[] {
  const documents: SearchDocument[] = MOTIF_NAMES.map((id) => {
    const motif = MOTIFS[id]!;
    return {
      id,
      fields: [
        { text: id, weight: 3 },
        { text: motif.title ?? "", weight: 2 },
        { text: motif.desc ?? "", weight: 2 },
        { text: (motif.tags ?? []).join(" "), weight: 2 },
        { text: motif.category ?? "", weight: 1 },
      ],
    };
  });
  const hits = search(documents, query, Math.max(limit, 16));
  const q = query.trim().toLowerCase();
  if (MOTIFS[q] && !hits.some((h) => h.id === q)) {
    hits.unshift({ id: q, score: Number.POSITIVE_INFINITY });
  }
  return hits
    .sort((a, b) => {
      // An exact id match must win even when a longer id repeats the same
      // word in its desc (searching "balloon" should not lose to
      // "hot-air-balloon"). BM25 alone treats both as the term "balloon".
      const aExact = a.id === q ? 1 : 0;
      const bExact = b.id === q ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      return b.score - a.score || a.id.localeCompare(b.id);
    })
    .slice(0, limit)
    .map((h) => {
    const motif = MOTIFS[h.id]!;
    return {
      id: h.id,
      title: motif.title,
      desc: motif.desc,
      tags: motif.tags,
      category: motif.category,
      stroke: Boolean(motif.stroke),
      ...(motif.layers ? { tones: motif.layers.map((l) => l.tone) } : {}),
      score: h.score,
    };
  });
}

/**
 * Transform placing a 0–100 motif at `x,y` scaled to `size`, optionally rotated
 * about its own centre. Returned as a string so the caller can drop it straight
 * onto a `<g transform>`.
 */
export function motifTransform(x: number, y: number, size: number, rotate = 0): string {
  const scale = size / 100;
  const spin = rotate === 0 ? "" : ` rotate(${n(rotate)} ${n(size / 2)} ${n(size / 2)})`;
  return `translate(${n(x)} ${n(y)})${spin} scale(${n(scale)})`;
}

/**
 * Resolved fills from the flyer's actual palette, not a mix of one ink.
 * Decoration uses this so a balloon-bunch in the corner is the same two
 * accents as the rest of the page, instead of one hue lightened and darkened.
 */
export function tonesFromPalette(palette: {
  fg: string;
  bg: string;
  accent: string;
  accent2: string;
  muted: string;
}): Record<MotifTone, string> {
  return {
    ink: palette.fg,
    accent: palette.accent,
    accent2: palette.accent2,
    muted: palette.muted,
    paper: palette.bg,
    ground: mix(palette.bg, palette.accent, 0.3),
  };
}

/** Reattach a 2-digit hex alpha (from `withAlpha` ink) onto every slot. */
export function tonesWithAlpha(
  tones: Record<MotifTone, string>,
  ink: string,
): Record<MotifTone, string> {
  const raw = ink.replace("#", "");
  const alpha = raw.length === 8 ? raw.slice(6) : "";
  if (!alpha) return tones;
  const withA = (hex: string) => {
    const h = hex.replace("#", "");
    const opaque = h.length === 8 ? h.slice(0, 6) : h;
    return `#${opaque}${alpha}`;
  };
  return {
    ink: withA(tones.ink),
    accent: withA(tones.accent),
    accent2: withA(tones.accent2),
    muted: withA(tones.muted),
    paper: withA(tones.paper),
    ground: withA(tones.ground),
  };
}

export function tonesFromInk(ink: string): Record<MotifTone, string> {
  // Decor ink is often `withAlpha(...)` — 8-digit hex. `mix` only accepts
  // 6-digit, so peel the alpha, mix the opaque colour, then put the same
  // alpha back so a wash stays a wash across every layer.
  const raw = ink.replace("#", "");
  const opaque = `#${raw.length === 8 ? raw.slice(0, 6) : raw}`;
  const alpha = raw.length === 8 ? raw.slice(6) : "";
  const withA = (hex: string) => (alpha ? `${hex}${alpha}` : hex);
  return {
    ink: withA(mix(opaque, "#111111", 0.45)),
    accent: ink,
    accent2: withA(mix(opaque, "#ffffff", 0.28)),
    muted: withA(mix(opaque, "#ffffff", 0.42)),
    paper: withA(mix(opaque, "#ffffff", 0.72)),
    ground: withA(mix(opaque, "#000000", 0.18)),
  };
}

export type MotifPaint = {
  d: string;
  fill: string;
  fillRule?: "evenodd";
  stroke?: string;
  strokeWidth?: number;
};

/**
 * Turns a loaded motif plus resolved slot colours into the path props a
 * renderer actually paints. Single-colour, multi-layer and line-art all
 * come out of this one function so figure / ground / photo cannot drift.
 */
export function paintMotif(
  motif: Motif,
  primary: string,
  tones: Record<MotifTone, string>,
): MotifPaint[] {
  if (motif.stroke) {
    return [{ d: motif.d, fill: "none", stroke: primary, strokeWidth: 2.5 }];
  }
  if (motif.layers && motif.layers.length > 0) {
    return motif.layers.map((layer) => ({
      d: layer.d,
      fill: tones[layer.tone],
      fillRule: layer.fillRule,
    }));
  }
  return [{ d: motif.d, fill: primary, fillRule: motif.fillRule }];
}

// ---------------------------------------------------------------------------
// Scene primitives
// ---------------------------------------------------------------------------

/**
 * Illustration, not decoration.
 *
 * Almost every reference save-the-trees poster is a *drawn scene* — hills, a
 * sky, a treeline, figures planting — rather than a photograph. The library
 * could draw a single icon on an abstract field (`motif-collage`) and nothing
 * more, which is why our output kept coming back as "photo with a caption".
 *
 * These build the parts of a scene. They are deliberately simple flat forms:
 * the register the references use is flat vector, not rendering.
 */

/** A rolling hill: a wide, shallow arc closed along the bottom of `rect`. */
export function hillPath(rect: Rect, crest: number, lift = 0.55): string {
  const { x, y, w, h } = rect;
  const top = y + h * (1 - lift);
  return (
    `M ${n(x)} ${n(y + h)}` +
    ` L ${n(x)} ${n(top)}` +
    ` Q ${n(x + w * crest)} ${n(top - h * lift * 0.9)} ${n(x + w)} ${n(top)}` +
    ` L ${n(x + w)} ${n(y + h)} Z`
  );
}

/** A conifer — stacked triangles on a short trunk. Reads as "tree" at any size. */
export function coniferPath(cx: number, baseY: number, height: number, tiers = 3): string {
  const w = height * 0.52;
  const trunkW = height * 0.08;
  const trunkH = height * 0.16;
  let d =
    `M ${n(cx - trunkW / 2)} ${n(baseY)} L ${n(cx - trunkW / 2)} ${n(baseY - trunkH)}` +
    ` L ${n(cx + trunkW / 2)} ${n(baseY - trunkH)} L ${n(cx + trunkW / 2)} ${n(baseY)} Z `;
  const canopy = height - trunkH;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const tierTop = baseY - trunkH - canopy * (1 - t) - canopy * 0.12;
    const tierBase = baseY - trunkH - canopy * (0.62 * t);
    const halfW = (w / 2) * (1 - t * 0.42);
    d += `M ${n(cx)} ${n(tierTop)} L ${n(cx + halfW)} ${n(tierBase)} L ${n(cx - halfW)} ${n(tierBase)} Z `;
  }
  return d.trim();
}

/** A broadleaf tree — a round crown on a trunk, the "one tree" of a campaign. */
export function broadleafPath(cx: number, baseY: number, height: number): string {
  const crownR = height * 0.34;
  const crownY = baseY - height + crownR;
  const trunkW = height * 0.1;
  return (
    `M ${n(cx - trunkW / 2)} ${n(baseY)} L ${n(cx - trunkW * 0.35)} ${n(crownY)}` +
    ` L ${n(cx + trunkW * 0.35)} ${n(crownY)} L ${n(cx + trunkW / 2)} ${n(baseY)} Z ` +
    ellipsePath(cx, crownY, crownR * 1.15, crownR)
  );
}

/**
 * A standing figure, heavily simplified — head, body, two legs.
 *
 * Deliberately a silhouette. Illustrated *characters* are a house style we have
 * no business inventing; a plain figure reads as "a person" without pretending
 * to a look we cannot hold consistent across a whole poster.
 */
export function figurePath(cx: number, baseY: number, height: number): string {
  const headR = height * 0.13;
  const headY = baseY - height + headR;
  const shoulderY = headY + headR * 1.6;
  const hipY = baseY - height * 0.42;
  const bodyW = height * 0.2;
  return (
    ellipsePath(cx, headY, headR, headR) +
    ` M ${n(cx - bodyW / 2)} ${n(shoulderY)} L ${n(cx + bodyW / 2)} ${n(shoulderY)}` +
    ` L ${n(cx + bodyW * 0.42)} ${n(hipY)} L ${n(cx - bodyW * 0.42)} ${n(hipY)} Z` +
    ` M ${n(cx - bodyW * 0.4)} ${n(hipY)} L ${n(cx - bodyW * 0.12)} ${n(hipY)}` +
    ` L ${n(cx - bodyW * 0.16)} ${n(baseY)} L ${n(cx - bodyW * 0.44)} ${n(baseY)} Z` +
    ` M ${n(cx + bodyW * 0.12)} ${n(hipY)} L ${n(cx + bodyW * 0.4)} ${n(hipY)}` +
    ` L ${n(cx + bodyW * 0.44)} ${n(baseY)} L ${n(cx + bodyW * 0.16)} ${n(baseY)} Z`
  );
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/**
 * A rectangle with a jittered perimeter — the hand-drawn wobble every
 * scrapbook/kawaii reference draws its border with. Same construction as
 * `tornEdgePath` (walk the edge, jitter perpendicular to it) generalised to
 * all four sides and closed into one loop, then splined like `blobPath`
 * rather than left polygonal, so the wobble reads as a pen line, not a
 * jagged tear.
 */
export function wobblyFramePath(
  rect: Rect,
  rng: Pick<Rng, "float">,
  opts: { amplitude?: number; perSide?: number } = {},
): string {
  const { x, y, w, h } = rect;
  const amplitude = opts.amplitude ?? Math.max(3, Math.min(w, h) * 0.012);
  const perSide = Math.max(3, opts.perSide ?? 6);
  const corners: Point[] = [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const pts: Point[] = [];
  for (let side = 0; side < 4; side++) {
    const from = corners[side]!;
    const to = corners[(side + 1) % 4]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 0; i < perSide; i++) {
      const t = i / perSide;
      const jitter = (rng.float() - 0.5) * 2 * amplitude;
      pts.push({ x: from.x + dx * t + nx * jitter, y: from.y + dy * t + ny * jitter });
    }
  }
  return closedSpline(pts);
}

/**
 * A rectangle's perimeter with small rounded bumps at even intervals — the
 * stamp/seal edge `scallopedCirclePath` draws, carried around a rectangle so
 * it can wrap a whole page rather than sit inside one badge.
 */
export function scallopedFramePath(rect: Rect, bumpR: number, spacing: number): string {
  const { x, y, w, h } = rect;
  const perimeter = 2 * (w + h);
  const count = Math.max(8, Math.round(perimeter / Math.max(1, spacing)));
  const pts: Point[] = [];
  for (let i = 0; i < count; i++) {
    const t = ((i / count) * perimeter) % perimeter;
    let px: number, py: number, nx: number, ny: number;
    if (t < w) {
      px = x + t;
      py = y;
      nx = 0;
      ny = -1;
    } else if (t < w + h) {
      px = x + w;
      py = y + (t - w);
      nx = 1;
      ny = 0;
    } else if (t < 2 * w + h) {
      px = x + w - (t - w - h);
      py = y + h;
      nx = 0;
      ny = 1;
    } else {
      px = x;
      py = y + h - (t - 2 * w - h);
      nx = -1;
      ny = 0;
    }
    const bump = i % 2 === 0 ? bumpR : 0;
    pts.push({ x: px + nx * bump, y: py + ny * bump });
  }
  return closedSpline(pts);
}

/** Water: stacked shallow waves, for a shoreline or a river band. */
export function waterBandPath(rect: Rect, rows = 3): string {
  let d = "";
  for (let i = 0; i < rows; i++) {
    const y = rect.y + (rect.h / rows) * (i + 0.5);
    d += `${wavePath(rect.x, y, rect.w, rect.h * 0.1, rect.w / 4, i % 2)} `;
  }
  return d.trim();
}

