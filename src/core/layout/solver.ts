import { Rng } from "../../lib/rng.js";
import { mix, relativeLuminance } from "../../creative/color.js";
import { getComponent } from "../../components/registry.js";
import type { Box, Theme } from "../../components/types.js";
import { fitText } from "../render/fonts.js";
import { typographyById } from "../../creative/typebehaviors.js";
import { gestureById } from "../../creative/gestures.js";
import { recipeFor, toCanvas, type Rect, type SlotName } from "./recipes.js";
import type { DesignSpec, SpecElement } from "../compose/spec.js";
import { graphicsById } from "../../creative/graphics.js";
import { artDirectionById } from "../../creative/artdirections.js";
import { markOnDarkFromGround, planGround } from "../decor/ground.js";
import { planDecorations } from "../decor/decorations.js";
import type { Decoration, GroundPlan } from "../decor/types.js";
import { depthForRole } from "../canvas/depth.js";
import { figureInk } from "../../components/figure.js";
import { BUSY_VARIANCE, ToneField } from "../canvas/tone.js";

/**
 * The Layout Solver — pure TypeScript, no LLM (AGENTS.md law 1).
 *
 * Given a spec and its seed this produces exact geometry, and it is the only
 * place in the system where coordinates are decided. Deterministic: identical
 * spec + seed always yields identical boxes.
 *
 * Pass order matters and is deliberate:
 *   slots → intrinsic shrink → headline fit → relationships → gesture →
 *   collisions → fill → margins → masks
 * Collisions run *after* the gesture so a gesture can never leave two elements
 * sitting on top of each other, and fill runs after collisions so closing dead
 * space never re-introduces one.
 */

export type LayoutMask = {
  elementId: string;
  occluderId: string;
  maxOcclusionRatio: number;
};

export type LayoutResult = {
  seed: string;
  boxes: Record<string, Box>;
  masks: LayoutMask[];
  /** Recorded so the gates can verify exactly one gesture was applied. */
  appliedGesture: { type: string; elementId: string } | null;
  /** Non-fatal geometry facts the rule critic turns into findings. */
  warnings: string[];
  /**
   * The coloured field the composition sits on. Planned here rather than in the
   * renderer because `onDark` — the only thing that switches type to a light
   * ink — is decided in this file, and a ground chosen later would arrive after
   * every ink decision had already been made.
   */
  ground: GroundPlan;
  /** Engine-generated ornament. Never enters `spec.elements`, so G3 is untouched. */
  decorations: Decoration[];
  /**
   * What is actually on the canvas, as a coarse tone field. Built here because
   * ink is chosen here, and consulted by the gates so they check the same
   * numbers the solver used rather than a separate guess.
   */
  tone: ToneField;
};

const MIN_GAP = 18;
/**
 * Components that can *be the ground* — fill a bleed slot edge to edge.
 *
 * Photographs qualify because they crop; a drawn scene qualifies because its
 * parts are laid out relative to its own box, so it composes at any size. A
 * document card does not: stretching it to poster height reads as a rendering
 * fault, so anything else keeps its natural proportions and sits centred.
 *
 * Leaving `scene-illustration` out of this set made every illustrated poster a
 * *band* of scenery with hard edges top and bottom, pasted onto the page rather
 * than being it.
 */
const PHOTO_COMPONENTS = new Set([
  "photo-hero",
  "asset-image",
  "masked-image",
  /*
   * `photo-cluster` is deliberately NOT here. Ground-capable means "fills a
   * bleed rect edge to edge", which is safe for a photograph because it simply
   * crops. A cluster is a row of discrete circles: given a rect that runs off
   * the canvas it centres the run in the *bleed*, so the outer cutouts are
   * sliced by the page edge. Its parts have to stay inside the page.
   */
  "polaroid-stack",
  "photo-grid",
  "torn-photo",
  "scene-illustration",
]);

/**
 * Of those, the ones whose content is an actual photograph.
 *
 * The distinction matters for the tone field: a photograph's brightness is
 * unknown until measured, so without a tone map it must be treated as hostile.
 * A drawn scene is not unknown — the engine chose every colour in it — so
 * treating it as an unmeasured image made the field report "mid grey and busy"
 * across a composition it had complete knowledge of, and the gate then failed
 * elements that were perfectly legible.
 */
const PHOTOGRAPHIC = new Set([
  "photo-hero",
  "asset-image",
  "masked-image",
  "photo-cluster",
  "polaroid-stack",
  "photo-grid",
  "torn-photo",
]);
/**
 * Components whose edge is a silhouette rather than a rectangle. Only these may
 * be allowed to cross a headline: the eye completes letters behind a shape, but
 * a straight edge through a word reads as a rendering fault.
 */
const SHAPED_COMPONENTS = new Set([
  "masked-image",
  "motif-collage",
  "scene-illustration",
  "oversized-letterform",
  "photo-cluster",
  // A figure assembled from marks is a silhouette by construction — that is
  // what it is made of — so it weaves with type on the same terms.
  "composed-figure",
]);

/** No element may hide more than this fraction of the element behind it. */
const MAX_OCCLUSION = 0.35;

/**
 * The area an element really occupies, including any rotation the signature
 * gesture applied.
 *
 * Collision resolution used the raw rect, so a tilted photograph's corner could
 * reach up into a headline and clip its last line — the solver saw no overlap
 * because the unrotated rects did not touch. Rotation is small (max 3.5 degrees)
 * but a corner travels further than the angle suggests.
 */
export function footprint(box: Box): Rect {
  if (!box.rotate) return { x: box.x, y: box.y, w: box.w, h: box.h };
  const rad = (Math.abs(box.rotate) * Math.PI) / 180;
  const w = Math.abs(box.w * Math.cos(rad)) + Math.abs(box.h * Math.sin(rad));
  const h = Math.abs(box.w * Math.sin(rad)) + Math.abs(box.h * Math.cos(rad));
  return { x: box.x + box.w / 2 - w / 2, y: box.y + box.h / 2 - h / 2, w, h };
}

function overlapArea(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function horizontalOverlapRatio(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  return x / Math.max(1, Math.min(a.w, b.w));
}

function subdivide(rect: Rect, count: number): Rect[] {
  if (count <= 1) return [rect];
  const vertical = rect.h >= rect.w * 0.7;
  const gap = MIN_GAP;
  if (vertical) {
    const each = (rect.h - gap * (count - 1)) / count;
    return Array.from({ length: count }, (_, i) => ({
      x: rect.x,
      y: rect.y + i * (each + gap),
      w: rect.w,
      h: each,
    }));
  }
  const each = (rect.w - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: rect.x + i * (each + gap),
    y: rect.y,
    w: each,
    h: rect.h,
  }));
}

export function solveLayout(
  spec: DesignSpec,
  theme: Theme,
  /**
   * Measured 8x8 luminance grids per assetId. Optional: without them a
   * photograph is treated as "unknown brightness, maximally busy", which is the
   * safe answer rather than an optimistic one.
   */
  assetTone?: Map<string, number[] | undefined>,
): LayoutResult {
  const rng = new Rng(`layout:${spec.seed}`);
  const recipe = recipeFor(spec.lineage.topology);
  const typography = typographyById(spec.lineage.typography);
  const warnings: string[] = [];

  const safe = {
    x: spec.canvas.safe,
    y: spec.canvas.safe,
    w: spec.canvas.w - spec.canvas.safe * 2,
    h: spec.canvas.h - spec.canvas.safe * 2,
  };

  // ── 1. Assign each element to its slot ────────────────────────────────────
  const byRole = new Map<SlotName, SpecElement[]>();
  for (const el of spec.elements) {
    // The eyebrow component gets its own slot even though its role is "support".
    const slot: SlotName = el.component === "eyebrow-label" ? "eyebrow" : el.role;
    const list = byRole.get(slot) ?? [];
    list.push(el);
    byRole.set(slot, list);
  }

  const boxes: Record<string, Box> = {};
  const slotOf = new Map<string, SlotName>();
  const bleedIds = new Set<string>();
  let z = 10;
  for (const [slot, elements] of byRole) {
    const base = toCanvas(recipe.slots[slot], safe);
    const parts = subdivide(base, elements.length);
    const bleeds = recipe.bleed.includes(slot);
    elements.forEach((el, i) => {
      /**
       * A photograph in a `photoGround` topology stops being an element in the
       * column and becomes the page itself: it covers the whole canvas and the
       * type is set over it. This is what separates a poster from a document,
       * and it is the only change that moves ink coverage materially — adding
       * ornament to reach the same number just produces clutter.
       */
      const isGroundPhoto =
        slot === "evidence" &&
        recipe.photoGround === true &&
        elements.length === 1 &&
        PHOTO_COMPONENTS.has(el.component);
      const rect = isGroundPhoto
        ? { x: -1, y: -1, w: spec.canvas.w + 2, h: spec.canvas.h + 2 }
        : parts[i]!;
      boxes[el.id] = { ...rect, zIndex: slot === "structure" ? 1 : bleeds || isGroundPhoto ? 2 : z };
      slotOf.set(el.id, slot);
      if (bleeds || isGroundPhoto) bleedIds.add(el.id);
      z += 10;
    });
    // Alignment is a property of the composition, not of the author's taste.
    const align = recipe.align[slot];
    if (align) {
      for (const el of elements) {
        boxes[el.id]!.propsOverride = { ...(boxes[el.id]!.propsOverride ?? {}), align };
      }
    }
  }

  // Bleeding elements are excluded from collision and fill: they are the ground
  // the rest of the composition sits on, not another item in the stack.
  const positioned = spec.elements.filter(
    (e) => e.role !== "structure" && !bleedIds.has(e.id),
  );

  // ── 2. Shrink content elements to what they actually need ─────────────────
  // Also record how tall each element may ever become. A photograph can be given
  // spare space and simply show more of itself; a card with three lines in it
  // just becomes a large empty box, which is worse than the gap it filled.
  const growCap = new Map<string, number>();
  for (const el of spec.elements) {
    const box = boxes[el.id]!;
    const mod = getComponent(el.component);
    if (!mod.intrinsicHeight) continue;
    if (bleedIds.has(el.id)) {
      // A photographic ground fills its declared rect. Anything else keeps its
      // natural height and centres inside the rect, still free to cross the edge.
      //
      // Making non-photographic components give up the bleed entirely was tried
      // and reverted: clamping them into the safe rectangle pushed every element
      // into the top half and left the bottom 55% of the page empty, which is a
      // worse fault than the one it set out to fix.
      if (PHOTO_COMPONENTS.has(el.component)) continue;
      const props = mod.props.parse(el.props ?? {});
      const natural = mod.intrinsicHeight(props, theme, box.w);
      if (natural > 0 && natural < box.h) {
        box.y += (box.h - natural) / 2;
        box.h = natural;
      }
      continue;
    }
    const props = mod.props.parse(el.props ?? {});
    const wanted = mod.intrinsicHeight(props, theme, box.w);
    growCap.set(
      el.id,
      PHOTO_COMPONENTS.has(el.component) ? box.w * 1.7 : Math.max(wanted, mod.manifest.minSize.h),
    );
    if (wanted > 0 && wanted < box.h) {
      box.h = Math.max(mod.manifest.minSize.h, wanted);
    } else if (wanted > box.h && !PHOTO_COMPONENTS.has(el.component)) {
      // Content decides height; the recipe only decides where the element
      // starts. Leaving the box short does not make the text smaller — it makes
      // it spill onto whatever sits below, which is how a paragraph ends up
      // printed across a button.
      box.h = wanted;
    }
    // A photograph is deliberately excluded from that growth. Text has a height
    // it cannot compromise on; an image can simply show less of itself. Letting
    // a photo grow to its intrinsic height pushed it down through the headline
    // in `framed-evidence`, and because the type is drawn on top the result was
    // words printed over a tree rather than a collision the solver could see.
  }

  // ── 3. Fit the headline — the one text decision that drives the composition ─
  const headlineEl = spec.elements.find((e) => e.component === "headline-block");
  if (headlineEl) {
    const box = boxes[headlineEl.id]!;
    const ceiling = spec.canvas.w * recipe.headlineCeiling * typography.headlineScale;
    const fit = fitText(
      spec.copy.headline,
      {
        family: theme.fonts.display,
        weight: theme.fonts.weights.display,
        tracking: typography.tracking,
        lineHeight: typography.lineHeight,
      },
      { w: box.w, h: Math.max(box.h, ceiling * recipe.headlineMaxLines) },
      {
        min: 30,
        max: ceiling,
        maxLines: recipe.headlineMaxLines,
        lineHeight: typography.lineHeight,
      },
    );
    box.fontSize = fit.size;
    box.lines = fit.lines;
    box.h = Math.max(fit.height, 40);
    if (fit.lines.length > recipe.headlineMaxLines || fit.width > box.w + 1) {
      warnings.push(
        `headline does not fit ${spec.lineage.topology} at the minimum size — copy is too long`,
      );
    }
  }

  // ── 4. Relationships: depth and *clamped* overlap ──────────────────────────
  const justifiedPairs = new Set<string>();
  for (const rel of spec.relationships) {
    if (boxes[rel.front] && boxes[rel.behind]) {
      justifiedPairs.add(pairKey(rel.front, rel.behind));
    }
  }
  applyRelationshipOverlaps(spec, boxes, warnings, bleedIds);

  // ── 5. The signature gesture — exactly one (Gate G5) ──────────────────────
  const gesture = gestureById(spec.gesture.type);
  const appliedGesture = applyGesture(gesture, spec, boxes, rng, safe, bleedIds);
  if (!appliedGesture) {
    warnings.push(`gesture ${spec.gesture.type} could not be applied to this composition`);
  }
  const bledId = appliedGesture?.bleeds ? appliedGesture.elementId : null;

  // ── 6. Collision resolution, after the gesture has had its say ────────────
  resolveCollisions(positioned, boxes, justifiedPairs);

  // ── 6.5. Text safety: nothing opaque may cover a word ────────────────────
  // Slots for adjacent roles can legitimately overlap, and a justified
  // relationship exempts a pair from collision resolution — so a panel drawn on
  // top can still land across the end of a headline. Runs before the fill pass
  // so anything moved here still gets tidied afterwards.
  if (headlineEl) {
    const box = boxes[headlineEl.id]!;
    if (box.lines && box.fontSize) {
      const occluders = spec.elements
        .filter((e) => e.id !== headlineEl.id && e.role !== "structure")
        .filter((e) => {
          const other = boxes[e.id]!;
          return (
            other.zIndex > box.zIndex &&
            other.x > box.x &&
            other.x < box.x + box.w &&
            // Reaching into the upper part of the text means it sits *beside*
            // the words and will cut them. Something that only enters the bottom
            // band is tucking under the last baseline — that is the deliberate
            // interlock a relationship asks for, and must survive.
            other.y < box.y + box.h * 0.6 &&
            other.y + other.h > box.y
          );
        });

      if (occluders.length > 0) {
        const limit = Math.min(...occluders.map((e) => boxes[e.id]!.x)) - MIN_GAP;
        const available = limit - box.x;
        const minWidth = getComponent(headlineEl.component).manifest.minSize.w;

        if (available >= minWidth) {
          // Enough room to re-wrap into the column that actually exists.
          const refit = fitText(
            spec.copy.headline,
            {
              family: theme.fonts.display,
              weight: theme.fonts.weights.display,
              tracking: typography.tracking,
              lineHeight: typography.lineHeight,
            },
            { w: available, h: safe.y + safe.h - box.y },
            {
              min: 30,
              max: spec.canvas.w * recipe.headlineCeiling * typography.headlineScale,
              maxLines: recipe.headlineMaxLines + 1,
              lineHeight: typography.lineHeight,
            },
          );
          box.w = available;
          box.fontSize = refit.size;
          box.lines = refit.lines;
          box.h = Math.max(refit.height, 40);
        } else {
          // Too narrow to be a column at all: keep the headline whole and move
          // the offending element below it instead.
          for (const el of occluders) {
            const other = boxes[el.id]!;
            const needed = box.y + box.h + MIN_GAP - other.y;
            if (needed > 0) other.y += needed;
          }
        }
      }
    }
  }

  // ── 7. Fill: close dead space rather than letting the composition float ───
  fillColumns(positioned, boxes, safe, warnings, growCap);
  // Filling moves elements, and columns are grouped by a looser overlap
  // threshold than the collision check uses — so re-assert the invariant rather
  // than trusting that closing one gap did not open a collision elsewhere.
  // Re-assert the deliberate overlaps the fill pass just flattened, *then* clear
  // collisions — so a re-nudged element cannot come to rest on a third one.
  applyRelationshipOverlaps(spec, boxes, [], bleedIds);
  resolveCollisions(positioned, boxes, justifiedPairs);

  // ── 7.5. A deliberate overlap may not eat a line of type ──────────────────
  /**
   * Relationships can ask for an interlock — an element tucking over the foot of
   * the headline — and `justifiedPairs` exempts that pair from collision so the
   * effect survives. The allowance was "anything entering below 60% of the text
   * box is tucking under the last baseline".
   *
   * That is wrong for a headline of more than one line: the bottom 40% of a
   * two-line block *is* the second line. Measured on `framed-evidence`, a photo
   * entered 27px above the headline's ink and clipped the word "opportunity"
   * clean in half, while every gate passed.
   *
   * The honest boundary is the last baseline: an occluder may cross into the
   * descender space beneath the final line, never into the line itself.
   */
  if (headlineEl) {
    const box = boxes[headlineEl.id]!;
    if (box.lines && box.lines.length > 0 && box.fontSize) {
      const lineHeight = typography.lineHeight ?? 1.1;
      const lastBaseline =
        box.y + (box.lines.length - 1) * box.fontSize * lineHeight + box.fontSize * 0.82;
      for (const el of spec.elements) {
        if (el.id === headlineEl.id || el.role === "structure") continue;
        /**
         * A *declared* overlap is the composition, not an accident.
         *
         * This pass exists to stop something drifting across the last line of a
         * headline. But when the author has asked for a weave — the subject
         * passing in front of the type — covering part of the letters is
         * precisely the intent, and pushing the occluder clear destroyed it.
         * Every relationship-backed pair was being separated, which is why
         * `layout.masks` came out empty on every flyer ever rendered.
         */
        /*
         * Only a *shaped* occluder may cross the type.
         *
         * Exempting every declared pair was too broad: a rectangular photograph
         * cutting a word in half reads as a bug, not as weaving, whatever the
         * relationship says. Weaving is legible when the thing in front has a
         * silhouette — a cut-out, a masked shape, a drawn form — because the
         * eye completes the letters behind it. A hard edge through a word
         * simply looks broken, so those are still pushed clear.
         */
        if (
          justifiedPairs.has(pairKey(headlineEl.id, el.id)) &&
          SHAPED_COMPONENTS.has(el.component)
        ) {
          continue;
        }
        const other = boxes[el.id];
        if (!other || other.zIndex <= box.zIndex) continue;
        const f = footprint(other);
        const sharesColumn = f.x < box.x + box.w && f.x + f.w > box.x;
        if (!sharesColumn) continue;
        if (f.y >= lastBaseline || f.y + f.h <= box.y) continue;
        const push = lastBaseline - f.y;
        if (push > 0 && push < box.h) {
          other.y += push;
          warnings.push(
            `${el.id} was clipping the last line of ${headlineEl.id}; moved down ${Math.round(push)}px`,
          );
        }
      }
    }
  }

  // ── 8. Margins: everything except a deliberate bleed stays inside safe ─────
  for (const el of positioned) {
    const box = boxes[el.id]!;
    if (el.id === bledId || bleedIds.has(el.id)) continue;
    if (box.x < safe.x - 1) box.x = safe.x;
    if (box.y < safe.y - 1) box.y = safe.y;
    if (box.x + box.w > safe.x + safe.w + 1) {
      box.w = Math.max(getComponent(el.component).manifest.minSize.w, safe.x + safe.w - box.x);
    }
    if (box.y + box.h > safe.y + safe.h + 1) {
      const excess = box.y + box.h - (safe.y + safe.h);
      box.y = Math.max(safe.y, box.y - excess);
      if (box.y + box.h > safe.y + safe.h + 1) {
        warnings.push(
          `${el.id} exceeds the bottom safe margin by ${Math.round(box.y + box.h - safe.y - safe.h)}px`,
        );
      }
    }
  }

  // ── 8.35. Re-normalise connector waypoints against their final box ────────
  // The gesture computes these at pass 5, but the fill, collision and margin
  // passes all move boxes afterwards. Normalised points left over from an
  // earlier box describe geometry that no longer exists, and the path draws
  // itself off the canvas — which no margin check can catch, because margins
  // only ever inspect boxes.
  for (const box of Object.values(boxes)) {
    const abs = box.propsOverride?.absPoints as { x: number; y: number }[] | undefined;
    if (!abs || box.w <= 0 || box.h <= 0) continue;
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    box.propsOverride = {
      ...box.propsOverride,
      points: abs.map((p) => ({
        x: clamp01((p.x - box.x) / box.w),
        y: clamp01((p.y - box.y) / box.h),
      })),
    };
  }

  // ── 8.4. The ground the composition sits on ───────────────────────────────
  // Must come before any ink decision below.
  const graphics = graphicsById(spec.lineage.graphics);
  const ground = planGround(spec, theme, graphics, boxes);

  // ── 8.42. Depth ───────────────────────────────────────────────────────────
  // Assigned from role and whether the element is a ground, so the composition
  // has a front and a back rather than one pane. Everything visual that follows
  // from depth is derived, never set per element.
  for (const el of spec.elements) {
    const box = boxes[el.id];
    if (box) box.depth = depthForRole(el.role, bleedIds.has(el.id));
  }

  // ── 8.45. The tone field: what is actually on the page ────────────────────
  // Painted in the renderer's z-order, so what it reports is what will be seen.
  const tone = new ToneField(spec.canvas, ground.base);
  for (const region of ground.regions) tone.paintFlat(region.bbox, region.fill, region.d ? 0.9 : 0.75);
  if (ground.gradient) tone.paintFlat({ x: 0, y: 0, ...spec.canvas }, ground.gradient.from, 0.5);
  // Ground-covering plates contribute their measured brightness, not a guess.
  for (const el of spec.elements) {
    const box = boxes[el.id];
    if (!box) continue;
    if (PHOTOGRAPHIC.has(el.component)) {
      const toneMap = el.assets?.length ? assetTone?.get(el.assets[0]!) : undefined;
      tone.paintPhoto(box, toneMap, theme.palette.fg);
    } else if (el.component === "composed-figure") {
      // An assembled figure paints real ink in places only it knows, so it has
      // to declare them. Painting its whole box instead would report a solid
      // slab where there are actually four small marks and a lot of paper —
      // and every scrim and ink decision downstream would be wrong.
      for (const mark of figureInk(el.props ?? {}, box, theme.palette)) {
        tone.paintFlat(mark.rect, mark.fill, 0.85);
      }
    } else if (PHOTO_COMPONENTS.has(el.component)) {
      // A drawn ground: we know its colours. Its mid tone is the accent mixed
      // toward the page, which is how every scene builds its depth ramp.
      tone.paintFlat(box, mix(theme.palette.accent, "#ffffff", 0.3), 0.85);
    }
  }

  // ── 8.47. Move unbound text into a nearby quiet image region ─────────────
  //
  // A tone field that only chooses ink and scrims is still reactive: it fixes
  // words after placing them blindly. For message/support text that is not
  // semantically locked by a relationship or gesture, search a small
  // neighbourhood inside the same photo plate and use a calmer region when it
  // materially improves legibility. Composition remains recipe-owned — this is
  // a bounded nudge, never a free layout search.
  const boundIds = new Set(spec.relationships.flatMap((relationship) => [relationship.front, relationship.behind]));
  if (appliedGesture) boundIds.add(appliedGesture.elementId);
  const photoPlates = spec.elements
    .filter((element) => PHOTOGRAPHIC.has(element.component))
    .map((element) => ({ element, box: boxes[element.id] }))
    .filter((entry): entry is { element: SpecElement; box: Box } => Boolean(entry.box));

  for (const element of spec.elements) {
    if (!["message", "support"].includes(element.role) || boundIds.has(element.id)) continue;
    const box = boxes[element.id];
    if (!box) continue;
    const plate = photoPlates.find(
      (entry) =>
        entry.box.zIndex < box.zIndex &&
        overlapArea(entry.box, box) / Math.max(1, box.w * box.h) >= 0.55,
    );
    if (!plate) continue;

    const large = (box.fontSize ?? 0) >= 32;
    const currentInk = tone.inkOver(box);
    const current = tone.sample(box);
    const currentLegible = tone.legibleFor(box, currentInk, large);
    if (currentLegible && current.variance <= BUSY_VARIANCE * 0.55) continue;

    const reachX = Math.min(120, spec.canvas.w * 0.11);
    const reachY = Math.min(180, spec.canvas.h * 0.14);
    const search: Rect = {
      x: Math.max(safe.x, box.x - reachX),
      y: Math.max(safe.y, box.y - reachY),
      w: Math.min(safe.x + safe.w, box.x + box.w + reachX) - Math.max(safe.x, box.x - reachX),
      h: Math.min(safe.y + safe.h, box.y + box.h + reachY) - Math.max(safe.y, box.y - reachY),
    };
    const blockers = spec.elements
      .filter((other) => other.id !== element.id && other.id !== plate.element.id && other.role !== "structure")
      .map((other) => boxes[other.id])
      .filter((other): other is Box => Boolean(other));
    const candidates = tone
      .quietZones({ w: box.w, h: box.h }, search, 24)
      .filter(
        (candidate) =>
          overlapArea(candidate, plate.box) / Math.max(1, candidate.w * candidate.h) >= 0.8 &&
          blockers.every(
            (blocker) =>
              overlapArea(candidate, blocker) / Math.max(1, Math.min(candidate.w * candidate.h, blocker.w * blocker.h)) <
              0.08,
          ),
      )
      .map((candidate) => {
        const ink = tone.inkOver(candidate);
        const legible = tone.legibleFor(candidate, ink, large);
        const distance = Math.hypot(candidate.x - box.x, candidate.y - box.y);
        return {
          candidate,
          legible,
          score: (legible ? 0 : 1) + candidate.sample.variance + distance / 10_000,
        };
      })
      .sort((a, b) => a.score - b.score);
    const best = candidates[0];
    if (!best) continue;
    const currentScore = (currentLegible ? 0 : 1) + current.variance;
    if (best.score + 0.015 >= currentScore) continue;
    box.x = best.candidate.x;
    box.y = best.candidate.y;
  }

  // ── 8.5. Type over a saturated ground ─────────────────────────────────────
  markOnDarkFromGround(ground, boxes);

  // ── 8.55. Ink chosen against what is measurably underneath ────────────────
  /**
   * One check replacing five special cases.
   *
   * The eyebrow drawn white on a pale sky, the QR drawn white on white, type on
   * a bright canopy, type on a saturated ground — each was patched where it
   * surfaced. All of them are the same question: *what is under this box, and
   * will the ink I am about to use read on it?* Now it is asked once, against a
   * measured field rather than an assumption about plate coverage.
   */
  for (const el of spec.elements) {
    if (el.role === "structure" || el.role === "evidence") continue;
    const box = boxes[el.id];
    if (!box) continue;
    const sample = tone.sample(box);
    const baseLum = relativeLuminance(ground.base);

    /**
     * Record the measured ground whenever it differs from the page, not only
     * when the *foreground* fails on it.
     *
     * The earlier version returned early if `fg` was legible — but `fg` is not
     * the only ink on a flyer. Muted ink resolves against `palette.bg`, so on a
     * photograph it stayed a mid grey and the date, the CTA and the signature
     * came out unreadable while the headline was fine. Ink is only correct if
     * every consumer can see the same truth.
     */
    const differs = Math.abs(sample.luminance - baseLum) > 0.08 || sample.variance > 0.02;
    if (!differs) continue;
    box.ground = sample.fill;
    box.onDark = sample.luminance < 0.5;
  }

  // ── 8.6. Type over imagery: ink and scrim ────────────────────────────────
  // When a full-bleed photograph is the ground, dark type disappears into it.
  // Rather than trust the author to notice, mark every text element that sits on
  // a photograph so components can switch to a light ink, and ask the photo for
  // a scrim on the side the text actually landed.
  const plates = spec.elements.filter((e) => PHOTO_COMPONENTS.has(e.component));

  for (const plate of plates) {
    const plateBox = boxes[plate.id];
    if (!plateBox) continue;
    let textAbove = 0;
    let textBelow = 0;

    for (const el of spec.elements) {
      if (el.id === plate.id) continue;
      const box = boxes[el.id];
      if (!box || box.zIndex <= plateBox.zIndex) continue;
      const covered = overlapArea(box, plateBox) / Math.max(1, box.w * box.h);
      if (covered < 0.55) continue;
      /**
       * Ink is no longer decided here.
       *
       * This pass used to set `onDark` from plate *coverage* — "you are on a
       * photograph, so use light ink" — which is a guess about brightness
       * dressed up as a fact. Pass 8.55 now decides it from the measured tone
       * field, and letting this run afterwards simply overwrote the
       * measurement with the guess: a scene at luminance 0.57 was still being
       * told it was dark. What this pass still knows, and the field does not,
       * is which *side* of a plate the text landed on — so it keeps the scrim
       * decision and nothing else.
       */
      const centre = box.y + box.h / 2;
      if (centre < plateBox.y + plateBox.h / 2) textAbove += 1;
      else textBelow += 1;
    }

    if (plate.component === "photo-hero" && (textAbove > 0 || textBelow > 0)) {
      /**
       * When the photograph covers essentially the whole page, a directional
       * gradient is not enough: type can land anywhere, and the gradient only
       * guarantees contrast at the edge it starts from. Measured on a bright
       * forest canopy, white type mid-gradient was unreadable while the flyer
       * still passed every gate — because nothing in the system knows the
       * photograph's luminance.
       *
       * A full wash is the honest answer: it is the only scrim that holds
       * wherever the composition happens to put the words.
       */
      const coversPage =
        plateBox.w >= spec.canvas.w * 0.92 && plateBox.h >= spec.canvas.h * 0.92;

      /**
       * Darken only the band the type actually needs.
       *
       * A full wash was the first honest fix for "white text on a bright
       * canopy", but it dims the whole photograph including the parts nothing
       * sits on — which is why the results read muddy. With the tone field we
       * can ask which text is genuinely failing and cover just that.
       */
      const failing = spec.elements
        .filter((e) => e.role !== "structure" && e.role !== "evidence")
        .map((e) => boxes[e.id])
        .filter((b): b is Box => Boolean(b))
        .filter((b) => overlapArea(b, plateBox) > 0)
        .filter((b) => !tone.legibleFor(b, theme.palette.fg, (b.fontSize ?? 0) >= 32));

      if (coversPage && failing.length > 0) {
        const top = Math.min(...failing.map((b) => b.y));
        const bottom = Math.max(...failing.map((b) => b.y + b.h));
        const pad = spec.canvas.h * 0.04;
        const band = {
          y: Math.max(plateBox.y, top - pad),
          h: Math.min(plateBox.h, bottom - top + pad * 2),
        };
        plateBox.propsOverride = {
          ...(plateBox.propsOverride ?? {}),
          scrim: "full",
          scrimBand: band,
        };
        /**
         * Paint the scrim back into the field.
         *
         * The scrim is *decided* from the tone field, but until it is also
         * *recorded* there the field still describes the un-scrimmed page — so
         * the gate went on reporting a headline as illegible after the solver
         * had already fixed it. A model consulted but never updated tells you
         * about a canvas that no longer exists.
         */
        tone.paintFlat(
          { x: plateBox.x, y: band.y, w: plateBox.w, h: band.h },
          mix(theme.palette.bg, "#000000", 0.35),
          0.68,
        );
        // Ink is re-derived for the boxes the scrim just rescued.
        for (const b of failing) {
          const after = tone.sample(b);
          b.ground = after.fill;
          b.onDark = after.luminance < 0.5;
        }
      } else {
        plateBox.propsOverride = {
          ...(plateBox.propsOverride ?? {}),
          scrim: textBelow >= textAbove ? "bottom" : "top",
        };
      }
    }
  }

  // ── 9. Masks for elements that pass behind another ────────────────────────
  const masks: LayoutMask[] = [];
  for (const rel of spec.relationships) {
    const front = boxes[rel.front];
    const behind = boxes[rel.behind];
    if (!front || !behind) continue;
    // A bleed plate sits underneath, so it occludes nothing however much of the
    // canvas it covers.
    if (
      (rel.kind !== "overlap" && rel.kind !== "weave") ||
      bleedIds.has(rel.front) ||
      front.zIndex <= behind.zIndex
    ) {
      continue;
    }
    const area = overlapArea(front, behind);
    if (area <= 0) continue;
    const ratio = area / Math.max(1, behind.w * behind.h);
    masks.push({ elementId: rel.behind, occluderId: rel.front, maxOcclusionRatio: ratio });
  }

  // ── 9.5. Ornament, now that every box is final ────────────────────────────
  const decorations = planDecorations(
    spec,
    theme,
    graphics,
    ground,
    boxes,
    {
      gestureApplied: appliedGesture !== null,
      density: artDirectionById(spec.lineage.artDirection).density,
    },
    tone,
  );

  return {
    seed: spec.seed,
    boxes,
    masks,
    appliedGesture: appliedGesture
      ? { type: appliedGesture.type, elementId: appliedGesture.elementId }
      : null,
    warnings,
    ground,
    decorations,
    tone,
  };
}


/**
 * Moves each "front" element so it intrudes on its partner by the requested —
 * and clamped — depth. Called twice: once when depth is first assigned, and
 * again after the fill pass, because re-stacking a column lays elements out
 * sequentially and would otherwise silently undo a deliberate overlap.
 */
function applyRelationshipOverlaps(
  spec: DesignSpec,
  boxes: Record<string, Box>,
  warnings: string[],
  bleedIds: Set<string> = new Set(),
): void {

  for (const rel of spec.relationships) {
    const front = boxes[rel.front];
    const behind = boxes[rel.behind];
    if (!front || !behind) continue;
    // A full-bleed plate is the ground the composition sits on. Promoting it
    // above its partner — which a naive "front is on top" reading would do —
    // buries the very text the relationship exists to place on the image.
    if (bleedIds.has(rel.front)) {
      behind.zIndex = Math.max(behind.zIndex, front.zIndex + 5);
      continue;
    }
    front.zIndex = Math.max(front.zIndex, behind.zIndex + 5);

    if (rel.kind === "annotate") {
      const frontElement = spec.elements.find((element) => element.id === rel.front);
      if (frontElement?.component === "annotation-label") {
        const target = { x: behind.x + behind.w / 2, y: behind.y + behind.h / 2 };
        front.propsOverride = {
          ...(front.propsOverride ?? {}),
          pointTo: target,
          side: target.x > front.x + front.w / 2 ? "left" : "right",
        };
      }
      continue;
    }
    if (rel.kind === "connect" || rel.kind === "frame") continue;

    const requested = rel.overlap ?? 0;
    if (requested <= 0) continue;

    const dx = front.x + front.w / 2 - (behind.x + behind.w / 2);
    const dy = front.y + front.h / 2 - (behind.y + behind.h / 2);
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const direction = Math.sign(vertical ? dy : dx) || 1;
    const span = vertical ? Math.min(front.h, behind.h) : Math.min(front.w, behind.w);

    // How far the front element may intrude. An overlap the composer asked for is
    // a design intent, not a licence to bury the message — and text behind needs a
    // far stricter limit than a shape, because hiding a line destroys the read.
    const maxDepth = textOcclusionLimit(behind, vertical);

    let depth = requested * span;
    if (depth > maxDepth) depth = maxDepth;
    if (depth <= 1) {
      warnings.push(
        `overlap between ${rel.front} and ${rel.behind} was dropped — it would have buried ${rel.behind}`,
      );
      continue;
    }

    // Move the front element so exactly `depth` of the two boxes intersect.
    const currentGap = vertical
      ? direction > 0
        ? front.y - (behind.y + behind.h)
        : behind.y - (front.y + front.h)
      : direction > 0
        ? front.x - (behind.x + behind.w)
        : behind.x - (front.x + front.w);
    const move = (currentGap + depth) * direction;
    if (vertical) front.y -= move;
    else front.x -= move;
  }
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/**
 * Maximum depth another element may intrude into this one.
 *
 * For text, the limit is a fraction of a single line: an overlap that swallows a
 * whole line reads as a bug, not a decision, however deliberate it was. For
 * everything else the generic area cap applies.
 */
function textOcclusionLimit(behind: Box, vertical: boolean): number {
  if (behind.lines && behind.fontSize) {
    // Horizontal coverage of text is never a design decision — it slices words
    // in half. Only a vertical tuck is allowed, and only into the descender
    // region of the last line.
    if (!vertical) return 0;
    const lineHeight = behind.h / Math.max(1, behind.lines.length);
    // Also capped in absolute terms: the front element carries its own leading
    // content (labels, chrome) in its first ~30px, and a deeper tuck would bury
    // that instead of reading as an intentional integration.
    return Math.min(lineHeight * 0.45, 28);
  }
  return (vertical ? behind.h : behind.w) * MAX_OCCLUSION;
}

function resolveCollisions(
  elements: SpecElement[],
  boxes: Record<string, Box>,
  justifiedPairs: Set<string>,
): void {
  const ordered = elements.map((e) => e.id).sort((a, b) => boxes[a]!.y - boxes[b]!.y);
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const aId = ordered[i]!;
        const bId = ordered[j]!;
        if (justifiedPairs.has(pairKey(aId, bId))) continue;
        const a = boxes[aId]!;
        const b = boxes[bId]!;
        // Compared as footprints so a rotated element cannot overlap unnoticed.
        const fa = footprint(a);
        const fb = footprint(b);
        if (overlapArea(fa, fb) <= 0) continue;
        // Only push apart vertically when they actually share a column; otherwise
        // two side-by-side elements would be stacked for no reason.
        if (horizontalOverlapRatio(fa, fb) < 0.2) continue;
        // Separation is measured on footprints too, or a rotated element is
        // pushed apart by less than its true overlap and still clips.
        const needed = fa.y + fa.h + MIN_GAP - fb.y;
        if (needed > 0) {
          b.y += needed;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * Groups elements into columns and distributes leftover vertical space, giving
 * the evidence element first claim on it. Humans fill the canvas; a composition
 * that floats in the middle of dead space is the tell of generated work.
 */
function fillColumns(
  elements: SpecElement[],
  boxes: Record<string, Box>,
  safe: { x: number; y: number; w: number; h: number },
  warnings: string[],
  growCap: Map<string, number> = new Map(),
): void {
  const ids = elements.map((e) => e.id);
  if (ids.length === 0) return;

  // Union-find over horizontal overlap → columns.
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const find = (a: string): string => {
    let root = a;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (horizontalOverlapRatio(boxes[ids[i]!]!, boxes[ids[j]!]!) >= 0.45) {
        union(ids[i]!, ids[j]!);
      }
    }
  }

  const columns = new Map<string, string[]>();
  for (const id of ids) {
    const root = find(id);
    const list = columns.get(root) ?? [];
    list.push(id);
    columns.set(root, list);
  }

  const bottom = safe.y + safe.h;
  const evidenceIds = new Set(
    elements.filter((e) => e.role === "evidence").map((e) => e.id),
  );

  for (const column of columns.values()) {
    // A lone element gets no gaps to redistribute, but if it is the evidence it
    // should still grow into its own column rather than leaving a hole beneath
    // it — a small picture floating in a tall empty column is the tell.
    if (column.length === 1) {
      const id = column[0]!;
      if (!evidenceIds.has(id)) continue;
      const box = boxes[id]!;
      const slack = bottom - (box.y + box.h);
      // Modest growth only: an evidence component has a natural aspect, and
      // stretching it into a tall ribbon to fill space is its own kind of ugly.
      const ceiling = growCap.get(id) ?? box.w * 1.2;
      const growth = Math.min(slack, Math.max(0, Math.min(box.w * 1.2, ceiling) - box.h));
      if (growth > 40) box.h += growth;
      // Whatever slack is left becomes air above *and* below rather than one
      // hole underneath — a lone panel pinned to the top of a tall column reads
      // as an accident.
      const remaining = bottom - (box.y + box.h);
      if (remaining > 60) box.y += remaining / 2;
      continue;
    }
    const sorted = column.sort((a, b) => boxes[a]!.y - boxes[b]!.y);
    const top = boxes[sorted[0]!]!.y;
    const available = bottom - top;

    // The rhythm the recipe asked for, as ratios — preserved when space is
    // redistributed so the composition keeps its intended cadence.
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = boxes[sorted[i - 1]!]!;
      const cur = boxes[sorted[i]!]!;
      gaps.push(Math.max(MIN_GAP, cur.y - (prev.y + prev.h)));
    }
    const gapTotal = gaps.reduce((sum, g) => sum + g, 0) || 1;
    const contentHeight = sorted.reduce((sum, id) => sum + boxes[id]!.h, 0);

    if (contentHeight > available + 1) {
      // Genuinely too much content: take it out of the evidence, which has the
      // most to give, before reporting a problem we could have solved.
      const evidenceId = sorted.find((id) => evidenceIds.has(id));
      if (evidenceId) {
        const ev = boxes[evidenceId]!;
        const floor = getComponent(
          elements.find((e) => e.id === evidenceId)!.component,
        ).manifest.minSize.h;
        ev.h = Math.max(floor, ev.h - (contentHeight - available));
      }
    } else {
      // Space to spare. The evidence claims it first, up to its natural aspect —
      // a bigger picture beats a bigger gap, and cropping a photograph to fit a
      // squat box is how a flyer loses its subject.
      const evidenceId = sorted.find((id) => evidenceIds.has(id));
      if (evidenceId) {
        const ev = boxes[evidenceId]!;
        const breathingRoom = Math.max(1, sorted.length - 1) * MIN_GAP * 1.8;
        const claimable = available - contentHeight - breathingRoom;
        const ceiling = growCap.get(evidenceId) ?? ev.w * 1.7;
        const target = Math.min(ceiling, ev.h + Math.max(0, claimable));
        if (target > ev.h + 8) ev.h = target;
      }
    }

    // Re-stack the column, spending whatever is left on the gaps in their
    // original proportions. Growth must never eat the minimum rhythm — if it
    // has, give the space back before laying out.
    const minGapTotal = Math.max(0, sorted.length - 1) * MIN_GAP;
    let finalContent = sorted.reduce((sum, id) => sum + boxes[id]!.h, 0);
    const deficit = finalContent + minGapTotal - available;
    if (deficit > 0) {
      const evidenceId = sorted.find((id) => evidenceIds.has(id));
      if (evidenceId) {
        const ev = boxes[evidenceId]!;
        const floor = getComponent(
          elements.find((e) => e.id === evidenceId)!.component,
        ).manifest.minSize.h;
        ev.h = Math.max(floor, ev.h - deficit);
        finalContent = sorted.reduce((sum, id) => sum + boxes[id]!.h, 0);
      }
    }
    const leftover = Math.max(0, available - finalContent);
    let cursor = top;
    for (let i = 0; i < sorted.length; i++) {
      boxes[sorted[i]!]!.y = cursor;
      cursor += boxes[sorted[i]!]!.h;
      if (i < sorted.length - 1) {
        // Cap how far any single gap can stretch. Without this, a column with
        // little content hands its entire surplus to one gap and opens a hole in
        // the middle of the page.
        const share = (leftover * gaps[i]!) / gapTotal;
        cursor += Math.max(MIN_GAP, Math.min(share, gaps[i]! * 1.8));
      }
    }
    // Deliberately no overflow warning here: this is an intermediate state, and
    // the margin pass that runs afterwards both fixes what it can and reports
    // what it cannot. Warning from here would describe geometry that never ships.
  }
}

type AppliedGesture = { type: string; elementId: string; bleeds: boolean };

/**
 * Applies the single signature gesture. Each branch mutates at most one element,
 * which is what lets Gate G5 assert "exactly one deliberate rule-break". Returns
 * null when the composition cannot express it, so the gates can fail honestly.
 */
function applyGesture(
  gesture: { apply: string; target: string; requires?: string },
  spec: DesignSpec,
  boxes: Record<string, Box>,
  rng: Rng,
  safe: { x: number; y: number; w: number; h: number },
  bleedIds: Set<string>,
): AppliedGesture | null {
  const byComponent = (component: string) => spec.elements.find((e) => e.component === component);
  const byRole = (role: string) => spec.elements.find((e) => e.role === role);

  if (gesture.requires && !byComponent(gesture.requires)) return null;

  const target =
    byRole(gesture.target) ??
    byRole("evidence") ??
    spec.elements.find((e) => e.role !== "structure");
  if (!target) return null;
  const box = boxes[target.id];
  if (!box) return null;

  switch (gesture.apply) {
    case "bleed-element":
    case "crop-hero": {
      // If the recipe already runs this element off the canvas, the crop exists
      // — pushing it further just swallows the page.
      if (bleedIds.has(target.id)) {
        return { type: gesture.apply, elementId: target.id, bleeds: true };
      }
      const rightGap = safe.x + safe.w - (box.x + box.w);
      const leftGap = box.x - safe.x;
      const amount = Math.min(box.w * 0.22, 120);
      // Bleed off whichever edge the element already sits nearest — but only
      // when that is a real difference. A centred element's two gaps differ by
      // floating-point noise, and letting that decide sends the crop through the
      // element's leading edge, where its own title and labels live. On anything
      // close to a tie, run off the right: content reads left-to-right, so the
      // left edge is the one that must survive.
      const LEADING_EDGE_TOLERANCE = 24;
      if (leftGap > rightGap + LEADING_EDGE_TOLERANCE) {
        box.x -= amount + leftGap;
        box.w += amount + leftGap;
      } else {
        box.w += amount + rightGap;
      }
      return { type: gesture.apply, elementId: target.id, bleeds: true };
    }
    case "rotate-element": {
      // Rotate something with visual mass; a tilted eyebrow reads as a mistake.
      const candidate =
        spec.elements.find((e) => e.role === "evidence") ??
        spec.elements.find(
          (e) => e.component !== "eyebrow-label" && e.role !== "brand" && e.role !== "structure",
        ) ??
        target;
      const rotated = boxes[candidate.id]!;
      rotated.rotate = rng.bool() ? rng.range(-3.5, -1.8) : rng.range(1.8, 3.5);
      return { type: gesture.apply, elementId: candidate.id, bleeds: false };
    }
    case "overlap-eyebrow": {
      const eyebrow = byComponent("eyebrow-label")!;
      const eb = boxes[eyebrow.id]!;
      // Move the eyebrow under the hero's leading edge rather than dragging the
      // hero to the top of the canvas, which would collide with everything.
      box.zIndex = eb.zIndex + 5;
      eb.y = box.y - eb.h * 0.35;
      eb.x = box.x + 26;
      return { type: gesture.apply, elementId: eyebrow.id, bleeds: false };
    }
    case "headline-behind": {
      const headline = byComponent("headline-block");
      const evidence = byRole("evidence");
      if (!headline || !evidence) return null;
      const h = boxes[headline.id]!;
      const ev = boxes[evidence.id]!;
      h.zIndex = ev.zIndex - 5;
      // Overlap only the headline's lower portion so the first line stays clear.
      const desired = ev.y - h.h * 0.62;
      h.y = Math.max(safe.y, desired);
      return { type: gesture.apply, elementId: headline.id, bleeds: false };
    }
    case "annotation-out-of-margin": {
      const note = byComponent("annotation-label")!;
      const nb = boxes[note.id]!;
      nb.x = Math.max(8, safe.x - 44);
      return { type: gesture.apply, elementId: note.id, bleeds: true };
    }
    case "rule-through-block": {
      const rule = byComponent("rule-line")!;
      const rb = boxes[rule.id]!;
      const block = byComponent("headline-block") ?? target;
      const blockBox = boxes[block.id]!;
      rb.x = safe.x - 40;
      rb.w = safe.w + 80;
      rb.h = 2;
      rb.y = blockBox.y + blockBox.h * 0.55;
      rb.zIndex = blockBox.zIndex + 5;
      return { type: gesture.apply, elementId: rule.id, bleeds: true };
    }
    case "connector-to-cta": {
      const connector = byComponent("path-connector")!;
      const path = boxes[connector.id]!;
      const cta = byRole("cta");
      if (!cta) return null;
      const ctaBox = boxes[cta.id]!;
      const evidence = byRole("evidence");
      const from = evidence ? boxes[evidence.id]! : null;

      // The path is only meaningful if it arrives somewhere: it starts under the
      // evidence and lands exactly where the CTA's underline begins.
      const startX = from ? from.x + from.w * 0.35 : safe.x + safe.w * 0.6;
      const endX = ctaBox.x;
      const endY = ctaBox.y + 46;
      // The path starts below the evidence — but a full-bleed plate's bottom is
      // the bottom of the canvas, which would start the path off the page and
      // send it travelling upward through the whole composition. Keep the start
      // above the CTA and inside the page whatever the evidence is doing.
      const belowEvidence = from ? from.y + from.h + 24 : ctaBox.y - 200;
      const startY = Math.max(safe.y, Math.min(belowEvidence, ctaBox.y - 120));

      // The final segment runs horizontally into the CTA so the path visibly
      // *becomes* the underline instead of merely pointing near it. The lead-in
      // starts slightly before the CTA's left edge — which is why the box has to
      // be derived from the points rather than assumed to be the safe rect.
      const leadIn = endX - 52;
      const runOut = endX + 90;
      const bend = { x: startX - (startX - endX) * 0.6, y: startY + (endY - startY) * 0.62 };
      // Every waypoint is held inside the safe rect. A connector is structure,
      // not a bleed: it has no business crossing the margin, and clamping here
      // is what stops the box below from being sized to off-page geometry.
      const cx = (v: number) => Math.min(safe.x + safe.w, Math.max(safe.x, v));
      const cy = (v: number) => Math.min(safe.y + safe.h, Math.max(safe.y, v));
      const absolute = [
        { x: cx(startX), y: cy(startY) },
        { x: cx(bend.x), y: cy(bend.y) },
        { x: cx(leadIn), y: cy(endY) },
        { x: cx(runOut), y: cy(endY) },
      ];

      // Size the box to the geometry it must contain. Normalising against a box
      // that does not enclose the points yields coordinates outside 0–1, and the
      // path then escapes its own box and runs off the canvas — invisible to the
      // margin pass, which only ever inspects boxes.
      const minX = Math.min(...absolute.map((p) => p.x));
      const maxX = Math.max(...absolute.map((p) => p.x));
      const minY = Math.min(...absolute.map((p) => p.y));
      const maxY = Math.max(...absolute.map((p) => p.y));
      path.x = Math.min(safe.x, minX - 8);
      path.w = Math.max(maxX + 8, safe.x + safe.w) - path.x;
      path.y = minY - 8;
      path.h = Math.max(48, maxY - minY + 16);
      path.zIndex = ctaBox.zIndex - 1;

      // Clamped as a second line of defence: a waypoint outside its box is
      // always a bug, and clipping it is preferable to drawing off-canvas.
      const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
      const nx = (v: number) => clamp01((v - path.x) / path.w);
      const ny = (v: number) => clamp01((v - path.y) / path.h);
      path.propsOverride = {
        points: absolute.map((p) => ({ x: nx(p.x), y: ny(p.y) })),
        curve: "curved",
        arrow: false,
        // Kept in canvas units so the points can be re-normalised after the
        // later passes have finished moving this box. `props.parse` strips it.
        absPoints: absolute,
      };
      return { type: gesture.apply, elementId: connector.id, bleeds: false };
    }
    case "letterform-structure": {
      const letter = byComponent("oversized-letterform")!;
      const lb = boxes[letter.id]!;
      lb.x = safe.x - 60;
      lb.w += 60;
      lb.zIndex = 2;
      return { type: gesture.apply, elementId: letter.id, bleeds: true };
    }
    case "numeral-bleed": {
      const numeral = byComponent("big-numeral")!;
      const nb = boxes[numeral.id]!;
      nb.x = Math.min(nb.x, safe.x - 56);
      nb.w += 56;
      return { type: gesture.apply, elementId: numeral.id, bleeds: true };
    }
    default:
      return { type: gesture.apply, elementId: target.id, bleeds: false };
  }
}
