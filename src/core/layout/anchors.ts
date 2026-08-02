/**
 * Relational placement — "the balloon goes top-right of the headline".
 *
 * ## Why this exists
 *
 * The Component Library is fixed: an agent picks from 35 finished components and
 * gets whatever they contain. That is the right default — it is what stops a
 * model inventing raw shapes and hand-placing them, which is AGENTS.md law 1.
 * But it makes one whole class of request impossible. A brief that wants a
 * balloon at the top right, three leaves drifting past a headline, or a sun
 * behind a mountain has no component for it and never will, because those
 * arrangements are one-offs. Nobody is going to add `balloon-top-right.tsx`.
 *
 * So the missing capability is not *more components* — it is a component the
 * agent can **assemble for one flyer and throw away**.
 *
 * ## How this stays inside law 1
 *
 * Law 1 says the LLM never places pixels. It does not say the LLM cannot have
 * an opinion about arrangement — it says the *arithmetic* is ours. So the agent
 * declares **intent**:
 *
 *     { draw: "motif:balloon", size: "small", at: { of: "title", side: "top-right-of", gap: "near" } }
 *
 * and never a coordinate. This module turns that into x/y/w/h. If a part ever
 * carries a number that is a position, the law has been broken and the schema
 * should reject it — which is why `Anchor` has no numeric escape hatch.
 *
 * The distinction is worth being precise about, because it is easy to wave
 * away: "top-right of the headline, near" is a *relationship*, and it stays
 * true when the headline moves, when the canvas resizes, when the type grows a
 * line. `x: 812, y: 190` is a guess that was true once. Only one of those is
 * design.
 *
 * ## Density, which is the other half
 *
 * Gate G3 caps a flyer at 4-7 elements, and it counts elements, not marks. That
 * cap is correct and stays. But it meant a page could only ever hold seven
 * things, so flyers came out sparse — a headline, a photo, a button, and a lot
 * of empty paper. A composed figure is **one element carrying up to eight
 * parts**, so a page can be busy without being cluttered and without touching
 * the gate. Restraint is about how many *ideas* are on the page, not how many
 * shapes.
 *
 * Pure, deterministic, and free of React so the placement can be unit-tested
 * without rendering anything.
 */

export type Rect = { x: number; y: number; w: number; h: number };

/** The nine places on a rectangle a thing can sit. */
export type Spot =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/**
 * Where a part sits relative to another part.
 *
 * `on` overlaps deliberately — a badge on a photo corner, a word across a
 * shape. Everything else clears the other part's edge by `gap`.
 */
export type Side =
  | "above"
  | "below"
  | "left-of"
  | "right-of"
  | "on"
  | "top-left-of"
  | "top-right-of"
  | "bottom-left-of"
  | "bottom-right-of";

/** Named clearances, as a fraction of the figure's short side. */
export type Gap = "touching" | "tight" | "near" | "far";

export const GAPS: Record<Gap, number> = {
  touching: 0,
  tight: 0.02,
  near: 0.06,
  far: 0.14,
};

/** Named sizes, as a fraction of the figure's short side. */
export type Size = "tiny" | "small" | "medium" | "large" | "huge";

export const SIZES: Record<Size, number> = {
  tiny: 0.12,
  small: 0.2,
  medium: 0.34,
  large: 0.52,
  huge: 0.78,
};

export type Anchor =
  /** Relative to the figure's own box. */
  | { at: Spot }
  /** Relative to another part, by its id. */
  | { of: string; side: Side; gap?: Gap };

/**
 * Front-to-back intent, resolved to a z-index the renderer sorts on.
 *
 * Deliberately three words rather than a number: an agent asked for a z-index
 * will invent 100, 200, 300 and then have nothing left to say when something
 * needs to go between. Relative words compose; absolute layers do not.
 */
export type Layer = "behind" | "with" | "front";

const LAYER_Z: Record<Layer, number> = { behind: -10, with: 0, front: 10 };

export type PartInput = {
  id: string;
  /** Natural width:height this part wants. 1 is square. */
  aspect: number;
  size: Size;
  at: Anchor;
  layer?: Layer;
  /** Degrees, for parts that are deliberately tilted. Not a position. */
  rotate?: number;
};

export type PlacedPart = Rect & { id: string; z: number; rotate: number };

/** Anchor points on a rect, as fractions of its width and height. */
const SPOT_UV: Record<Spot, [number, number]> = {
  "top-left": [0, 0],
  top: [0.5, 0],
  "top-right": [1, 0],
  left: [0, 0.5],
  center: [0.5, 0.5],
  right: [1, 0.5],
  "bottom-left": [0, 1],
  bottom: [0.5, 1],
  "bottom-right": [1, 1],
};

/**
 * Order parts so every part is placed after whatever it refers to.
 *
 * A cycle ("A right-of B, B right-of A") is not resolvable and, more to the
 * point, is not a thing the author meant. We throw rather than silently
 * breaking the cycle, because a silently-broken cycle renders as a plausible
 * layout that ignores half of what was asked for — the worst failure mode,
 * since nobody notices it went wrong.
 */
function orderParts(parts: PartInput[]): PartInput[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const done = new Set<string>();
  const active = new Set<string>();
  const out: PartInput[] = [];

  const visit = (part: PartInput): void => {
    if (done.has(part.id)) return;
    if (active.has(part.id)) {
      throw new Error(`composed figure has a placement cycle at part '${part.id}'`);
    }
    active.add(part.id);
    if ("of" in part.at) {
      const parent = byId.get(part.at.of);
      if (!parent) {
        throw new Error(`part '${part.id}' is placed against unknown part '${part.at.of}'`);
      }
      visit(parent);
    }
    active.delete(part.id);
    done.add(part.id);
    out.push(part);
  };

  for (const part of parts) visit(part);
  return out;
}

/** Size a part, preserving its natural aspect and never exceeding the figure. */
function sizeOf(part: PartInput, box: Rect): { w: number; h: number } {
  const short = Math.min(box.w, box.h);
  const extent = SIZES[part.size] * short;
  // The named size is the *longest* edge, so a wide part and a tall part at
  // "medium" read as equally prominent rather than the wide one dominating.
  const w = part.aspect >= 1 ? extent : extent * part.aspect;
  const h = part.aspect >= 1 ? extent / part.aspect : extent;
  return { w: Math.min(w, box.w), h: Math.min(h, box.h) };
}

/**
 * Place one part against the figure box.
 *
 * The anchor spot on the box is matched to the *same* spot on the part, so a
 * "top-right" part tucks its own top-right corner into the box's top-right
 * corner rather than hanging its centre there and spilling off the page.
 */
function placeAtSpot(spot: Spot, size: { w: number; h: number }, box: Rect): Rect {
  const [u, v] = SPOT_UV[spot];
  return {
    x: box.x + u * box.w - u * size.w,
    y: box.y + v * box.h - v * size.h,
    ...size,
  };
}

function placeAgainst(
  side: Side,
  gap: number,
  size: { w: number; h: number },
  target: Rect,
): Rect {
  const cx = target.x + target.w / 2 - size.w / 2;
  const cy = target.y + target.h / 2 - size.h / 2;

  switch (side) {
    case "above":
      return { x: cx, y: target.y - size.h - gap, ...size };
    case "below":
      return { x: cx, y: target.y + target.h + gap, ...size };
    case "left-of":
      return { x: target.x - size.w - gap, y: cy, ...size };
    case "right-of":
      return { x: target.x + target.w + gap, y: cy, ...size };
    case "on":
      return { x: cx, y: cy, ...size };
    /*
     * Diagonals straddle the corner: the part's centre lands on the target's
     * corner, then backs off along both axes. That reads as "attached to that
     * corner" — a sticker on a photo, a leaf off a headline — whereas clearing
     * the corner entirely reads as an unrelated object parked nearby.
     *
     * The backoff is capped against the part's *own* size rather than taken
     * from `gap` directly, and that cap is load-bearing. `gap` is a fraction of
     * the figure, so on a small part it can exceed the part's half-width and
     * push it fully outside the corner — silently turning "badge on the corner"
     * into "badge floating beside it". A caught test did exactly that: a tiny
     * badge at the default gap landed with its left edge precisely on the
     * target's right edge, touching nothing.
     */
    case "top-left-of":
      return { x: target.x - back(size.w, gap), y: target.y - back(size.h, gap), ...size };
    case "top-right-of":
      return {
        x: target.x + target.w - size.w + back(size.w, gap),
        y: target.y - back(size.h, gap),
        ...size,
      };
    case "bottom-left-of":
      return {
        x: target.x - back(size.w, gap),
        y: target.y + target.h - size.h + back(size.h, gap),
        ...size,
      };
    case "bottom-right-of":
      return {
        x: target.x + target.w - size.w + back(size.w, gap),
        y: target.y + target.h - size.h + back(size.h, gap),
        ...size,
      };
  }
}

/**
 * How far a corner-anchored part sits outside its target's corner.
 *
 * Half the part's extent puts its centre exactly on the corner; `gap` nudges it
 * further out but never past 85% of the extent, so some overlap always
 * survives and the part stays visibly attached.
 */
function back(extent: number, gap: number): number {
  return Math.min(extent * 0.85, extent / 2 + gap);
}

/**
 * How far outside the figure box a part may hang.
 *
 * Not zero on purpose. A composed figure whose parts are all strictly inside
 * its bounds looks like a box of stickers; letting a corner motif break the
 * edge is what makes it look drawn. But it is bounded, because a part that
 * escapes far enough will collide with text the solver has already committed
 * to, and the solver cannot move on our behalf at this stage.
 */
const BLEED = 0.18;

export function resolveParts(parts: PartInput[], box: Rect): PlacedPart[] {
  if (parts.length === 0) return [];
  const ordered = orderParts(parts);
  const placed = new Map<string, PlacedPart>();
  const short = Math.min(box.w, box.h);
  const slack = { x: box.w * BLEED, y: box.h * BLEED };

  ordered.forEach((part, index) => {
    const size = sizeOf(part, box);
    let rect: Rect;

    if ("at" in part.at) {
      rect = placeAtSpot(part.at.at, size, box);
    } else {
      // orderParts guarantees the target is already placed.
      const target = placed.get(part.at.of)!;
      rect = placeAgainst(part.at.side, GAPS[part.at.gap ?? "near"] * short, size, target);
    }

    // Keep it near the figure. Clamped rather than rejected: a part pushed out
    // by a chain of relations should still appear, just tucked back in.
    rect = {
      ...rect,
      x: Math.max(box.x - slack.x, Math.min(rect.x, box.x + box.w - rect.w + slack.x)),
      y: Math.max(box.y - slack.y, Math.min(rect.y, box.y + box.h - rect.h + slack.y)),
    };

    placed.set(part.id, {
      id: part.id,
      ...rect,
      // Declaration order breaks ties, so two parts on the same layer stack the
      // way they were written — the one obvious reading of a flat list.
      z: LAYER_Z[part.layer ?? "with"] + index,
      rotate: part.rotate ?? 0,
    });
  });

  // Painter's order, so the renderer can emit the array as-is.
  return [...placed.values()].sort((a, b) => a.z - b.z);
}
