import { describe, it, expect } from "vitest";
import { arcGuideId } from "../../src/components/shapes.js";
import { createHash } from "node:crypto";
import { fixtureLineages, fixtureSpec } from "../fixtures.js";
import { renderSpec, rasterize } from "../../src/core/render/index.js";
import { checkEditability } from "../../src/core/export/index.js";

/**
 * The determinism guarantee (AGENTS.md law 3): same spec + seed → identical
 * bytes. Everything downstream — revision, export, future formats — depends on
 * this holding, so these tests must never be weakened or skipped.
 */

const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

describe("deterministic rendering", () => {
  const specs = fixtureLineages("golden-seed", 6).map(fixtureSpec);

  it("produces byte-identical SVG on five consecutive runs", () => {
    for (const spec of specs) {
      const hashes = new Set<string>();
      for (let i = 0; i < 5; i++) hashes.add(sha(renderSpec(spec).svg));
      expect(hashes.size, `${spec.lineage.topology} SVG drifted across runs`).toBe(1);
    }
  });

  it("produces byte-identical PNG on five consecutive runs", () => {
    // Milestone 0's definition of done, verbatim.
    const spec = specs[0]!;
    const svg = renderSpec(spec).svg;
    const hashes = new Set<string>();
    for (let i = 0; i < 5; i++) hashes.add(sha(rasterize(svg, 1)));
    expect(hashes.size).toBe(1);
  });

  it("gives different lineages different output", () => {
    const hashes = specs.map((s) => sha(renderSpec(s).svg));
    expect(new Set(hashes).size).toBe(specs.length);
  });

  it("re-renders identically from a round-tripped spec", () => {
    // A spec that survives JSON storage must render the same, or stored
    // revisions would not reproduce.
    for (const spec of specs) {
      const revived = JSON.parse(JSON.stringify(spec));
      expect(sha(renderSpec(revived).svg)).toBe(sha(renderSpec(spec).svg));
    }
  });
});

describe("SVG editability", () => {
  const specs = fixtureLineages("editable-seed", 5).map(fixtureSpec);

  it("keeps text as text and names every group", () => {
    for (const spec of specs) {
      const { svg } = renderSpec(spec);
      const report = checkEditability(svg);
      expect(report.problems).toEqual([]);
      expect(report.editable).toBe(true);
      expect(report.textNodes).toBeGreaterThan(0);
      expect(report.namedGroups).toBeGreaterThan(0);
    }
  });

  it("never outlines or rasterizes copy", () => {
    for (const spec of specs) {
      const { svg } = renderSpec(spec);
      // The headline's actual words must be present as selectable text.
      const firstWord = spec.copy.headline.split(" ")[0]!;
      expect(svg).toContain(firstWord);
      expect(svg).not.toMatch(/<foreignObject/);
    }
  });

  it("embeds nothing that needs the network", () => {
    for (const spec of specs) {
      const { svg } = renderSpec(spec);
      expect(svg).not.toMatch(/href="https?:/);
    }
  });

  it("is a single self-contained document", () => {
    const { svg } = renderSpec(specs[0]!);
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 1080 1350"');
  });

  it("an arched headline still exports as editable SVG", () => {
    // checkEditability rejects any <path> whose id mentions headline/copy/text/
    // label, and the guide path an arched headline is set along belongs to an
    // element usually called exactly "headline". arcGuideId() substitutes those
    // words; without it every arched flyer would fail to export.
    expect(arcGuideId("headline")).not.toMatch(/headline/i);
    expect(arcGuideId("body-copy")).not.toMatch(/copy/i);
    expect(arcGuideId("headline")).not.toBe(arcGuideId("hl"));

    const spec = fixtureSpec(fixtureLineages("ARCH-1", 1)[0]!);
    for (const el of spec.elements) {
      if (el.component === "headline-block") {
        el.props = { ...(el.props ?? {}), treatment: "arch" };
      }
    }
    const { svg } = renderSpec(spec);
    expect(svg).toContain("arcguide-");
    expect(checkEditability(svg).problems).toEqual([]);
  });
});
