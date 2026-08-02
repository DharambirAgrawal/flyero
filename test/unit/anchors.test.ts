import { describe, expect, it } from "vitest";
import { GAPS, SIZES, resolveParts, type PartInput } from "../../src/core/layout/anchors.js";
import { COMPONENTS, getComponent } from "../../src/components/registry.js";

/**
 * Relational placement (docs/ENGINE.md).
 *
 * The engine's claim is that an agent can say "the balloon goes top-right of
 * the sun" and never touch a coordinate. These tests pin the two halves of that
 * claim: the arithmetic is right, and the relationship is *actually* relational
 * — it still holds when everything around it moves.
 */

const BOX = { x: 100, y: 200, w: 600, h: 600 };

function part(over: Partial<PartInput> & Pick<PartInput, "id" | "at">): PartInput {
  return { aspect: 1, size: "medium", ...over };
}

describe("placing against the figure itself", () => {
  it("tucks a corner part into that corner rather than hanging it off the edge", () => {
    // The naive implementation centres the part on the anchor point, which puts
    // half of it outside the figure. A "top-right" sticker belongs *in* the
    // top-right, not straddling the corner.
    const [tr] = resolveParts([part({ id: "a", at: { at: "top-right" } })], BOX);
    expect(tr!.x + tr!.w).toBeCloseTo(BOX.x + BOX.w, 5);
    expect(tr!.y).toBeCloseTo(BOX.y, 5);

    const [bl] = resolveParts([part({ id: "a", at: { at: "bottom-left" } })], BOX);
    expect(bl!.x).toBeCloseTo(BOX.x, 5);
    expect(bl!.y + bl!.h).toBeCloseTo(BOX.y + BOX.h, 5);
  });

  it("centres a centre part", () => {
    const [c] = resolveParts([part({ id: "a", at: { at: "center" } })], BOX);
    expect(c!.x + c!.w / 2).toBeCloseTo(BOX.x + BOX.w / 2, 5);
    expect(c!.y + c!.h / 2).toBeCloseTo(BOX.y + BOX.h / 2, 5);
  });

  it("orders sizes and keeps the named size as the longest edge", () => {
    const sizes = (["tiny", "small", "medium", "large", "huge"] as const).map(
      (size) => resolveParts([part({ id: "a", size, at: { at: "center" } })], BOX)[0]!,
    );
    for (let i = 0; i < sizes.length - 1; i++) {
      expect(sizes[i]!.w).toBeLessThan(sizes[i + 1]!.w);
    }
    // A wide part and a tall part at the same named size read as equally
    // prominent — otherwise "medium" means something different per shape.
    const wide = resolveParts([part({ id: "a", aspect: 4, at: { at: "center" } })], BOX)[0]!;
    const tall = resolveParts([part({ id: "a", aspect: 0.25, at: { at: "center" } })], BOX)[0]!;
    expect(Math.max(wide.w, wide.h)).toBeCloseTo(Math.max(tall.w, tall.h), 5);
  });
});

describe("placing against another part", () => {
  it("puts a part above, below, left and right of its target", () => {
    const base = part({ id: "sun", size: "large", at: { at: "center" } });
    const sun = resolveParts([base], BOX)[0]!;

    const above = resolveParts(
      [base, part({ id: "b", size: "tiny", at: { of: "sun", side: "above", gap: "near" } })],
      BOX,
    ).find((p) => p.id === "b")!;
    expect(above.y + above.h).toBeLessThanOrEqual(sun.y + 0.001);

    const right = resolveParts(
      [base, part({ id: "b", size: "tiny", at: { of: "sun", side: "right-of", gap: "near" } })],
      BOX,
    ).find((p) => p.id === "b")!;
    expect(right.x).toBeGreaterThanOrEqual(sun.x + sun.w - 0.001);
  });

  it("honours the named gap", () => {
    const base = part({ id: "sun", size: "small", at: { at: "left" } });
    const gapFor = (gap: "touching" | "tight" | "near" | "far") => {
      const placed = resolveParts(
        [base, part({ id: "b", size: "tiny", at: { of: "sun", side: "right-of", gap } })],
        BOX,
      );
      const sun = placed.find((p) => p.id === "sun")!;
      const b = placed.find((p) => p.id === "b")!;
      return b.x - (sun.x + sun.w);
    };
    expect(gapFor("touching")).toBeCloseTo(0, 5);
    expect(gapFor("tight")).toBeLessThan(gapFor("near"));
    expect(gapFor("near")).toBeLessThan(gapFor("far"));
  });

  it("straddles the corner for a diagonal side", () => {
    // "top-right-of" should read as attached to that corner — a sticker on a
    // photo — not as a separate object clearing it entirely.
    const base = part({ id: "card", size: "large", at: { at: "center" } });
    const placed = resolveParts(
      [base, part({ id: "badge", size: "tiny", at: { of: "card", side: "top-right-of" } })],
      BOX,
    );
    const card = placed.find((p) => p.id === "card")!;
    const badge = placed.find((p) => p.id === "badge")!;
    expect(badge.x).toBeGreaterThan(card.x + card.w / 2);
    expect(badge.y).toBeLessThan(card.y + card.h / 2);
    // Overlapping the corner, not floating away from it.
    expect(badge.x).toBeLessThan(card.x + card.w);
  });

  it("resolves a chain declared out of order", () => {
    // Authors write in the order they think, not in dependency order.
    const placed = resolveParts(
      [
        part({ id: "c", size: "tiny", at: { of: "b", side: "right-of" } }),
        part({ id: "b", size: "tiny", at: { of: "a", side: "right-of" } }),
        part({ id: "a", size: "tiny", at: { at: "left" } }),
      ],
      BOX,
    );
    const [a, b, c] = ["a", "b", "c"].map((id) => placed.find((p) => p.id === id)!);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(c.x);
  });

  it("refuses a cycle instead of quietly ignoring half the intent", () => {
    // A silently-broken cycle renders as a plausible layout that dropped what
    // was asked for — the failure nobody notices and everybody sees.
    expect(() =>
      resolveParts(
        [
          part({ id: "a", at: { of: "b", side: "right-of" } }),
          part({ id: "b", at: { of: "a", side: "right-of" } }),
        ],
        BOX,
      ),
    ).toThrow(/cycle/i);
  });

  it("names the missing part when a reference does not exist", () => {
    expect(() => resolveParts([part({ id: "a", at: { of: "ghost", side: "above" } })], BOX)).toThrow(
      /ghost/,
    );
  });
});

describe("the relationship is the point", () => {
  it("survives the figure moving, growing and changing shape", () => {
    // This is the whole justification for relational placement over
    // coordinates. "Top-right of the sun, near" stays true when the box moves;
    // an x/y was true once, for one layout, and is a guess everywhere else.
    const parts = [
      part({ id: "sun", size: "large", at: { at: "center" } }),
      part({ id: "bird", size: "tiny", at: { of: "sun", side: "top-right-of", gap: "near" } }),
    ];

    for (const box of [
      { x: 0, y: 0, w: 400, h: 400 },
      { x: 640, y: 90, w: 380, h: 900 },
      { x: 100, y: 200, w: 900, h: 300 },
    ]) {
      const placed = resolveParts(parts, box);
      const sun = placed.find((p) => p.id === "sun")!;
      const bird = placed.find((p) => p.id === "bird")!;
      expect(bird.x + bird.w / 2, `box ${box.w}x${box.h}`).toBeGreaterThan(sun.x + sun.w / 2);
      expect(bird.y + bird.h / 2, `box ${box.w}x${box.h}`).toBeLessThan(sun.y + sun.h / 2);
    }
  });

  it("keeps every part within reach of the figure", () => {
    // A long chain of "right-of" would otherwise walk off the canvas and
    // collide with type the solver has already committed to.
    const chain: PartInput[] = [part({ id: "p0", size: "medium", at: { at: "left" } })];
    for (let i = 1; i < 8; i++) {
      chain.push(
        part({ id: `p${i}`, size: "medium", at: { of: `p${i - 1}`, side: "right-of", gap: "far" } }),
      );
    }
    for (const p of resolveParts(chain, BOX)) {
      expect(p.x, p.id).toBeGreaterThan(BOX.x - BOX.w);
      expect(p.x, p.id).toBeLessThan(BOX.x + BOX.w * 1.5);
    }
  });

  it("stacks behind, with and front in that order", () => {
    const placed = resolveParts(
      [
        part({ id: "front", layer: "front", at: { at: "center" } }),
        part({ id: "back", layer: "behind", at: { at: "center" } }),
        part({ id: "mid", at: { at: "center" } }),
      ],
      BOX,
    );
    expect(placed.map((p) => p.id)).toEqual(["back", "mid", "front"]);
  });

  it("is deterministic", () => {
    const parts = [
      part({ id: "a", at: { at: "top-left" } }),
      part({ id: "b", at: { of: "a", side: "below", gap: "far" } }),
    ];
    const first = JSON.stringify(resolveParts(parts, BOX));
    for (let i = 0; i < 5; i++) expect(JSON.stringify(resolveParts(parts, BOX))).toBe(first);
  });

  it("exposes no way to state a coordinate", () => {
    // AGENTS.md law 1. If a numeric escape hatch ever appears on Anchor, an
    // agent will find it and the engine stops being the thing that places.
    const anchorKeys = new Set(["at", "of", "side", "gap"]);
    const sample: PartInput["at"][] = [{ at: "top" }, { of: "a", side: "above", gap: "near" }];
    for (const anchor of sample) {
      for (const [key, value] of Object.entries(anchor)) {
        expect(anchorKeys.has(key)).toBe(true);
        expect(typeof value).toBe("string");
      }
    }
    expect(Object.values(SIZES).every((v) => v > 0 && v < 1)).toBe(true);
    expect(GAPS.touching).toBe(0);
  });
});

describe("the library describes itself", () => {
  it("gives every component a LOOKS LIKE line", () => {
    // The regression this guards is not hypothetical. For a long stretch only
    // the seven photo components carried a `visual`, so those were the only
    // ones an agent could picture — and every flyer came back built from the
    // same two or three while twenty-eight sat unreachable in the registry.
    // A component nobody can picture is a component nobody will ever choose.
    for (const c of COMPONENTS) {
      const v = c.manifest.visual;
      expect(v, `${c.manifest.id} has no visual`).toBeDefined();
      expect(v!.reads.length, `${c.manifest.id} reads too short`).toBeGreaterThan(30);
      expect(v!.aspect).toBeGreaterThan(0);
    }
  });

  it("offers a component for one-off arrangements", () => {
    const figure = getComponent("composed-figure");
    expect(figure.manifest.roles).toContain("evidence");
    // Density without clutter: one element, many marks.
    const parsed = figure.props.safeParse({
      parts: [
        { id: "sun", draw: { kind: "shape", form: "circle" }, size: "large", at: { at: "center" } },
        {
          id: "bird",
          draw: { kind: "motif", motif: "plane" },
          size: "tiny",
          at: { of: "sun", side: "top-right-of" },
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a motif that does not exist rather than rendering a blank patch", () => {
    const figure = getComponent("composed-figure");
    const parsed = figure.props.safeParse({
      parts: [
        { id: "x", draw: { kind: "motif", motif: "unicorn" }, size: "small", at: { at: "top" } },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
