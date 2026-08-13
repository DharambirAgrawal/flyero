import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { fixtureLineages, fixtureSpec } from "../fixtures.js";
import { maskForCoverTest, runGates } from "../../src/core/gates/index.js";
import { ruleCritic } from "../../src/core/critic/index.js";
import { detectBanned } from "../../src/creative/banned.js";
import { solveLayout } from "../../src/core/layout/solver.js";
import { rasterizeForCritique, renderSpec } from "../../src/core/render/index.js";
import { themeFromSpec } from "../../src/core/render/theme.js";
import { contrastRatio, ensureContrast, hueFamily, meetsAA } from "../../src/creative/color.js";
import { COLOR_LOGIC } from "../../src/creative/colorlogic.js";
import { Rng } from "../../src/lib/rng.js";
import type { DesignSpec } from "../../src/core/compose/spec.js";

const ctx = { jobId: null, apiKey: "test", stage: "gates" };

function layoutFor(spec: DesignSpec) {
  return solveLayout(spec, themeFromSpec(spec));
}

describe("colour logic", () => {
  it("always produces AA-legible foreground on background", () => {
    for (const logic of COLOR_LOGIC) {
      for (let i = 0; i < 200; i++) {
        const palette = logic.generate(new Rng(`${logic.id}-${i}`), []);
        expect(meetsAA(palette.fg, palette.bg), `${logic.id} failed at seed ${i}`).toBe(true);
      }
    }
  });

  it("avoids the banned navy-plus-cyan combination", () => {
    let navyCyan = 0;
    for (const logic of COLOR_LOGIC) {
      for (let i = 0; i < 200; i++) {
        const p = logic.generate(new Rng(`${logic.id}-x-${i}`), []);
        const bgFamily = hueFamily(p.bg);
        const accentFamily = hueFamily(p.accent);
        if (
          (bgFamily === "blue" || bgFamily === "cyan") &&
          (accentFamily === "cyan" || accentFamily === "purple")
        ) {
          navyCyan++;
        }
      }
    }
    expect(navyCyan).toBe(0);
  });

  it("ensureContrast reaches AA from any starting pair", () => {
    const rng = new Rng("contrast");
    for (let i = 0; i < 500; i++) {
      const bg = `#${Math.floor(rng.float() * 0xffffff).toString(16).padStart(6, "0")}`;
      const fg = `#${Math.floor(rng.float() * 0xffffff).toString(16).padStart(6, "0")}`;
      const fixed = ensureContrast(fg, bg);
      expect(contrastRatio(fixed, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("banned-list detector", () => {
  const spec = fixtureSpec(fixtureLineages("banned", 1)[0]!);

  it("clears a normally composed flyer", () => {
    const result = detectBanned(spec, layoutFor(spec).boxes);
    expect(result.clear).toBe(true);
  });

  it("flags a decorative structure element nothing registers against", () => {
    const bad: DesignSpec = JSON.parse(JSON.stringify(spec));
    bad.elements.push({
      id: "grid",
      component: "grid-field",
      role: "structure",
      whyHere: "adds visual interest and fills the space",
    });
    bad.relationships = [];
    const result = detectBanned(bad, layoutFor(bad).boxes);
    expect(result.hits.map((h) => h.signal)).toContain("meaningless-structure");
  });

  it("flags three identical cards", () => {
    const bad: DesignSpec = JSON.parse(JSON.stringify(spec));
    bad.elements = [
      bad.elements[0]!,
      bad.elements[1]!,
      { id: "c1", component: "ui-fragment", role: "evidence", whyHere: "one of three features", props: { primary: "A" } },
      { id: "c2", component: "ui-fragment", role: "evidence", whyHere: "one of three features", props: { primary: "B" } },
      { id: "c3", component: "ui-fragment", role: "evidence", whyHere: "one of three features", props: { primary: "C" } },
      bad.elements.find((e) => e.role === "cta")!,
    ];
    bad.relationships = [];
    const result = detectBanned(bad, layoutFor(bad).boxes);
    expect(result.hits.map((h) => h.signal)).toContain("three-equal-cards");
  });

  it("fails only at two or more signals", () => {
    expect(detectBanned(spec, layoutFor(spec).boxes).clear).toBe(true);
  });
});

describe("gates", () => {
  it("passes a well-formed flyer on the code-only checks", async () => {
    for (const lineage of fixtureLineages("gates", 6)) {
      const spec = fixtureSpec(lineage);
      const layout = layoutFor(spec);
      // No png → vision is skipped, so this exercises the mechanical half.
      const result = await runGates({ spec, layout, requestedAssetIds: [] }, ctx);
      expect(result.detail.G3, `${lineage.topology} G3`).toBe(true);
      expect(result.detail.G5, `${lineage.topology} G5`).toBe(true);
      expect(result.detail.G6, `${lineage.topology} G6`).toBe(true);
      expect(result.mechanical.contrast, `${lineage.topology} contrast`).toBe(true);
      expect(result.mechanical.ctaPresent).toBe(true);
      expect(result.mechanical.bannedListClear).toBe(true);
      expect(result.mechanical.overflow, result.notes.join("; ")).toBe(true);
    }
  });

  it("fails G3 when there are too many elements", async () => {
    const spec = fixtureSpec(fixtureLineages("g3", 1)[0]!);
    const bad: DesignSpec = JSON.parse(JSON.stringify(spec));
    bad.elements = [
      ...bad.elements,
      { id: "x1", component: "body-paragraph", role: "support", whyHere: "extra copy block" },
      { id: "x2", component: "rule-line", role: "structure", whyHere: "extra divider line" },
      { id: "x3", component: "benefit-list", role: "support", whyHere: "extra list", props: { items: ["a", "b"] } },
    ];
    const result = await runGates(
      { spec: bad, layout: layoutFor(bad), requestedAssetIds: [] },
      ctx,
    );
    expect(result.detail.G3).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("fails G6 on slogan-shaped copy", async () => {
    const spec = fixtureSpec(fixtureLineages("g6", 1)[0]!);
    const bad: DesignSpec = JSON.parse(JSON.stringify(spec));
    bad.copy.headline = "Unlock seamless innovation";
    const result = await runGates(
      { spec: bad, layout: layoutFor(bad), requestedAssetIds: [] },
      ctx,
    );
    expect(result.detail.G6).toBe(false);
    expect(result.notes.join(" ")).toMatch(/slogan-shaped/);
  });

  it("fails G6 on a statistic that was never supplied", async () => {
    const spec = fixtureSpec(fixtureLineages("g6b", 1)[0]!);
    const bad: DesignSpec = JSON.parse(JSON.stringify(spec));
    bad.copy.body = "Used by 12,000 people to get 3x more callbacks.";
    const result = await runGates(
      { spec: bad, layout: layoutFor(bad), requestedAssetIds: [] },
      ctx,
    );
    expect(result.detail.G6).toBe(false);
  });

  it("fails G6 when the body just restates the headline", async () => {
    const spec = fixtureSpec(fixtureLineages("g6-restate", 1)[0]!);
    const bad: DesignSpec = JSON.parse(JSON.stringify(spec));
    bad.copy.headline = "Fresh Coffee Daily";
    bad.copy.body = "We serve fresh coffee every day, daily.";
    const result = await runGates(
      { spec: bad, layout: layoutFor(bad), requestedAssetIds: [] },
      ctx,
    );
    expect(result.detail.G6).toBe(false);
    expect(result.notes.join(" ")).toMatch(/restates the headline/);
  });

  it("does not fail G6 when the body shares only a word or two with the headline", async () => {
    const spec = fixtureSpec(fixtureLineages("g6-no-restate", 1)[0]!);
    const bad: DesignSpec = JSON.parse(JSON.stringify(spec));
    bad.copy.headline = "Fresh Coffee Daily";
    bad.copy.body = "Beans roasted on-site, ground to order, brewed by hand.";
    const result = await runGates(
      { spec: bad, layout: layoutFor(bad), requestedAssetIds: [] },
      ctx,
    );
    expect(result.detail.G6).toBe(true);
  });

  it("fails G6 on an invented fact placed in a component prop, not just in copy", async () => {
    // Real failure this closes: an invented claim in annotation-label.text
    // ("Sunrise is at 5.40am", never supplied by the user) reached the page
    // untouched, because G6 used to inspect only `copy`.
    const spec = fixtureSpec(fixtureLineages("g6-props", 1)[0]!);
    const bad: DesignSpec = JSON.parse(JSON.stringify(spec));
    const support = bad.elements.find((e) => e.role === "support");
    expect(support, "fixture must carry a support element to attach props to").toBeTruthy();
    support!.props = { ...support!.props, text: "Sunrise is at 5.40am" };
    const result = await runGates(
      { spec: bad, layout: layoutFor(bad), requestedAssetIds: [] },
      ctx,
    );
    expect(result.detail.G6).toBe(false);
    expect(result.notes.join(" ")).toMatch(/component prop/);
  });

  it("blocks passed on a reported collision instead of only logging it", async () => {
    // Real failure this closes: the review endpoint accepted a verdict
    // listing collisions and still returned status: done — a collision is a
    // defect the reviewer has *seen*, not a note to file away.
    const spec = fixtureSpec(fixtureLineages("g-collision", 1)[0]!);
    const verdict = {
      ideaReads: true,
      ideaAsSeen: spec.idea,
      productGuessable: true,
      productGuess: "the product",
      headlineParticipates: true,
      copyReadsHuman: true,
      collisions: ["the CTA button overlaps the headline's last line"],
    };
    const result = await runGates(
      { spec, layout: layoutFor(spec), requestedAssetIds: [], verdict },
      ctx,
    );
    expect(result.mechanical.noCollisions).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.notes.join(" ")).toContain("collision: the CTA button overlaps");
  });

  it("allows a supplied proof figure and rejects an unsupported detail", async () => {
    const spec = fixtureSpec(fixtureLineages("g6-provenance", 1)[0]!);
    const sourced: DesignSpec = JSON.parse(JSON.stringify(spec));
    sourced.provenance.userStatements = ["Customers reported 3x more callbacks."];
    sourced.copy.body = "Customers reported 3x more callbacks.";
    let result = await runGates(
      { spec: sourced, layout: layoutFor(sourced), requestedAssetIds: [] },
      ctx,
    );
    expect(result.detail.G6).toBe(true);

    sourced.copy.details = [{ label: "Where", value: "123 Anywhere Street" }];
    result = await runGates(
      { spec: sourced, layout: layoutFor(sourced), requestedAssetIds: [] },
      ctx,
    );
    expect(result.detail.G6).toBe(false);
    expect(result.notes.join(" ")).toContain("absent from user statements");
  });

  it("fails the coverage floor on a sparse composition, even with every other check clean", async () => {
    const spec = fixtureSpec(fixtureLineages("coverage-floor", 1)[0]!);
    const sparse: DesignSpec = JSON.parse(JSON.stringify(spec));
    // Headline, CTA and brand only — the shape of a real regression this gate
    // exists to catch: nothing else here objects to an empty-looking page.
    sparse.elements = sparse.elements.filter((e) =>
      ["message", "cta", "brand"].includes(e.role),
    );
    const result = await runGates(
      { spec: sparse, layout: layoutFor(sparse), requestedAssetIds: [] },
      ctx,
    );
    expect(result.mechanical.coverage).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.notes.join(" ")).toMatch(/coverage:.*empty page/);
  });

  it("physically masks headline and brand pixels for the Cover Test", async () => {
    const spec = fixtureSpec(fixtureLineages("g2-mask", 1)[0]!);
    const render = renderSpec(spec);
    const png = rasterizeForCritique(render.svg);
    const masked = await maskForCoverTest(spec, render.layout, png);
    const metadata = await sharp(masked).metadata();
    const headline = render.layout.boxes.headline!;
    const x = Math.round((headline.x + headline.w / 2) * (metadata.width! / spec.canvas.w));
    const y = Math.round((headline.y + headline.h / 2) * (metadata.height! / spec.canvas.h));
    const pixel = await sharp(masked).extract({ left: x, top: y, width: 1, height: 1 }).raw().toBuffer();
    expect([...pixel.slice(0, 3)]).toEqual([120, 120, 120]);
  });

  it("reports unused assets rather than dropping them silently", async () => {
    const spec = fixtureSpec(fixtureLineages("assets", 1)[0]!);
    const result = await runGates(
      { spec, layout: layoutFor(spec), requestedAssetIds: ["ast_unused"] },
      ctx,
    );
    expect(result.unusedAssets).toEqual(["ast_unused"]);
    expect(result.notes.join(" ")).toContain("ast_unused");
  });

  it("never reports passed:true while any gate is false", async () => {
    for (const lineage of fixtureLineages("invariant", 6)) {
      const spec = fixtureSpec(lineage);
      const result = await runGates(
        { spec, layout: layoutFor(spec), requestedAssetIds: [] },
        ctx,
      );
      if (result.passed) {
        expect(Object.values(result.detail).every(Boolean)).toBe(true);
        expect(Object.values(result.mechanical).every(Boolean)).toBe(true);
      }
    }
  });
});

describe("rule critic", () => {
  it("stays quiet on a clean flyer", () => {
    const spec = fixtureSpec(fixtureLineages("critic", 1)[0]!);
    const fixes = ruleCritic(spec, layoutFor(spec));
    expect(fixes.filter((f) => f.severity === "high")).toEqual([]);
  });

  it("demands deletion of an unjustified element", () => {
    const spec = fixtureSpec(fixtureLineages("critic2", 1)[0]!);
    const bad: DesignSpec = JSON.parse(JSON.stringify(spec));
    bad.elements[0]!.whyHere = "x";
    const fixes = ruleCritic(bad, layoutFor(bad));
    expect(fixes.some((f) => f.action.includes("delete this element"))).toBe(true);
  });
});

describe("banned list — the generated-design clichés", () => {
  /**
   * These three palettes are named in Anthropic's official `frontend-design`
   * skill as the looks current AI design keeps landing on "regardless of
   * subject". They are imported expertise, not our own taxonomy — a detector we
   * reasoned our way to would only re-encode our own habits.
   */
  const base = fixtureSpec(fixtureLineages("BANNED-1", 1)[0]!);
  const boxes = solveLayout(base, themeFromSpec(base)).boxes;
  const signalsFor = (bg: string, fg: string, accent: string): string[] => {
    const spec = { ...base, brand: { ...base.brand, colors: { ...base.brand.colors, bg, fg, accent } } };
    return detectBanned(spec as typeof base, boxes).hits.map((h) => h.signal);
  };

  it("catches warm cream with a terracotta accent", () => {
    expect(signalsFor("#F4F1EA", "#1a1a1a", "#C4643C")).toContain("cream-serif-terracotta");
  });

  it("catches near-black with a single acid accent", () => {
    expect(signalsFor("#0B0B0C", "#f5f5f5", "#39FF6A")).toContain("black-acid-accent");
    expect(signalsFor("#0B0B0C", "#f5f5f5", "#FF3B18")).toContain("black-acid-accent");
  });

  it("leaves ordinary palettes alone", () => {
    expect(signalsFor("#f4f4f4", "#232323", "#10901c")).not.toContain("cream-serif-terracotta");
    expect(signalsFor("#ffffff", "#111111", "#2b4d8c")).toHaveLength(0);
  });

  it("never fails a sampled flyer on a palette signal alone", () => {
    // One cliché is a legitimate choice for some briefs; two is a pattern.
    // If this starts failing, the thresholds have become punitive.
    for (const lineage of fixtureLineages("BANNED-2", 60)) {
      const spec = fixtureSpec(lineage);
      const result = detectBanned(spec, solveLayout(spec, themeFromSpec(spec)).boxes);
      expect(result.clear, `${lineage.colorLogic}/${lineage.material}: ${result.hits.map((h) => h.signal).join(", ")}`).toBe(true);
    }
  });
});

describe("gates see the painted ground, not just the page colour", () => {
  const spec = fixtureSpec(fixtureLineages("GROUND-1", 1)[0]!);
  const boxes = solveLayout(spec, themeFromSpec(spec)).boxes;

  it("catches a navy gradient wash that the flat background hides", () => {
    // brand.colors.bg stays innocent; the navy only exists in the gradient.
    const innocent = { ...spec, brand: { ...spec.brand, colors: { ...spec.brand.colors, bg: "#f4f4f4", accent: "#22d3ee" } } };
    const withoutGround = detectBanned(innocent as typeof spec, boxes);
    expect(withoutGround.hits.map((h) => h.signal)).not.toContain("navy-cyan-glow");

    const withGround = detectBanned(innocent as typeof spec, boxes, {
      base: "#f4f4f4",
      regions: [],
      gradient: { from: "#101f4d", to: "#f4f4f4" },
    });
    expect(withGround.hits.map((h) => h.signal)).toContain("navy-cyan-glow");
  });

  it("catches a navy colour block painted over a light page", () => {
    const innocent = { ...spec, brand: { ...spec.brand, colors: { ...spec.brand.colors, bg: "#ffffff", accent: "#7c3aed" } } };
    const result = detectBanned(innocent as typeof spec, boxes, {
      base: "#ffffff",
      regions: [{ fill: "#16224f" }],
      gradient: null,
    });
    expect(result.hits.map((h) => h.signal)).toContain("navy-cyan-glow");
  });
});

describe("QR codes stay scannable", () => {
  it("never draws modules in the theme ink", () => {
    // On a photographic ground inkFor() returns white, and the backing used to
    // be the light page colour — white modules on a white plate. The code was
    // unscannable and rendered as a blank square, and no gate could see it
    // because contrast is only ever checked for text.
    const spec = fixtureSpec(fixtureLineages("QR-1", 1)[0]!);
    for (const el of spec.elements) {
      if (el.role === "cta") spec.copy.cta = { ...spec.copy.cta, qr: true, url: "https://example.org" };
    }
    const { svg } = renderSpec(spec);
    const qrGroup = svg.match(/<g id="[^"]*-qr"[\s\S]*?<\/g>/)?.[0];
    expect(qrGroup, "the flyer should carry a QR group").toBeTruthy();
    // A fixed dark-on-light pair, whatever the theme is doing.
    expect(qrGroup).toContain('fill="#ffffff"');
    expect(qrGroup).toContain('fill="#111111"');
  });
});
