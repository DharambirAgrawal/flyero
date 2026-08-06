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

import type { Rng } from "../lib/rng.js";

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
export type Motif = { d: string; fillRule?: "evenodd"; stroke?: boolean };

/**
 * Directional motifs — ones that point somewhere — are all authored pointing
 * along **+x (due right)**. Callers aim them by rotating to a bearing, and that
 * only composes correctly if every mark starts from the same zero. The plane
 * was first drawn nosing up-right, which made `rotate(routeAngle)` aim it about
 * 45° off course; the convention exists so that cannot recur.
 */
export const DIRECTIONAL_MOTIFS = ["plane", "arrow"] as const;

/** Ray marks for the sun, computed once rather than typed out eight times. */
function sunRays(inner: number, outer: number, width: number, count: number): string {
  let d = "";
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const nx = -Math.sin(a) * width;
    const ny = Math.cos(a) * width;
    const x0 = 50 + Math.cos(a) * inner;
    const y0 = 50 + Math.sin(a) * inner;
    const x1 = 50 + Math.cos(a) * outer;
    const y1 = 50 + Math.sin(a) * outer;
    d +=
      `M ${n(x0 + nx)} ${n(y0 + ny)} L ${n(x1 + nx * 0.6)} ${n(y1 + ny * 0.6)}` +
      ` L ${n(x1 - nx * 0.6)} ${n(y1 - ny * 0.6)} L ${n(x0 - nx)} ${n(y0 - ny)} Z `;
  }
  return d.trim();
}

/**
 * Six overlapping petal circles around a centre disc. `nonzero` (the default
 * fill rule) unions same-direction loops rather than punching holes, so this
 * reads as one solid daisy silhouette — the doodle/Memphis flower every
 * scrapbook and Y2K reference scatters across the page.
 */
function flowerPath(petals = 6, petalR = 20, ringR = 22, centerR = 14): string {
  let d = "";
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * TAU;
    d += `${ellipsePath(50 + Math.cos(a) * ringR, 50 + Math.sin(a) * ringR, petalR, petalR)} `;
  }
  return d.trim() + " " + ellipsePath(50, 50, centerR, centerR);
}

/**
 * Nested bottom-anchored half-discs. With `evenodd`, each ring alternates
 * filled/gap as it crosses one more boundary than the ring outside it, so six
 * concentric arches drawn this way render as three solid bands over a hollow
 * centre — a rainbow, built from the same `archPath` the photo-frame arch
 * uses, not a new primitive.
 */
function rainbowPath(bands = 6, outerW = 96, step = 16): string {
  let d = "";
  for (let i = 0; i < bands; i++) {
    const w = outerW - i * step;
    if (w <= 0) break;
    const h = w / 2;
    d += `${archPath({ x: 50 - w / 2, y: 96 - h, w, h })} `;
  }
  return d.trim();
}

const MOTIF_DATA = {
  /** Paper dart nosing due right, with the swallow-tail notch. */
  plane: { d: "M 98 50 L 4 10 L 28 50 L 4 90 Z" },

  /** Map pin with the hole punched through. */
  pin: {
    d:
      "M 50 99 C 50 99 87 57 87 37 A 37 37 0 1 0 13 37 C 13 57 50 99 50 99 Z " +
      "M 67 36 A 17 17 0 1 1 33 36 A 17 17 0 1 1 67 36 Z",
    fillRule: "evenodd" as const,
  },

  /** Suitcase: body plus the handle above it. */
  suitcase: {
    d:
      "M 8 31 H 92 A 7 7 0 0 1 99 38 V 87 A 7 7 0 0 1 92 94 H 8 A 7 7 0 0 1 1 87 V 38 A 7 7 0 0 1 8 31 Z " +
      "M 34 29 V 19 A 8 8 0 0 1 42 11 H 58 A 8 8 0 0 1 66 19 V 29 H 57 V 20 H 43 V 29 Z",
  },

  /** Camera with the lens cut out. */
  camera: {
    d:
      "M 5 29 H 27 L 35 17 H 65 L 73 29 H 95 A 6 6 0 0 1 101 35 V 84 A 6 6 0 0 1 95 90 H 5 " +
      "A 6 6 0 0 1 -1 84 V 35 A 6 6 0 0 1 5 29 Z " +
      "M 68 58 A 18 18 0 1 1 32 58 A 18 18 0 1 1 68 58 Z",
    fillRule: "evenodd" as const,
  },

  /** Twin peaks. */
  mountain: { d: "M 1 89 L 33 27 L 51 60 L 66 38 L 99 89 Z" },

  /** Disc plus eight rays. */
  sun: { d: `M 72 50 A 22 22 0 1 1 28 50 A 22 22 0 1 1 72 50 Z ${sunRays(28, 44, 4.5, 8)}` },

  cloud: { d: "M 27 79 A 18 18 0 0 1 27 43 A 24 24 0 0 1 71 35 A 20 20 0 0 1 79 79 Z" },

  leaf: { d: "M 90 10 C 90 60 57 93 10 90 C 10 40 43 7 90 10 Z" },

  /** Blunt chevron arrow pointing right. */
  arrow: { d: "M 3 39 H 59 V 17 L 97 50 L 59 83 V 61 H 3 Z" },

  /** Ticket stub with two bites out of its long sides. */
  ticket: {
    d:
      "M 3 26 H 97 V 42 A 9 9 0 0 0 97 60 V 76 H 3 V 60 A 9 9 0 0 0 3 42 Z",
  },

  /** Compass rose — four tapered points. */
  compass: {
    d:
      "M 50 2 L 60 40 L 98 50 L 60 60 L 50 98 L 40 60 L 2 50 L 40 40 Z",
  },

  /** Five-point star, built from the same generator that draws price bursts. */
  star: { d: starPath(50, 50, 46, 20, 5) },

  /** Two lobes meeting at a point — the classic silhouette, cubic throughout. */
  heart: {
    d: "M 50 88 C 20 65 5 45 5 28 C 5 10 25 2 50 20 C 75 2 95 10 95 28 C 95 45 80 65 50 88 Z",
  },

  /** Six-petal daisy — the doodle/Memphis flower mark. */
  flower: { d: flowerPath() },

  /** Angular bolt, authored rather than generated: no generator reuse would be simpler. */
  lightning: { d: "M 58 2 L 18 54 L 42 54 L 34 98 L 84 40 L 56 40 Z" },

  /** Balloon: an ellipse body, a knot, no string — the string is a stroke, not a fill. */
  balloon: { d: `${ellipsePath(50, 42, 30, 36)} M 42 76 L 58 76 L 50 88 Z` },

  /**
   * Gift box: a solid rounded package plus a bow, deliberately with no
   * ribbon line — a thin `evenodd` cutout through a single-fill silhouette
   * reads as a checkerboard at motif scale, not a ribbon, once tried and
   * rejected. A plain wrapped box with a bow is still unambiguous, including
   * at the small sizes a scattered motif actually renders at.
   */
  gift: {
    d:
      `${roundedRectPath({ x: 14, y: 44, w: 72, h: 52 }, 6)} ` +
      `${roundedRectPath({ x: 44, y: 36, w: 12, h: 12 }, 3)} ` +
      `${ellipsePath(36, 26, 15, 12)} ${ellipsePath(64, 26, 15, 12)}`,
  },

  /** One pennant — the unit a bunting string or a Memphis edge repeats. */
  bunting: { d: "M 15 8 L 85 8 L 50 95 Z" },

  /** One rounded sprinkle — a single confetti piece, meant to be scattered. */
  confetti: { d: roundedRectPath({ x: 30, y: 38, w: 40, h: 24 }, 8) },

  /** Rounded rect plus a tail, both same winding — the tail simply extends it. */
  "speech-bubble": {
    d:
      `${roundedRectPath({ x: 5, y: 8, w: 90, h: 64 }, 18)} ` +
      polyline([{ x: 25, y: 70 }, { x: 45, y: 70 }, { x: 18, y: 96 }], true),
  },

  /** Three concentric bands over a hollow centre — see `rainbowPath`. */
  rainbow: { d: rainbowPath(), fillRule: "evenodd" as const },

  /**
   * Face with two eyes and a mouth cut through it via `evenodd` — the same
   * cutout technique as `gift`'s ribbons, so the ground reads as the features.
   */
  smiley: {
    d:
      `${ellipsePath(50, 50, 46, 46)} ${ellipsePath(34, 40, 6, 6)} ${ellipsePath(66, 40, 6, 6)} ` +
      "M 30 58 Q 50 80 70 58 Q 50 68 30 58 Z",
    fillRule: "evenodd" as const,
  },

  /**
   * Sketched two-tier cake with three candles — hand-drawn line art, not a
   * filled silhouette. `stroke: true` is what makes that possible: the tiers
   * are closed rounded rects, the icing is an open wave, the candles and
   * flames are open strokes, and none of it needs a fill to read.
   */
  cake: {
    d:
      `${roundedRectPath({ x: 14, y: 62, w: 72, h: 30 }, 6)} ` +
      `${roundedRectPath({ x: 28, y: 42, w: 44, h: 24 }, 5)} ` +
      `${wavePath(14, 62, 72, 4, 18)} ` +
      "M 36 42 L 36 26 M 50 42 L 50 22 M 64 42 L 64 26 " +
      "M 36 26 Q 33 19 36 14 Q 39 19 36 26 " +
      "M 50 22 Q 47 15 50 10 Q 53 15 50 22 " +
      "M 64 26 Q 61 19 64 14 Q 67 19 64 26",
    stroke: true,
  },

  /** Two loop ellipses, a knot and two V-notched tails — the corner-bow line-art mark. */
  bow: {
    d:
      `${ellipsePath(30, 42, 20, 14)} ${ellipsePath(70, 42, 20, 14)} ${ellipsePath(50, 42, 8, 8)} ` +
      "M 44 48 L 34 92 L 46 78 M 56 48 L 66 92 L 54 78",
    stroke: true,
  },

  /** Three sparkles at different sizes, scattered like a doodled margin note — one motif, not three placements. */
  "sparkle-doodle": {
    d: `${sparklePath(50, 52, 22)} ${sparklePath(80, 26, 10)} ${sparklePath(18, 76, 8)}`,
  },

  /** Conical party hat, wavy brim, pom-pom tip — sketched line art. */
  "party-hat": {
    d:
      "M 50 8 L 20 85 L 80 85 Z " +
      `${wavePath(20, 85, 60, 4, 8)} ` +
      `${ellipsePath(50, 8, 6, 6)}`,
    stroke: true,
  },

  /** Boxed gift with a ribbon cross and bow, drawn as line art rather than filled — see `gift` for the solid version. */
  "gift-outline": {
    d:
      `${roundedRectPath({ x: 25, y: 40, w: 50, h: 50 }, 4)} ` +
      "M 50 40 L 50 90 M 25 65 L 75 65 " +
      "M 50 40 Q 35 25 50 25 Q 65 25 50 40",
    stroke: true,
  },

  /** Coffee mug with curved steam lines rising from the top rim — sketched line art. */
  "coffee-cup": {
    d:
      `${roundedRectPath({ x: 24, y: 36, w: 42, h: 48 }, 6)} ` +
      "M 66 46 Q 84 46 84 60 Q 84 74 66 74 " +
      `${wavePath(30, 22, 30, 4, 10)} ${wavePath(34, 12, 22, 3, 8)}`,
    stroke: true,
  },

  /** Flare-bottomed ringing bell with top hanger loop and clapper hanging below. */
  bell: {
    d:
      `${ellipsePath(50, 14, 6, 6)} ` +
      "M 32 68 C 32 40 40 24 50 24 C 60 24 68 40 68 68 L 78 76 L 22 76 Z " +
      "M 22 76 Q 50 83 78 76 " +
      `${ellipsePath(50, 84, 7, 7)}`,
    stroke: true,
  },

  /** Twin eighth notes linked by a thick horizontal beam — classic musical notation doodle. */
  "music-note": {
    d:
      `${ellipsePath(25, 75, 10, 7)} ${ellipsePath(65, 65, 10, 7)} ` +
      "M 35 73 L 35 22 L 75 12 L 75 63 M 35 34 L 75 24",
    stroke: true,
  },

  /** Five-pointed regal crown with jewel circles capping each peak and a rounded base band. */
  crown: {
    d:
      `${roundedRectPath({ x: 15, y: 72, w: 70, h: 14 }, 3)} ` +
      "M 15 72 L 15 35 L 32 55 L 50 20 L 68 55 L 85 35 L 85 72 Z " +
      `${ellipsePath(15, 30, 4, 4)} ${ellipsePath(50, 15, 4, 4)} ${ellipsePath(85, 30, 4, 4)}`,
    stroke: true,
  },

  /** Slanted retail price tag with a punched circular hole near its angled top corner. */
  tag: {
    d:
      "M 30 10 L 70 10 L 90 30 L 90 85 A 5 5 0 0 1 85 90 L 15 90 A 5 5 0 0 1 10 85 L 10 30 Z " +
      `${ellipsePath(50, 24, 6, 6)}`,
    fillRule: "evenodd",
  },

  /** Victory cup trophy with curved side handles on a stepped rectangular pedestal. */
  trophy: {
    d:
      `${roundedRectPath({ x: 26, y: 78, w: 48, h: 14 }, 3)} ` +
      "M 44 64 L 44 78 M 56 64 L 56 78 " +
      "M 22 16 H 78 V 36 Q 78 64 50 64 Q 22 64 22 36 Z " +
      "M 22 24 Q 8 24 8 38 Q 8 52 24 50 M 78 24 Q 92 24 92 38 Q 92 52 76 50",
    stroke: true,
  },

  /** Circular peace emblem with a vertical center line and two downward diagonal arms. */
  "peace-sign": {
    d:
      `${ellipsePath(50, 50, 42, 42)} ` +
      "M 50 8 L 50 92 M 50 50 L 20 80 M 50 50 L 80 80",
    stroke: true,
  },

  /** V-shaped martini glass with long stem, wide base, and an olive-on-toothpick garnish. */
  "drink-cocktail": {
    d:
      "M 16 18 L 50 58 L 84 18 Z " +
      "M 50 58 L 50 86 M 30 86 L 70 86 " +
      "M 62 8 L 38 38 " +
      `${ellipsePath(60, 12, 5, 5)}`,
    stroke: true,
  },

  /** Ring donut shape with a central hole punched through a rounded circular outer pastry. */
  donut: {
    d: `${ellipsePath(50, 50, 44, 44)} ${ellipsePath(50, 50, 18, 18)}`,
    fillRule: "evenodd",
  },

  /**
   * Artist palette: a plain oval body, a larger thumbhole punched near the
   * bottom-right edge, and four small paint-daub holes scattered across the
   * top. An earlier draft tried to cut a thumb notch into the outline itself
   * by splicing a hole path into the middle of the body's own path string —
   * that breaks a single closed subpath into a self-intersecting mess (it
   * rendered as a blob with a stray diagonal slash through it). Every hole
   * here is its own independent closed subpath after the body, which is the
   * only way `evenodd` punches a clean hole rather than corrupting the shape
   * it is supposedly punched into.
   */
  palette: {
    d:
      `${ellipsePath(48, 46, 44, 38)} ` +
      `${ellipsePath(70, 74, 9, 8)} ` +
      `${ellipsePath(26, 30, 6, 6)} ${ellipsePath(46, 18, 6, 6)} ${ellipsePath(66, 28, 6, 6)} ${ellipsePath(78, 50, 6, 6)}`,
    fillRule: "evenodd",
  },

  /** Maritime anchor featuring a top attachment ring, long shank, horizontal stock, and curved fluke arms. */
  anchor: {
    d:
      `${ellipsePath(50, 14, 7, 7)} ` +
      "M 50 21 L 50 84 M 22 34 L 78 34 " +
      "M 20 58 C 20 84 80 84 80 58 M 14 64 L 20 58 L 26 66 M 86 64 L 80 58 L 74 66",
    stroke: true,
  },

  /** Four-leaf clover composed of four curved heart-shaped lobes meeting at a central stem. */
  clover: {
    d:
      "M 50 48 Q 32 30 32 18 Q 32 6 50 18 Q 68 6 68 18 Q 68 30 50 48 Z " +
      "M 50 52 Q 32 70 32 82 Q 32 94 50 82 Q 68 94 68 82 Q 68 70 50 52 Z " +
      "M 48 50 Q 30 32 18 32 Q 6 32 18 50 Q 6 68 18 68 Q 30 68 48 50 Z " +
      "M 52 50 Q 70 32 82 32 Q 94 32 82 50 Q 94 68 82 68 Q 70 68 52 50 Z " +
      "M 50 52 Q 46 74 36 94",
    stroke: true,
  },
} as const;

/**
 * Widened to `Motif` so callers can read `fillRule` uniformly — without this the
 * literal type of each entry hides the field on the marks that lack it.
 */
export const MOTIFS: Record<keyof typeof MOTIF_DATA, Motif> = MOTIF_DATA;

export type MotifName = keyof typeof MOTIF_DATA;

export const MOTIF_NAMES = Object.keys(MOTIFS) as MotifName[];

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

