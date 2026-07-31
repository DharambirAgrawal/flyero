import { describe, expect, it } from "vitest";
import { fixtureLineages, fixtureSpec } from "../fixtures.js";
import { solveLayout } from "../../src/core/layout/solver.js";
import { themeFromSpec } from "../../src/core/render/theme.js";
import { GRAPHICS_IDS, graphicsById } from "../../src/creative/graphics.js";
import { TOPOLOGY_IDS } from "../../src/creative/topologies.js";
import { DECOR_BUDGET, MAX_BOLD_MOVES, OVER_ALLOWED, boldnessSpent } from "../../src/core/decor/budget.js";
import { keepOutsFrom } from "../../src/core/decor/decorations.js";
import { decorId } from "../../src/core/decor/ids.js";
import { overlapArea } from "../../src/core/decor/ink.js";
import { relativeLuminance } from "../../src/creative/color.js";
import type { LayoutResult } from "../../src/core/layout/solver.js";
import type { DesignSpec } from "../../src/core/compose/spec.js";

/**
 * The clutter guarantees.
 *
 * Engine-generated ornament never enters `spec.elements`, so Gate G3 cannot see
 * it and the banned-list's `meaningless-structure` signal cannot see it either.
 * The budget in `budget.ts` is the only thing standing between a graphic
 * language and a page covered in sparkles — so every cap gets a test, and the
 * keep-out invariant is checked across the whole product of graphic languages
 * and topologies rather than on one lucky fixture.
 */

const base = fixtureLineages("DECOR-0001", 1)[0]!;

/** Every (graphic language × topology) pairing, solved. */
function allCases(): { id: string; spec: DesignSpec; layout: LayoutResult }[] {
  const out: { id: string; spec: DesignSpec; layout: LayoutResult }[] = [];
  for (const graphics of GRAPHICS_IDS) {
    for (const topology of TOPOLOGY_IDS) {
      const spec = fixtureSpec({ ...base, graphics, topology });
      out.push({ id: `${graphics}/${topology}`, spec, layout: solveLayout(spec, themeFromSpec(spec)) });
    }
  }
  return out;
}

const CASES = allCases();

describe("decoration layer — placement is safe everywhere", () => {
  it("covers every graphic language against every topology", () => {
    expect(CASES.length).toBe(GRAPHICS_IDS.length * TOPOLOGY_IDS.length);
  });

  it("never intrudes on a text or evidence keep-out beyond its allowance", () => {
    for (const { id, spec, layout } of CASES) {
      const keepOuts = keepOutsFrom(spec, layout.boxes);
      for (const decoration of layout.decorations) {
        // A faint wash under the content is a tint on the paper, not something
        // type competes with; everything else must stay clear.
        if (decoration.weight === "wash" && decoration.layer === "under") continue;
        const area = Math.max(1, decoration.bbox.w * decoration.bbox.h);
        for (const ko of keepOuts) {
          const covered = overlapArea(decoration.bbox, ko.rect) / area;
          expect(
            covered,
            `${id}: ${decoration.id} (${decoration.weight}/${decoration.layer}) covers ` +
              `${(covered * 100).toFixed(1)}% of ${ko.elementId}'s keep-out`,
          ).toBeLessThanOrEqual(ko.allowance + 1e-9);
        }
      }
    }
  });

  it("respects every budget cap", () => {
    for (const { id, spec, layout } of CASES) {
      const decorations = layout.decorations;
      const canvasArea = spec.canvas.w * spec.canvas.h;

      expect(decorations.length, `${id} item count`).toBeLessThanOrEqual(DECOR_BUDGET.MAX_ITEMS);

      const forms = new Set(decorations.map((d) => d.form));
      expect(forms.size, `${id} distinct forms`).toBeLessThanOrEqual(DECOR_BUDGET.MAX_FORMS);

      const over = decorations.filter((d) => d.layer === "over");
      expect(over.length, `${id} over-layer count`).toBeLessThanOrEqual(DECOR_BUDGET.MAX_OVER_ITEMS);

      const ink = decorations.reduce((sum, d) => sum + d.ink, 0);
      expect(ink / canvasArea, `${id} ink coverage`).toBeLessThanOrEqual(DECOR_BUDGET.MAX_INK_COVERAGE);
    }
  });

  it("only ever paints permitted forms above the content", () => {
    for (const { id, layout } of CASES) {
      for (const d of layout.decorations.filter((x) => x.layer === "over")) {
        expect(OVER_ALLOWED.has(d.form), `${id}: ${d.form} must not be painted over the content`).toBe(
          true,
        );
      }
    }
  });

  it("gives every decoration a unique id that cannot collide with production ids", () => {
    for (const { id, spec, layout } of CASES) {
      const ids = layout.decorations.map((d) => d.id);
      expect(new Set(ids).size, `${id} duplicate decoration ids`).toBe(ids.length);
      for (const elementId of spec.elements.map((e) => e.id)) {
        expect(ids).not.toContain(elementId);
        expect(ids).not.toContain(`clip-${elementId}`);
        expect(ids).not.toContain(`scrim-${elementId}`);
      }
    }
  });

  it("never produces an id that would fail checkEditability", () => {
    // src/core/export/index.ts:54 rejects any <path> whose id mentions
    // headline/copy/text/label. An arched-text guide is the obvious trap.
    const forbidden = /(headline|copy|text|label)/i;
    for (const { layout } of CASES) {
      for (const d of layout.decorations) expect(forbidden.test(d.id)).toBe(false);
    }
    expect(() => decorId(0, "textpath")).toThrow(/checkEditability/);
    expect(() => decorId(2, "arch-guide")).not.toThrow();
  });

  it("keeps editorial-restraint genuinely silent", () => {
    // Quiet output has to stay reachable or the product loses its point.
    for (const { id, layout } of CASES.filter((c) => c.id.startsWith("editorial-restraint/"))) {
      expect(layout.decorations, `${id} should carry no ornament`).toHaveLength(0);
      expect(layout.ground.kind, `${id} ground`).toBe("flat");
    }
  });
});

describe("decoration layer — determinism", () => {
  it("plans identical decorations across five solves", () => {
    for (const graphics of GRAPHICS_IDS) {
      const spec = fixtureSpec({ ...base, graphics });
      const theme = themeFromSpec(spec);
      const first = JSON.stringify(solveLayout(spec, theme).decorations);
      for (let i = 0; i < 4; i++) {
        expect(JSON.stringify(solveLayout(spec, theme).decorations), graphics).toBe(first);
      }
    }
  });

  it("plans identical grounds across five solves", () => {
    for (const graphics of GRAPHICS_IDS) {
      const spec = fixtureSpec({ ...base, graphics });
      const theme = themeFromSpec(spec);
      const first = JSON.stringify(solveLayout(spec, theme).ground);
      for (let i = 0; i < 4; i++) {
        expect(JSON.stringify(solveLayout(spec, theme).ground), graphics).toBe(first);
      }
    }
  });

  it("gives each slot an independent stream, so one slot cannot shift another", () => {
    // sticker-sheet asks for two sparkles in different zones. If they shared a
    // stream, a rejected placement in the first would move the second.
    const spec = fixtureSpec({ ...base, graphics: "sticker-sheet" });
    const sparkles = solveLayout(spec, themeFromSpec(spec)).decorations.filter(
      (d) => d.form === "sparkle",
    );
    const ids = new Set(sparkles.map((d) => d.id));
    expect(ids.size).toBe(sparkles.length);
  });
});

describe("decoration layer — the ground participates in ink", () => {
  it("records the measured ground, and derives onDark from it", () => {
    /*
     * This used to assert `ground` was only ever set alongside `onDark`, back
     * when it existed solely to describe dark photographic plates. That was too
     * narrow: *muted* ink also has to hold contrast against what is underneath,
     * and on a light-but-not-page-coloured ground it was resolving against
     * `palette.bg` and coming out an unreadable grey. `ground` is now recorded
     * whenever it differs from the page, and `onDark` simply follows the
     * measured luminance.
     */
    for (const { id, layout } of CASES) {
      for (const box of Object.values(layout.boxes)) {
        if (!box.ground) continue;
        expect(box.ground, `${id}`).toMatch(/^#[0-9a-fA-F]{6}$|^rgba?\(/);
        const lum = relativeLuminance(box.ground);
        // onDark must agree with the tone it was derived from.
        if (box.onDark) expect(lum, `${id}: onDark on a light ground`).toBeLessThan(0.62);
      }
    }
  });

  it("every graphic language yields a ground covering the whole canvas", () => {
    for (const { id, layout } of CASES) {
      expect(layout.ground.base, `${id} has no base wash`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });
});

describe("boldness budget — spend it in one place", () => {
  const base = fixtureLineages("BOLD-1", 1)[0]!;

  it("demotes solid ornament once the ground, gesture and treatment have spent the budget", () => {
    // sticker-sheet asks for solid ribbons and sparkles. On a loud ground, with
    // a gesture applied and an arched headline, there is nothing left to spend.
    const spec = fixtureSpec({ ...base, graphics: "sticker-sheet" });
    for (const el of spec.elements) {
      if (el.component === "headline-block") el.props = { ...(el.props ?? {}), treatment: "arch" };
    }
    const layout = solveLayout(spec, themeFromSpec(spec));
    const spent = boldnessSpent({
      groundIsLoud: layout.ground.kind !== "flat",
      gestureApplied: layout.appliedGesture !== null,
      treatmentIsLoud: true,
    });
    const solids = layout.decorations.filter((d) => d.weight === "solid").length;
    expect(spent + solids, `spent ${spent} + ${solids} solid marks`).toBeLessThanOrEqual(MAX_BOLD_MOVES);
  });

  it("never exceeds the bold budget for any language on any topology", () => {
    for (const { id, spec, layout } of CASES) {
      const treatmentIsLoud = spec.elements.some(
        (el) => el.component === "headline-block" && (el.props as { treatment?: string })?.treatment
          ? (el.props as { treatment?: string }).treatment !== "plain"
          : false,
      );
      const spent = boldnessSpent({
        groundIsLoud: layout.ground.kind !== "flat",
        gestureApplied: layout.appliedGesture !== null,
        treatmentIsLoud,
      });
      const solids = layout.decorations.filter((d) => d.weight === "solid").length;
      expect(spent + solids, `${id}: ${spent} committed + ${solids} solid ornaments`).toBeLessThanOrEqual(
        MAX_BOLD_MOVES,
      );
    }
  });
});
