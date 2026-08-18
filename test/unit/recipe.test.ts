import { describe, it, expect } from "vitest";
import { compileRecipe, legalComponentsFor, type RecipeFill } from "../../src/core/compose/recipe.js";
import { assembleSpec } from "../../src/core/compose/assemble.js";
import { gestureById } from "../../src/creative/gestures.js";
import { TOPOLOGY_IDS } from "../../src/creative/topologies.js";
import { isPhotoGround } from "../../src/core/layout/recipes.js";
import { fixtureLineages } from "../fixtures.js";
import type { Lineage } from "../../src/core/compose/spec.js";

/**
 * The recipe compiler is the whole point of R3: an author fills four named
 * slots and never touches ids, relationships, or gesture — the compiler must
 * always produce a spec that clears `designSpecSchema` on its own, for every
 * topology the sampler can hand out.
 */

// `sampleLineages` forces metaphor uniqueness *within* one call — a single
// call can never ask for more lineages than there are metaphor families, so
// broad coverage comes from many small calls (matching real usage, 3 per
// job) across different seeds, not one giant count.
function manyLineages(seedPrefix: string, seeds = 15): Lineage[] {
  const out: Lineage[] = [];
  for (let i = 0; i < seeds; i++) out.push(...fixtureLineages(`${seedPrefix}-${i}`, 3));
  return out;
}

// Content the auto-insert path deliberately refuses to fabricate — supplied
// here explicitly, the way a real author would via `extras`, purely so the
// "does every sampled topology compile" test isn't blocked by gestures that
// need real copy.
const CONTENT_GESTURE_EXTRAS: Record<string, { component: string; role: "support"; props: Record<string, unknown> }> = {
  "annotation-label": {
    component: "annotation-label",
    role: "support",
    props: { text: "rewritten to lead with the outcome" },
  },
  "big-numeral": {
    component: "big-numeral",
    role: "support",
    props: { value: "3x", caption: "callbacks reported by early users" },
  },
  "eyebrow-label": { component: "eyebrow-label", role: "support", props: {} },
};

function minimalFill(lineage: Lineage): RecipeFill {
  const pick = (role: "evidence" | "message" | "support" | "cta") => {
    const options = legalComponentsFor(lineage, role);
    if (options.length === 0) throw new Error(`no ${role} component for ${lineage.topology}`);
    return { component: options[0]!, whyHere: `carries the ${role} of this flyer` };
  };
  const gesture = gestureById(lineage.gesture);
  const contentExtra = gesture.requires ? CONTENT_GESTURE_EXTRAS[gesture.requires] : undefined;
  return {
    productName: "Test Product",
    idea: "A test idea sentence describing what the viewer sees.",
    story: ["problem", "product acting", "payoff", "cta"],
    copy: {
      eyebrow: "For early adopters",
      headline: "A Real Headline",
      body: null,
      cta: { label: "Learn more", url: null, qr: false },
    },
    groundAsset: "ast_test_01",
    slots: {
      evidence: pick("evidence"),
      message: pick("message"),
      support: pick("support"),
      cta: pick("cta"),
    },
    extras: contentExtra
      ? [{ ...contentExtra, whyHere: `carries this lineage's signature gesture (${gesture.id})` }]
      : undefined,
    gesturePurpose: `applies ${gesture.id} to make the story land`,
  };
}

describe("recipe compiler", () => {
  it("every topology has at least one legal component per required role", () => {
    for (const topology of TOPOLOGY_IDS) {
      for (const role of ["evidence", "message", "support", "cta"] as const) {
        expect(legalComponentsFor({ topology }, role).length, `${topology}/${role}`).toBeGreaterThan(0);
      }
    }
  });

  it("compiles a minimal fill into a spec that passes designSpecSchema, for every sampled topology", () => {
    const lineages = manyLineages("recipe-compiler-seed", 15);
    for (const lineage of lineages) {
      const fill = minimalFill(lineage);
      const compiled = compileRecipe(lineage, fill);
      expect(compiled.ok, `compile ${lineage.topology}: ${!compiled.ok ? compiled.errors.join("; ") : ""}`).toBe(true);
      if (!compiled.ok) continue;

      const result = assembleSpec(lineage, compiled.authored, [], { w: 1080, h: 1350, safe: 64 });
      expect(result.ok, `assemble ${lineage.topology}: ${!result.ok ? result.errors.join("; ") : ""}`).toBe(true);
      if (!result.ok) continue;

      expect(result.spec.elements.length).toBeGreaterThanOrEqual(4);
      expect(result.spec.elements.length).toBeLessThanOrEqual(7);

      const headline = result.spec.elements.find((e) => e.role === "message")!;
      const headlineParticipates = result.spec.relationships.some(
        (r) => r.front === headline.id || r.behind === headline.id,
      );
      expect(headlineParticipates, `${lineage.topology} G4 precondition`).toBe(true);

      const gesture = gestureById(lineage.gesture);
      if (gesture.requires) {
        expect(
          result.spec.elements.some((e) => e.component === gesture.requires),
          `${lineage.topology} gesture ${gesture.id} requires ${gesture.requires}`,
        ).toBe(true);
      }
    }
  });

  // Only these three `requires` components take pure layout-shape props
  // (points/character/weight) — safe to auto-insert. The rest need real
  // authored copy (a caption, a figure) and must come from the author via
  // `extras`, never fabricated (law 5).
  const AUTO_INSERTABLE = new Set(["path-connector", "oversized-letterform", "rule-line"]);

  it("auto-inserts the gesture-required component when it's pure layout shape", () => {
    const lineages = manyLineages("gesture-requires-seed", 15);
    const withRequirement = lineages.find((l) => {
      const req = gestureById(l.gesture).requires;
      return req && AUTO_INSERTABLE.has(req);
    });
    if (!withRequirement) return; // sample didn't roll one this seed — not a failure
    const fill = minimalFill(withRequirement);
    const compiled = compileRecipe(withRequirement, fill);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const required = gestureById(withRequirement.gesture).requires;
    expect(compiled.authored.elements.some((e) => e.component === required)).toBe(true);
  });

  it("refuses to fabricate content for a gesture that requires real copy", () => {
    const lineages = manyLineages("gesture-content-seed", 15);
    const needsContent = lineages.find((l) => {
      const req = gestureById(l.gesture).requires;
      return req && !AUTO_INSERTABLE.has(req);
    });
    if (!needsContent) return; // sample didn't roll one this seed — not a failure
    const fill = { ...minimalFill(needsContent), extras: undefined };
    const compiled = compileRecipe(needsContent, fill);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.errors.join(" ")).toContain("extras");
  });

  it("rejects a photoGround lineage with no groundAsset", () => {
    const lineages = manyLineages("photo-ground-seed", 15);
    const photoLineage = lineages.find((l) => isPhotoGround(l.topology));
    if (!photoLineage) return; // sample didn't roll a photoGround topology this seed
    const fill = minimalFill(photoLineage);
    const withoutAsset = compileRecipe(photoLineage, { ...fill, groundAsset: undefined, extraAssets: [] });
    expect(withoutAsset.ok).toBe(false);
  });
});
