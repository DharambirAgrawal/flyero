import { describe, it, expect } from "vitest";
import { fixtureLineages, fixtureSpec } from "../fixtures.js";
import { solveLayout } from "../../src/core/layout/solver.js";
import { themeFromSpec } from "../../src/core/render/theme.js";
import { TOPOLOGY_RECIPES, recipeFor } from "../../src/core/layout/recipes.js";
import { readingPathFor } from "../../src/creative/topologies.js";
import { fitText, measureText, wrapText, metricsFor } from "../../src/core/render/fonts.js";
import { TOPOLOGY_IDS } from "../../src/creative/topologies.js";
import { COMPONENTS, getComponent } from "../../src/components/registry.js";

/**
 * The layout solver is the backbone of quality and it is a pure function, so it
 * gets tested hard (AGENTS.md).
 */

function overlapArea(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

describe("text measurement", () => {
  it("measures wider strings as wider", () => {
    const style = { family: "Inter", weight: 400, size: 40 };
    expect(measureText("mmmmmmmm", style)).toBeGreaterThan(measureText("iiii", style));
  });

  it("wraps within the requested column and never exceeds it", () => {
    const style = { family: "Inter", weight: 400, size: 32 };
    const lines = wrapText(
      "Vayami rewrites your résumé the way recruiters actually read it, line by line.",
      style,
      420,
    );
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureText(line, style)).toBeLessThanOrEqual(420);
  });

  it("hard-splits a word wider than the column rather than overflowing", () => {
    const style = { family: "Inter", weight: 700, size: 90 };
    const lines = wrapText("Unconscionable", style, 200);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureText(line, style)).toBeLessThanOrEqual(200);
  });

  it("reports real ink height, not lines × leading", () => {
    // With tight leading the naive product under-reports; this is the bug that
    // let headlines overflow their own box.
    const fit = fitText(
      "Turn experience into opportunity",
      { family: "Archivo", weight: 900, tracking: -0.03, lineHeight: 0.92 },
      { w: 600, h: 800 },
      { min: 30, max: 120, maxLines: 4, lineHeight: 0.92 },
    );
    const { ascent, descent } = metricsFor({
      family: "Archivo",
      weight: 900,
      size: fit.size,
      lineHeight: 0.92,
    });
    const naive = fit.lines.length * fit.size * 0.92;
    const real = (fit.lines.length - 1) * fit.size * 0.92 + ascent + descent;
    expect(fit.height).toBeCloseTo(real, 5);
    expect(fit.height).toBeGreaterThan(naive);
  });

  it("returns the largest size that fits", () => {
    const box = { w: 500, h: 300 };
    const fit = fitText(
      "Two words",
      { family: "Inter", weight: 700, tracking: 0, lineHeight: 1 },
      box,
      { min: 20, max: 200, maxLines: 2, lineHeight: 1 },
    );
    expect(fit.width).toBeLessThanOrEqual(box.w);
    expect(fit.height).toBeLessThanOrEqual(box.h);
    // One size larger must not fit, or the search stopped early.
    const bigger = fitText(
      "Two words",
      { family: "Inter", weight: 700, tracking: 0, lineHeight: 1 },
      box,
      { min: fit.size + 1, max: fit.size + 1, maxLines: 2, lineHeight: 1 },
    );
    expect(bigger.width > box.w || bigger.height > box.h).toBe(true);
  });
});

describe("topology recipes", () => {
  it("defines a recipe for every topology", () => {
    for (const id of TOPOLOGY_IDS) {
      expect(TOPOLOGY_RECIPES[id]).toBeDefined();
      expect(recipeFor(id).id).toBe(id);
    }
  });

  it("gives every recipe all six slots plus the eyebrow", () => {
    for (const id of TOPOLOGY_IDS) {
      const slots = recipeFor(id).slots;
      for (const name of ["eyebrow", "message", "evidence", "support", "cta", "brand", "structure"]) {
        expect(slots[name as keyof typeof slots], `${id} missing ${name}`).toBeDefined();
      }
    }
  });
});

describe("layout solver", () => {
  const specs = fixtureLineages("layout-seed", 8).map(fixtureSpec);

  it("places every element in every sampled lineage", () => {
    for (const spec of specs) {
      const layout = solveLayout(spec, themeFromSpec(spec));
      for (const el of spec.elements) {
        const box = layout.boxes[el.id];
        expect(box, `${spec.lineage.topology} lost ${el.id}`).toBeDefined();
        expect(box!.w).toBeGreaterThan(0);
        expect(box!.h).toBeGreaterThan(0);
      }
    }
  });

  it("is deterministic for a given spec and seed", () => {
    for (const spec of specs) {
      const a = solveLayout(spec, themeFromSpec(spec));
      const b = solveLayout(spec, themeFromSpec(spec));
      expect(JSON.stringify(a.boxes)).toBe(JSON.stringify(b.boxes));
    }
  });

  it("applies exactly one gesture, to exactly one element", () => {
    for (const spec of specs) {
      const layout = solveLayout(spec, themeFromSpec(spec));
      expect(layout.appliedGesture, `${spec.lineage.gesture} not applied`).not.toBeNull();
      const rotated = Object.values(layout.boxes).filter((b) => b.rotate);
      expect(rotated.length).toBeLessThanOrEqual(1);
    }
  });

  it("keeps non-gesture elements inside the safe area", () => {
    for (const spec of specs) {
      const layout = solveLayout(spec, themeFromSpec(spec));
      const bled = layout.appliedGesture?.elementId;
      const recipe = recipeFor(spec.lineage.topology);
      const bleedSlots = new Set(recipe.bleed);
      const safe = {
        x: spec.canvas.safe,
        y: spec.canvas.safe,
        right: spec.canvas.w - spec.canvas.safe,
        bottom: spec.canvas.h - spec.canvas.safe,
      };
      for (const el of spec.elements) {
        // Bleed slots run off the canvas on purpose — that is the recipe's design,
        // not an escaped element.
        const slot = el.component === "eyebrow-label" ? "eyebrow" : el.role;
        if (el.role === "structure" || el.id === bled || bleedSlots.has(slot as never)) continue;
        const box = layout.boxes[el.id]!;
        expect(box.x, `${el.id} left`).toBeGreaterThanOrEqual(safe.x - 1);
        expect(box.y, `${el.id} top`).toBeGreaterThanOrEqual(safe.y - 1);
        expect(box.x + box.w, `${el.id} right`).toBeLessThanOrEqual(safe.right + 1);
      }
    }
  });

  it("never leaves an unjustified collision between elements in a column", () => {
    for (const spec of specs) {
      const layout = solveLayout(spec, themeFromSpec(spec));
      const justified = new Set(
        spec.relationships.map((r) => [r.front, r.behind].sort().join("|")),
      );
      const bleedSlots = new Set(recipeFor(spec.lineage.topology).bleed);
      const positioned = spec.elements.filter(
        (e) =>
          e.role !== "structure" &&
          !bleedSlots.has((e.component === "eyebrow-label" ? "eyebrow" : e.role) as never),
      );
      for (let i = 0; i < positioned.length; i++) {
        for (let j = i + 1; j < positioned.length; j++) {
          const a = positioned[i]!;
          const b = positioned[j]!;
          if (justified.has([a.id, b.id].sort().join("|"))) continue;
          const boxA = layout.boxes[a.id]!;
          const boxB = layout.boxes[b.id]!;
          const shareColumn =
            Math.max(
              0,
              Math.min(boxA.x + boxA.w, boxB.x + boxB.w) - Math.max(boxA.x, boxB.x),
            ) /
              Math.max(1, Math.min(boxA.w, boxB.w)) >=
            0.2;
          if (!shareColumn) continue;
          expect(
            overlapArea(boxA, boxB),
            `${spec.lineage.topology}: ${a.id} collides with ${b.id}`,
          ).toBe(0);
        }
      }
    }
  });

  it("caps a justified overlap so the text behind stays legible", () => {
    for (const spec of specs) {
      const layout = solveLayout(spec, themeFromSpec(spec));
      for (const mask of layout.masks) {
        const behind = layout.boxes[mask.elementId]!;
        if (!behind.lines) continue;
        // Never more than a fraction of one line of the headline.
        expect(mask.maxOcclusionRatio).toBeLessThan(0.5);
      }
    }
  });

  it("respects each component's minimum size", () => {
    for (const spec of specs) {
      const layout = solveLayout(spec, themeFromSpec(spec));
      for (const el of spec.elements) {
        if (el.role === "structure") continue;
        const min = getComponent(el.component).manifest.minSize;
        const box = layout.boxes[el.id]!;
        expect(box.w, `${el.id} width below minimum`).toBeGreaterThanOrEqual(min.w * 0.9);
      }
    }
  });

  it("fills the canvas instead of floating in dead space", () => {
    for (const spec of specs) {
      const layout = solveLayout(spec, themeFromSpec(spec));
      const boxes = spec.elements
        .filter((e) => e.role !== "structure")
        .map((e) => layout.boxes[e.id]!);
      const bottom = Math.max(...boxes.map((b) => b.y + b.h));
      const top = Math.min(...boxes.map((b) => b.y));
      const used = bottom - top;
      const available = spec.canvas.h - spec.canvas.safe * 2;
      expect(used / available, `${spec.lineage.topology} uses too little height`).toBeGreaterThan(
        0.8,
      );
    }
  });
});

/**
 * The Diversity Requirement is a claim about *structure*, not just palette. Ten
 * topologies that all put the message at the top and the CTA at the foot are one
 * layout wearing ten costumes — which is exactly what this system shipped before
 * these bands were rewritten. This test is the guard against sliding back.
 */
describe("topology recipes are structurally distinct", () => {
  const ids = Object.keys(TOPOLOGY_RECIPES) as Array<keyof typeof TOPOLOGY_RECIPES>;

  it("does not start the message at the same height in most topologies", () => {
    const tops = ids.map((id) => Number(TOPOLOGY_RECIPES[id].slots.message.y.toFixed(2)));
    const counts = new Map<number, number>();
    for (const t of tops) counts.set(t, (counts.get(t) ?? 0) + 1);
    const mostCommon = Math.max(...counts.values());
    expect(mostCommon, `${mostCommon}/${ids.length} topologies share one message y`).toBeLessThanOrEqual(4);
  });

  it("puts the message below the evidence in at least two topologies", () => {
    const belows = ids.filter((id) => {
      const s = TOPOLOGY_RECIPES[id].slots;
      return s.message.y > s.evidence.y + s.evidence.h * 0.5;
    });
    expect(belows.length).toBeGreaterThanOrEqual(2);
  });

  it("varies where the call to action sits", () => {
    const ys = new Set(ids.map((id) => Number(TOPOLOGY_RECIPES[id].slots.cta.y.toFixed(2))));
    expect(ys.size).toBeGreaterThanOrEqual(4);
  });

  it("bleeds the evidence off the canvas in several topologies", () => {
    const bleeding = ids.filter((id) => TOPOLOGY_RECIPES[id].bleed.length > 0);
    expect(bleeding.length).toBeGreaterThanOrEqual(5);
  });

  it("uses more than one text alignment across the set", () => {
    const aligns = new Set<string>();
    for (const id of ids) for (const a of Object.values(TOPOLOGY_RECIPES[id].align)) aligns.add(a);
    expect(aligns.size).toBeGreaterThanOrEqual(2);
  });

  it("keeps every recipe's readingPath consistent with the locked map", () => {
    for (const id of ids) {
      expect(TOPOLOGY_RECIPES[id].readingPath).toBe(readingPathFor(id));
    }
  });
});

describe("photographic evidence keeps topology architecture", () => {
  it("only promotes a photo to the full canvas when the evidence slot is already the page", () => {
    expect(recipeFor("layered-depth-stack").photoGround).toBe(true);
    const full = fixtureSpec({
      ...fixtureLineages("ARCH-FULL", 1)[0]!,
      topology: "layered-depth-stack",
    });
    const split = fixtureSpec({
      ...fixtureLineages("ARCH-SPLIT", 1)[0]!,
      topology: "off-center-hero",
    });
    const band = fixtureSpec({
      ...fixtureLineages("ARCH-BAND", 1)[0]!,
      topology: "banded-masthead",
    });
    for (const spec of [full, split, band]) {
      spec.elements.find((e) => e.role === "evidence")!.component = "photo-hero";
    }
    const fullBox = solveLayout(full, themeFromSpec(full)).boxes[
      full.elements.find((e) => e.role === "evidence")!.id
    ]!;
    const splitBox = solveLayout(split, themeFromSpec(split)).boxes[
      split.elements.find((e) => e.role === "evidence")!.id
    ]!;
    const bandBox = solveLayout(band, themeFromSpec(band)).boxes[
      band.elements.find((e) => e.role === "evidence")!.id
    ]!;
    expect(fullBox.w).toBeGreaterThanOrEqual(full.canvas.w * 0.92);
    expect(fullBox.h).toBeGreaterThanOrEqual(full.canvas.h * 0.92);
    expect(splitBox.w).toBeLessThan(split.canvas.w * 0.85);
    expect(bandBox.h).toBeLessThan(band.canvas.h * 0.85);
  });

  it("applies the graphic language's CTA style when the author left it default", () => {
    const spec = fixtureSpec({
      ...fixtureLineages("CTA-STYLE", 1)[0]!,
      graphics: "organic-blobs",
    });
    spec.elements.find((e) => e.role === "evidence")!.component = "photo-hero";
    const cta = spec.elements.find((e) => e.component === "cta-button")!;
    expect(cta.props?.style).toBeUndefined();
    const layout = solveLayout(spec, themeFromSpec(spec));
    expect(layout.boxes[cta.id]!.propsOverride?.style).toBe("solid");
  });
});

/**
 * Recipe bands are hand-written, and a pair that overlaps vertically while also
 * sharing a column produces a collision the solver then has to fight — usually
 * ending with text sitting on the call to action. Cheaper to forbid it here.
 */
describe("recipe slots do not fight each other", () => {
  const flow = ["eyebrow", "message", "support", "cta", "brand"] as const;

  it("keeps stacked slots out of each other's vertical band", () => {
    const clashes: string[] = [];
    for (const [id, recipe] of Object.entries(TOPOLOGY_RECIPES)) {
      for (let i = 0; i < flow.length; i++) {
        for (let j = i + 1; j < flow.length; j++) {
          const a = recipe.slots[flow[i]!];
          const b = recipe.slots[flow[j]!];
          const shareColumn =
            Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) /
              Math.max(0.01, Math.min(a.w, b.w)) >
            0.25;
          const verticalOverlap =
            Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
          if (shareColumn && verticalOverlap > 0.001) {
            clashes.push(`${id}: ${flow[i]} overlaps ${flow[j]}`);
          }
        }
      }
    }
    expect(clashes).toEqual([]);
  });

  it("keeps a connector's waypoints inside its own box", () => {
    // A waypoint normalised against a box that does not enclose it produces a
    // coordinate outside 0-1, and the path then draws off the canvas. The
    // margin pass cannot catch that, because it only ever inspects boxes.
    for (const lineage of fixtureLineages("CONNECT-1", 6)) {
      const spec = fixtureSpec(lineage);
      const layout = solveLayout(spec, themeFromSpec(spec));
      for (const el of spec.elements) {
        const box = layout.boxes[el.id];
        const points = box?.propsOverride?.points as { x: number; y: number }[] | undefined;
        if (!points) continue;
        for (const p of points) {
          expect(p.x, `${el.id} waypoint x`).toBeGreaterThanOrEqual(0);
          expect(p.x, `${el.id} waypoint x`).toBeLessThanOrEqual(1);
          expect(p.y, `${el.id} waypoint y`).toBeGreaterThanOrEqual(0);
          expect(p.y, `${el.id} waypoint y`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("leaves no large dead band across any topology", () => {
    // A quarter of a page with nothing in it reads as a missing element, not as
    // restraint. `off-center-hero` used to leave 30% empty directly under a lone
    // eyebrow; this measures every recipe so that cannot come back unnoticed.
    const base = fixtureLineages("DEADBAND-1", 1)[0]!;
    for (const topology of TOPOLOGY_IDS) {
      const spec = fixtureSpec({ ...base, topology });
      const layout = solveLayout(spec, themeFromSpec(spec));
      const rows = new Array(100).fill(false);
      for (const el of spec.elements) {
        if (el.role === "structure") continue;
        const box = layout.boxes[el.id];
        if (!box) continue;
        const from = Math.max(0, Math.floor((box.y / spec.canvas.h) * 100));
        const to = Math.min(100, Math.ceil(((box.y + box.h) / spec.canvas.h) * 100));
        for (let r = from; r < to; r++) rows[r] = true;
      }
      let worst = 0;
      let run = 0;
      for (const covered of rows) {
        run = covered ? 0 : run + 1;
        if (run > worst) worst = run;
      }
      expect(worst, `${topology} leaves a ${worst}% empty band`).toBeLessThanOrEqual(20);
    }
  });

  it("every component accepts the alignment its slot may be given", () => {
    // `radial-field` centres every slot, and the solver passes the recipe's
    // alignment straight into props. A component whose enum omits "middle"
    // therefore throws for that topology — which is how footer-lockup shipped
    // broken on radial-field without any test noticing.
    for (const topology of TOPOLOGY_IDS) {
      const recipe = recipeFor(topology);
      for (const [slot, align] of Object.entries(recipe.align)) {
        for (const mod of COMPONENTS) {
          const takesSlot =
            slot === "eyebrow"
              ? mod.manifest.id === "eyebrow-label"
              : (mod.manifest.roles as string[]).includes(slot);
          if (!takesSlot) continue;
          // Only the align field is under test — other required props are
          // supplied by the author and are not this contract's business.
          const parsed = mod.props.safeParse({ align });
          const alignRejected =
            !parsed.success &&
            parsed.error.issues.some((issue) => issue.path[0] === "align");
          expect(
            alignRejected,
            `${mod.manifest.id} rejects align="${align}" required by ${topology}/${slot}`,
          ).toBe(false);
        }
      }
    }
  });
});

describe("detail-cluster row height scales with fact count", () => {
  // Real, user-visible bug this closes: intrinsicHeight for "column"
  // arrangement returned a fixed 190px regardless of how many facts were
  // supplied, so a solver-assigned box sized for ~3 facts gave a 4th (and
  // any further) row nowhere to go — its label rendered on top of the
  // previous row's value. intrinsicHeight now takes `copy` so it can see the
  // real fact count; this checks the two things that matter: the height
  // actually grows with fact count, and the box it produces is large enough
  // that the solver's own row math (mirrored here) never overlaps consecutive
  // rows.
  const mod = getComponent("detail-cluster");

  it("returns more height for more facts", () => {
    const props = mod.props.parse({ arrangement: "column" });
    const twoFacts = mod.intrinsicHeight!(props, {} as never, 300, {
      details: [
        { label: "Day", value: "Saturday" },
        { label: "Time", value: "9am" },
      ],
    } as never);
    const sixFacts = mod.intrinsicHeight!(props, {} as never, 300, {
      details: Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
    } as never);
    expect(sixFacts).toBeGreaterThan(twoFacts * 2);
  });

  it("gives every row enough height that consecutive label/value pairs cannot overlap", () => {
    for (const factCount of [2, 3, 4, 5, 6]) {
      const width = 300;
      const props = mod.props.parse({ arrangement: "column" });
      const copy = {
        details: Array.from({ length: factCount }, (_, i) => ({ label: `L${i}`, value: `V${i}` })),
      } as never;
      const totalHeight = mod.intrinsicHeight!(props, {} as never, width, copy);
      const cellH = totalHeight / factCount;
      // Mirrors render()'s own sizing so this test fails the moment the two
      // formulas drift apart again, not just when today's specific numbers do.
      const labelSize = Math.max(10, Math.min(15, width * 0.075));
      const valueSize = Math.max(15, Math.min(30, width * 0.14));
      const rowContentHeight = labelSize * 1.9 + valueSize;
      expect(
        cellH,
        `${factCount} facts: row height ${cellH.toFixed(1)} too small for content height ${rowContentHeight.toFixed(1)}`,
      ).toBeGreaterThanOrEqual(rowContentHeight);
    }
  });
});
