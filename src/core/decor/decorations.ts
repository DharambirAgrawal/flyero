/**
 * Ornament placement.
 *
 * Runs after the layout boxes are final, so it can see exactly where the type
 * landed and refuse to draw on top of it. Placement is deterministic rejection
 * sampling with a fixed attempt budget: no unbounded loops, no wall-clock
 * dependence, and the caps in `budget.ts` hold by construction rather than by
 * review.
 *
 * Each slot draws from **its own RNG stream**, keyed by index. That way a
 * rejected placement in slot 3 cannot shift the geometry of slot 4, and adding
 * a slot to one graphic language cannot change what another one draws.
 */

import {
  MOTIF_NAMES,
  arcBands,
  blobPath,
  buntingStringPath,
  burstPath,
  checkerTile,
  dashedRoutePath,
  halftoneTile,
  gridTile,
  polygonPath,
  ribbonPath,
  routeMidpoint,
  scallopedCirclePath,
  sparklePath,
  squigglePath,
  stripeTile,
  tapeStripPath,
  tornEdgePath,
  type MotifName,
} from "../../components/shapes.js";
import type { Box, Theme } from "../../components/types.js";
import type { GraphicsValue } from "../../creative/graphics.js";
import { mix } from "../../creative/color.js";
import { Rng } from "../../lib/rng.js";
import type { DesignSpec } from "../compose/spec.js";
import {
  DECOR_BUDGET,
  INK_FACTOR,
  MAX_BOLD_MOVES,
  OVER_ALLOWED,
  boldnessSpent,
  decorBudgetFor,
} from "./budget.js";
import type { Density } from "../../creative/artdirections.js";
import { decorId, patternId } from "./ids.js";
import { decorInk, effectiveGroundUnder, overlapArea } from "./ink.js";
import type {
  Decoration,
  DecorNode,
  DecorSlot,
  GroundPlan,
  KeepOut,
  Rect,
} from "./types.js";

const TEXT_ROLES = new Set(["message", "support", "cta", "brand"]);

function inflate(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

/**
 * Bounds of a box including any rotation the signature gesture applied. A
 * sparkle placed against the unrotated rect can still land on the corner of a
 * tilted headline.
 */
function rotatedBounds(box: Box): Rect {
  if (!box.rotate) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const rad = (Math.abs(box.rotate) * Math.PI) / 180;
  const w = Math.abs(box.w * Math.cos(rad)) + Math.abs(box.h * Math.sin(rad));
  const h = Math.abs(box.w * Math.sin(rad)) + Math.abs(box.h * Math.cos(rad));
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

/** The regions ornament must respect, inflated per element kind. */
export function keepOutsFrom(spec: DesignSpec, boxes: Record<string, Box>): KeepOut[] {
  const out: KeepOut[] = [];
  for (const el of spec.elements) {
    const box = boxes[el.id];
    if (!box) continue;
    const bounds = rotatedBounds(box);
    const isText = TEXT_ROLES.has(el.role) || Boolean(box.lines);
    const pad =
      el.role === "evidence"
        ? DECOR_BUDGET.PAD_EVIDENCE
        : isText
          ? DECOR_BUDGET.PAD_TEXT
          : DECOR_BUDGET.PAD_NON_TEXT;
    // A `photoGround` evidence element fills the whole canvas, so its
    // keep-out rect *is* the canvas — any decoration placed anywhere is
    // ~100% "covered" by it, not partially. A small fractional allowance
    // (0.1, 0.2, …) therefore still blocks everything; only something close
    // to full exemption actually lets ornament through. Exempt "over" layer
    // decorations entirely there — a badge or a sparkle sitting on top of a
    // photo is a normal design move, and the global clutter budget
    // (MAX_OVER_ITEMS, MAX_INK_COVERAGE in decor/budget.ts) still caps how
    // much of it can appear. "under"/"with" stay zero-tolerance: ornament
    // crowding the photo from behind or beside it is what actually costs G2.
    const groundFilling =
      el.role === "evidence" && box.w >= spec.canvas.w * 0.92 && box.h >= spec.canvas.h * 0.92;
    out.push({
      rect: inflate(bounds, pad),
      // Text and evidence are zero-tolerance. Evidence especially: the vision
      // critic explicitly discounts "generic shapes and decorative panels" when
      // judging whether the product is guessable, so ornament crowding the
      // photograph actively costs G2 pass rate.
      allowance: el.role === "evidence" || isText ? 0 : 0.25,
      overAllowance: groundFilling ? 1 : undefined,
      elementId: el.id,
    });
  }
  return out;
}

/**
 * Whether a candidate intrudes further than it is allowed to.
 *
 * `wash`-weight marks under the content are exempt: at 6% alpha they are a
 * tint on the paper, not something type has to compete with. Anything painted
 * over the content respects every keep-out regardless of weight.
 */
function violatesKeepOut(
  bbox: Rect,
  weight: Decoration["weight"],
  layer: Decoration["layer"],
  keepOuts: KeepOut[],
): boolean {
  const area = Math.max(1, bbox.w * bbox.h);
  const exempt = weight === "wash" && layer === "under";
  for (const ko of keepOuts) {
    const allowance = layer === "over" && ko.overAllowance !== undefined ? ko.overAllowance : ko.allowance;
    const covered = overlapArea(bbox, ko.rect) / area;
    if (covered <= allowance) continue;
    if (exempt) continue;
    return true;
  }
  return false;
}

/** Candidate placement rect for a slot's zone. */
function placeFor(slot: DecorSlot, rng: Rng, canvas: { w: number; h: number }, boxes: Record<string, Box>): Rect {
  const size = canvas.w * rng.range(slot.scale[0], slot.scale[1]);

  if (slot.zone === "field") return { x: 0, y: 0, w: canvas.w, h: canvas.h };

  // A wide, short band across the top — what a hanging bunting string or
  // any future top-of-page banner actually needs. "edge" gives a *square*
  // region sized off `size` alone, which is the wrong shape for this and,
  // being nearly as tall as it is wide, collided with whatever sits at the
  // top or bottom of the page on almost every attempt.
  if (slot.zone === "banner") {
    const w = canvas.w * rng.range(slot.scale[0], slot.scale[1]);
    // Capped in absolute px, not just proportionally: content above the safe
    // rect (an eyebrow, typically) sits as close as `canvas.safe - PAD_TEXT`
    // to the true edge, so this has to stay shorter than that regardless of
    // how wide the banner is. Mostly bled into the top margin on purpose —
    // bunting reads as hanging from the very top edge, above any text.
    const h = Math.min(w * 0.09, 46);
    return { x: (canvas.w - w) / 2, y: -h * 0.28, w, h };
  }

  if (slot.zone === "corner") {
    // Anchored to a corner and allowed to run off it, which is what stops a
    // decoration reading as a sticker dropped in the middle of the margin.
    const bleed = size * rng.range(0.04, 0.2);
    const left = rng.bool();
    const top = rng.bool();
    return {
      x: left ? -bleed : canvas.w - size + bleed,
      y: top ? -bleed : canvas.h - size + bleed,
      w: size,
      h: size,
    };
  }

  if (slot.zone === "edge") {
    const vertical = rng.bool();
    if (vertical) {
      const onLeft = rng.bool();
      return {
        x: onLeft ? -size * 0.3 : canvas.w - size * 0.7,
        y: rng.range(0, canvas.h - size),
        w: size,
        h: size,
      };
    }
    const onTop = rng.bool();
    return {
      x: rng.range(0, Math.max(1, canvas.w - size)),
      y: onTop ? -size * 0.3 : canvas.h - size * 0.7,
      w: size,
      h: size,
    };
  }

  if (slot.zone === "behind-message") {
    const message = Object.values(boxes).find((b) => b.lines && b.lines.length > 0);
    if (message) {
      return {
        x: message.x + message.w / 2 - size / 2,
        y: message.y + message.h / 2 - size / 2,
        w: size,
        h: size,
      };
    }
  }

  // "gap": anywhere on the canvas; the keep-out test does the filtering.
  return {
    x: rng.range(0, Math.max(1, canvas.w - size)),
    y: rng.range(0, Math.max(1, canvas.h - size)),
    w: size,
    h: size,
  };
}

/** Builds the drawable nodes for one placed slot. */
function nodesFor(
  slot: DecorSlot,
  index: number,
  rect: Rect,
  ink: string,
  rng: Rng,
): DecorNode[] {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = Math.min(rect.w, rect.h) / 2;

  switch (slot.form) {
    case "blob":
      return [{ t: "path", d: blobPath(cx, cy, rect.w / 2, rect.h / 2, rng, { wobble: 0.3 }), fill: ink }];

    case "burst":
      return [{ t: "path", d: burstPath(cx, cy, r, r * 0.68, rng.int(10, 16)), fill: ink }];

    case "sparkle":
      return [{ t: "path", d: sparklePath(cx, cy, r), fill: ink }];

    case "polygon":
      return [
        {
          t: "path",
          d: polygonPath(cx, cy, r, rng.int(3, 6), rng.range(0, Math.PI)),
          fill: ink,
        },
      ];

    case "ribbon":
      return [{ t: "path", d: ribbonPath(rect.x, cy - rect.h * 0.12, rect.w, rect.h * 0.24), fill: ink }];

    case "tape":
      return [
        {
          t: "path",
          d: tapeStripPath(cx, cy, rect.w, rect.h * 0.32, rng.range(-16, 16)),
          fill: ink,
          op: 0.82,
        },
      ];

    case "badge":
      return [{ t: "path", d: scallopedCirclePath(cx, cy, r, rng.int(14, 18)), fill: ink }];

    case "squiggle":
      return [
        {
          t: "path",
          d: squigglePath(rect.x, cy, rect.w, Math.max(4, rect.h * 0.09)),
          stroke: ink,
          sw: Math.max(3, rect.w * 0.016),
        },
      ];

    case "arc-bands":
      return arcBands(cx, rect.y + rect.h, r, rng.int(3, 5)).map((band) => ({
        t: "path" as const,
        d: band.d,
        stroke: ink,
        sw: Math.max(6, r * 0.09),
      }));

    case "torn-edge":
      return [
        {
          t: "path",
          d: tornEdgePath(rect, rng.pick(["top", "bottom"] as const), rng),
          fill: ink,
        },
      ];

    case "dashed-route": {
      const from = { x: rect.x, y: rect.y + rect.h };
      const to = { x: rect.x + rect.w, y: rect.y };
      const bow = rng.range(0.16, 0.32) * (rng.bool() ? 1 : -1);
      const mid = routeMidpoint(from, to, bow);
      const dotR = Math.max(4, rect.w * 0.014);
      return [
        {
          t: "path",
          d: dashedRoutePath(from, to, bow),
          stroke: ink,
          sw: Math.max(2.5, rect.w * 0.008),
          dash: `${Math.round(rect.w * 0.03)} ${Math.round(rect.w * 0.025)}`,
        },
        { t: "circle", cx: from.x, cy: from.y, r: dotR, fill: ink },
        { t: "circle", cx: to.x, cy: to.y, r: dotR, fill: ink },
        {
          t: "motif",
          name: "plane",
          x: mid.x - rect.w * 0.045,
          y: mid.y - rect.w * 0.045,
          size: rect.w * 0.09,
          rotate: mid.angle,
          fill: ink,
        },
      ];
    }

    case "bunting-string": {
      const count = rng.int(5, 8);
      const { cord, pennants } = buntingStringPath(rect, count);
      const tint = mix(ink, "#ffffff", 0.3);
      return [
        { t: "path", d: cord, stroke: ink, sw: Math.max(2, rect.w * 0.004) },
        ...pennants.map((p) => ({
          t: "path" as const,
          d: p.d,
          // Alternating tint rather than a flat repeat — a string of pennants
          // that are all one solid colour reads as a bar chart, not bunting.
          fill: p.index % 2 === 0 ? ink : tint,
        })),
      ];
    }

    case "motif": {
      const pool: readonly MotifName[] = slot.motifs ?? MOTIF_NAMES;
      return [
        {
          t: "motif",
          name: rng.pick(pool),
          x: rect.x,
          y: rect.y,
          size: Math.min(rect.w, rect.h),
          rotate: rng.range(-18, 18),
          fill: ink,
        },
      ];
    }

    case "stripe-field":
      return [
        {
          t: "pattern",
          id: patternId(index, "stripe"),
          tile: stripeTile(Math.max(6, rect.w * 0.03), Math.max(6, rect.w * 0.045)),
          rotate: rng.pick([0, 30, 45, 90, 135]),
          fill: ink,
          target: rect,
        },
      ];

    case "checker-field":
      return [
        {
          t: "pattern",
          id: patternId(index, "check"),
          tile: checkerTile(Math.max(10, rect.w * 0.05)),
          rotate: rng.pick([0, 45]),
          fill: ink,
          target: rect,
        },
      ];

    case "halftone-field":
      return [
        {
          t: "pattern",
          id: patternId(index, "dot"),
          tile: halftoneTile(26, 3.6),
          rotate: rng.pick([0, 15, 30]),
          fill: ink,
          target: rect,
        },
      ];

    case "grid-field":
      return [
        {
          t: "pattern",
          id: patternId(index, "grid"),
          tile: gridTile(56, 1.2),
          rotate: 0,
          fill: ink,
          target: rect,
        },
      ];

    default:
      return [];
  }
}

/**
 * Plans every decoration for one flyer.
 *
 * The caps are applied here, not in the graphic languages, so a language cannot
 * talk its way past them.
 */
export function planDecorations(
  spec: DesignSpec,
  theme: Theme,
  graphics: GraphicsValue,
  ground: GroundPlan,
  boxes: Record<string, Box>,
  /** Loud moves the composition has already committed to — see MAX_BOLD_MOVES. */
  committed: { gestureApplied: boolean; density?: Density } = { gestureApplied: false },
  /** The measured canvas, so ornament can avoid landing on busy ground. */
  tone?: { sample: (r: Rect) => { luminance: number; variance: number; fill: string } },
): Decoration[] {
  // Boldness already spent by the ground, the gesture and the type treatment.
  // Whatever is left is ornament's share, and it may be nothing at all.
  const treatmentIsLoud = spec.elements.some(
    (el) =>
      el.component === "headline-block" &&
      typeof el.props?.treatment === "string" &&
      el.props.treatment !== "plain",
  );
  const spent = boldnessSpent({
    groundIsLoud: ground.kind !== "flat",
    gestureApplied: committed.gestureApplied,
    treatmentIsLoud,
  });
  const boldAllowance = Math.max(0, MAX_BOLD_MOVES - spent);
  const densityBudget = decorBudgetFor(committed.density ?? "balanced");

  const keepOuts = keepOutsFrom(spec, boxes);
  const canvas = spec.canvas;
  const canvasArea = canvas.w * canvas.h;
  const out: Decoration[] = [];
  const forms = new Set<string>();
  let inkArea = 0;
  let overCount = 0;
  let boldUsed = 0;

  for (let i = 0; i < graphics.slots.length && out.length < densityBudget.maxItems; i++) {
    const slot = graphics.slots[i]!;

    // A third distinct form turns a design into a mood board.
    if (!forms.has(slot.form) && forms.size >= densityBudget.maxForms) continue;

    // A solid mark is a loud move and competes with the ground, the gesture and
    // the headline. When the budget is gone it is demoted to a tint rather than
    // dropped, so the language still reads — just more quietly.
    let weight = slot.weight;
    if (weight === "solid" && boldUsed >= boldAllowance) weight = "tint";

    // Forms that would bury type are forced underneath rather than skipped.
    const layer =
      slot.layer === "over" && !OVER_ALLOWED.has(slot.form) ? "under" : slot.layer;
    if (layer === "over" && overCount >= densityBudget.maxOverItems) continue;

    const rng = new Rng(`decor:${spec.seed}:${graphics.id}:${i}`);

    for (let attempt = 0; attempt < DECOR_BUDGET.ATTEMPTS_PER_SLOT; attempt++) {
      const rect = placeFor(slot, rng, canvas, boxes);
      if (violatesKeepOut(rect, weight, layer, keepOuts)) continue;
      // A solid mark dropped on a photograph or a treeline reads as debris
      // rather than as ornament — it has no ground to sit against. Washes are
      // exempt: a faint tint over a busy area is simply invisible, not wrong.
      if (tone && weight !== "wash" && tone.sample(rect).variance > 0.055) continue;

      const estimated = rect.w * rect.h * INK_FACTOR[slot.form];
      if (inkArea + estimated > canvasArea * densityBudget.maxInkCoverage) break;

      const groundFill = effectiveGroundUnder(ground, rect);
      const nodes = nodesFor(slot, i, rect, decorInk(theme, groundFill, weight), rng);
      if (nodes.length === 0) break;

      out.push({
        id: decorId(i, slot.form),
        form: slot.form,
        layer,
        weight,
        nodes,
        bbox: rect,
        ink: estimated,
      });
      inkArea += estimated;
      forms.add(slot.form);
      if (weight === "solid") boldUsed++;
      if (layer === "over") overCount++;
      break;
    }
  }

  return out;
}
