import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Rng } from "../../src/lib/rng.js";
import {
  DIRECTIONAL_MOTIFS,
  MOTIFS,
  MOTIF_NAMES,
  MOTIF_TONES,
  arcBands,
  arcPath,
  arcTextPath,
  archPath,
  blobPath,
  burstPath,
  checkerRects,
  checkerTile,
  dashedRoutePath,
  ellipsePath,
  gridTile,
  halftoneTile,
  loadMotifData,
  motifTransform,
  polygonPath,
  polyline,
  ribbonPath,
  roundedRectPath,
  routeMidpoint,
  searchMotifs,
  sparklePath,
  squigglePath,
  starPath,
  stripeRects,
  stripeTile,
  tornEdgePath,
  wavePath,
} from "../../src/components/shapes.js";

/** Only path commands and numbers — no NaN, no scientific notation, no junk. */
const PATH_CHARS = /^[MLCQZAHVmlcqzahv0-9 .,-]+$/;

/** Every generator that needs no RNG, with arguments that exercise it. */
const DETERMINISTIC: Record<string, () => string> = {
  ellipsePath: () => ellipsePath(200, 300, 120, 80),
  wavePath: () => wavePath(0, 400, 900, 30, 160),
  squigglePath: () => squigglePath(40, 500, 320, 8),
  starPath: () => starPath(400, 400, 90, 38, 5),
  sparklePath: () => sparklePath(250, 250, 44),
  burstPath: () => burstPath(300, 300, 110, 74, 14),
  arcPath: () => arcPath(500, 500, 220, 0, Math.PI),
  arcTextPathUp: () => arcTextPath(540, 300, 380, { direction: "up" }),
  arcTextPathDown: () => arcTextPath(540, 300, 380, { direction: "down" }),
  polygonPath: () => polygonPath(300, 300, 100, 6),
  ribbonPath: () => ribbonPath(60, 700, 500, 90),
  dashedRoutePath: () => dashedRoutePath({ x: 100, y: 200 }, { x: 800, y: 620 }),
  roundedRectPath: () => roundedRectPath({ x: 10, y: 20, w: 400, h: 260 }, 32),
  archPath: () => archPath({ x: 120, y: 90, w: 360, h: 520 }),
  polyline: () => polyline([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }], true),
};

/** Pulls every numeric literal out of a path string. */
function numbersIn(d: string): number[] {
  return (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
}

describe("shapes — path validity", () => {
  it.each(Object.keys(DETERMINISTIC))("%s emits a well-formed path", (name) => {
    const d = DETERMINISTIC[name]!();
    expect(d).toMatch(PATH_CHARS);
    expect(d.length).toBeGreaterThan(0);
    expect(numbersIn(d).every(Number.isFinite)).toBe(true);
  });

  it("seeded generators emit well-formed paths too", () => {
    const blob = blobPath(400, 400, 200, 160, new Rng("blob"));
    const torn = tornEdgePath({ x: 0, y: 0, w: 600, h: 400 }, "bottom", new Rng("torn"));
    for (const d of [blob, torn]) {
      expect(d).toMatch(PATH_CHARS);
      expect(numbersIn(d).every(Number.isFinite)).toBe(true);
    }
  });

  it("never emits more than two decimal places", () => {
    // Unrounded floats give unreadable golden diffs and leak platform-dependent
    // tails like 95.20000000000005, which is what broke a layout tie earlier.
    const all = [
      ...Object.values(DETERMINISTIC).map((fn) => fn()),
      blobPath(400, 400, 200, 160, new Rng("blob")),
      tornEdgePath({ x: 0, y: 0, w: 600, h: 400 }, "top", new Rng("torn")),
      ...arcBands(300, 300, 240, 4).map((b) => b.d),
      checkerTile(24).d,
      stripeTile(18, 12).d,
      halftoneTile(20, 6).d,
      gridTile(40, 2).d,
      MOTIFS.sun.d,
    ];
    for (const d of all) {
      expect(d).not.toMatch(/\.\d{3,}/);
    }
  });

  it("closed forms end in Z", () => {
    const closed = [
      blobPath(300, 300, 100, 100, new Rng("s")),
      ellipsePath(100, 100, 50, 50),
      starPath(100, 100, 50, 20),
      burstPath(100, 100, 50, 34),
      sparklePath(100, 100, 40),
      polygonPath(100, 100, 50, 5),
      ribbonPath(0, 0, 200, 60),
      roundedRectPath({ x: 0, y: 0, w: 100, h: 80 }, 10),
      archPath({ x: 0, y: 0, w: 200, h: 300 }),
      tornEdgePath({ x: 0, y: 0, w: 200, h: 200 }, "right", new Rng("s")),
    ];
    for (const d of closed) expect(d.trim().endsWith("Z")).toBe(true);
  });

  it("open forms do not close", () => {
    expect(arcPath(100, 100, 50, 0, 1).includes("Z")).toBe(false);
    expect(wavePath(0, 0, 200, 10, 50).includes("Z")).toBe(false);
    expect(dashedRoutePath({ x: 0, y: 0 }, { x: 100, y: 100 }).includes("Z")).toBe(false);
  });
});

describe("shapes — determinism", () => {
  it("seeded generators repeat exactly for the same seed", () => {
    // Five runs, because a single repeat would not catch a module-level counter.
    for (let i = 0; i < 5; i++) {
      expect(blobPath(400, 400, 200, 160, new Rng("orchid-7"))).toBe(
        blobPath(400, 400, 200, 160, new Rng("orchid-7")),
      );
      expect(tornEdgePath({ x: 0, y: 0, w: 500, h: 300 }, "top", new Rng("paper"))).toBe(
        tornEdgePath({ x: 0, y: 0, w: 500, h: 300 }, "top", new Rng("paper")),
      );
    }
  });

  it("different seeds give different geometry", () => {
    expect(blobPath(400, 400, 200, 160, new Rng("a"))).not.toBe(
      blobPath(400, 400, 200, 160, new Rng("b")),
    );
  });

  it("unseeded generators are pure", () => {
    for (const [name, fn] of Object.entries(DETERMINISTIC)) {
      expect(fn(), name).toBe(fn());
    }
  });
});

describe("shapes — geometry", () => {
  it("blob vertices stay inside the requested radii", () => {
    const d = blobPath(500, 400, 200, 150, new Rng("bounds"));
    const nums = numbersIn(d);
    for (let i = 0; i < nums.length; i += 2) {
      // Catmull-Rom control points overshoot the hull slightly; allow for it.
      expect(Math.abs(nums[i]! - 500)).toBeLessThanOrEqual(200 * 1.35);
      expect(Math.abs(nums[i + 1]! - 400)).toBeLessThanOrEqual(150 * 1.35);
    }
  });

  it("wobble 0 gives a shape that hugs the ellipse", () => {
    const d = blobPath(300, 300, 100, 100, new Rng("x"), { wobble: 0 });
    const nums = numbersIn(d);
    for (let i = 0; i < nums.length; i += 2) {
      const r = Math.hypot(nums[i]! - 300, nums[i + 1]! - 300);
      expect(r).toBeGreaterThan(90);
      expect(r).toBeLessThan(115);
    }
  });

  it("polygonPath rejects degenerate side counts", () => {
    expect(() => polygonPath(0, 0, 10, 2)).toThrow();
  });

  it("routeMidpoint lands on the curve it describes", () => {
    const from = { x: 100, y: 500 };
    const to = { x: 700, y: 300 };
    const mid = routeMidpoint(from, to, 0.3);
    // The bow lifts the midpoint off the straight chord, which is the point.
    const chordMid = { x: 400, y: 400 };
    expect(Math.hypot(mid.x - chordMid.x, mid.y - chordMid.y)).toBeGreaterThan(20);
    expect(Number.isFinite(mid.angle)).toBe(true);
  });

  it("bow sign flips which side the route bulges toward", () => {
    const a = routeMidpoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.3);
    const b = routeMidpoint({ x: 0, y: 0 }, { x: 100, y: 0 }, -0.3);
    expect(Math.sign(a.y)).toBe(-Math.sign(b.y));
  });

  it("arcTextPath up and down curve opposite ways", () => {
    expect(arcTextPath(500, 300, 400, { direction: "up" })).not.toBe(
      arcTextPath(500, 300, 400, { direction: "down" }),
    );
  });

  it("checkerRects covers alternating cells and never leaves the rect", () => {
    const rect = { x: 10, y: 20, w: 100, h: 100 };
    const cells = checkerRects(rect, 25);
    expect(cells.length).toBe(8);
    for (const c of cells) {
      expect(c.x).toBeGreaterThanOrEqual(rect.x);
      expect(c.y).toBeGreaterThanOrEqual(rect.y);
      expect(c.x + c.w).toBeLessThanOrEqual(rect.x + rect.w + 0.01);
      expect(c.y + c.h).toBeLessThanOrEqual(rect.y + rect.h + 0.01);
    }
  });

  it("stripeRects stays inside the rect", () => {
    const rect = { x: 0, y: 0, w: 100, h: 50 };
    for (const s of stripeRects(rect, 8, 6)) {
      expect(s.x + s.w).toBeLessThanOrEqual(100.01);
      expect(s.h).toBe(50);
    }
  });

  it("stripeRects with a non-positive pitch yields nothing rather than hanging", () => {
    expect(stripeRects({ x: 0, y: 0, w: 100, h: 50 }, 0, 0)).toEqual([]);
  });

  it("arcBands returns radii descending from the outside in", () => {
    const bands = arcBands(300, 300, 200, 4);
    expect(bands).toHaveLength(4);
    const radii = bands.map((b) => b.radius);
    expect(radii).toEqual([...radii].sort((a, b) => b - a));
  });

  it("roundedRectPath clamps an over-large radius instead of inverting", () => {
    const d = roundedRectPath({ x: 0, y: 0, w: 40, h: 20 }, 999);
    expect(d).toMatch(PATH_CHARS);
    expect(numbersIn(d).every(Number.isFinite)).toBe(true);
  });

  it("tornEdgePath tears only the named edge", () => {
    const rect = { x: 0, y: 0, w: 400, h: 300 };
    const d = tornEdgePath(rect, "top", new Rng("t"), { amplitude: 10, teeth: 8 });
    const nums = numbersIn(d);
    const ys: number[] = [];
    for (let i = 1; i < nums.length; i += 2) ys.push(nums[i]!);
    // The straight bottom must be exactly at h; the torn top must vary.
    expect(ys.filter((y) => y === 300).length).toBeGreaterThanOrEqual(2);
    expect(new Set(ys.filter((y) => y < 50)).size).toBeGreaterThan(1);
  });
});

describe("motifs", () => {
  it("every motif is a well-formed path", () => {
    for (const name of MOTIF_NAMES) {
      const motif = MOTIFS[name];
      expect(motif.d, name).toMatch(PATH_CHARS);
      // A filled motif with an open last subpath would leak a straight seam
      // across its interior. A `stroke` motif has no fill to leak — it's
      // line art, and open strokes (a candle, a bow's tail) are the point.
      if (!motif.stroke) {
        expect(motif.d.trim().endsWith("Z"), name).toBe(true);
      }
      expect(numbersIn(motif.d).every(Number.isFinite), name).toBe(true);
    }
  });

  it("motifs are drawn roughly inside their 0–100 box", () => {
    for (const name of MOTIF_NAMES) {
      for (const value of numbersIn(MOTIFS[name].d)) {
        // A couple of units of overshoot is fine — these are optical shapes,
        // not engineering drawings — but a stray 400 means a typo.
        expect(value, `${name} has an out-of-box coordinate ${value}`).toBeGreaterThanOrEqual(-5);
        expect(value, `${name} has an out-of-box coordinate ${value}`).toBeLessThanOrEqual(105);
      }
    }
  });

  it("motifs with punched holes declare evenodd", () => {
    // Without the fill rule the pin has no hole and the camera has no lens.
    expect(MOTIFS.pin.fillRule).toBe("evenodd");
    expect(MOTIFS.camera.fillRule).toBe("evenodd");
  });

  it("the travel set is present", () => {
    for (const name of ["plane", "pin", "suitcase", "camera", "mountain", "sun", "cloud", "leaf", "arrow"]) {
      expect(MOTIF_NAMES).toContain(name);
    }
  });

  it("directional motifs all point along +x", () => {
    // Aiming works by rotating to a bearing, which only composes if every
    // directional mark shares a zero. A plane drawn nosing up-right silently
    // flies 45° off whatever route it is placed on.
    for (const name of DIRECTIONAL_MOTIFS) {
      const nums = numbersIn(MOTIFS[name].d);
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < nums.length; i += 2) pts.push({ x: nums[i]!, y: nums[i + 1]! });
      const tip = pts.reduce((a, b) => (b.x > a.x ? b : a));
      expect(tip.x, `${name} tip should be at the right edge`).toBeGreaterThan(90);
      expect(Math.abs(tip.y - 50), `${name} tip should be vertically centred`).toBeLessThan(12);
    }
  });

  it("motifTransform scales from the 0–100 box to the requested size", () => {
    expect(motifTransform(100, 200, 50)).toBe("translate(100 200) scale(0.5)");
    expect(motifTransform(0, 0, 200, 45)).toContain("rotate(45 100 100)");
  });

  it("every motif carries a description and a category", () => {
    // The whole point of moving motifs to a folder of SVGs was to stop
    // agents (and people) guessing what a motif looks like from its id — a
    // motif with no <title> defeats that, silently, for every future author.
    for (const name of MOTIF_NAMES) {
      expect(MOTIFS[name].title, `${name} has no <title>`).toBeTruthy();
      expect(MOTIFS[name].title!.length, `${name} title is too short`).toBeGreaterThan(12);
      expect(MOTIFS[name].desc, `${name} has no <desc>`).toBeTruthy();
      expect(MOTIFS[name].desc!.length, `${name} desc is too short to search`).toBeGreaterThan(40);
      expect(MOTIFS[name].tags?.length, `${name} has no data-tags`).toBeGreaterThanOrEqual(3);
      expect(MOTIFS[name].category, `${name} is not in a subfolder`).toBeTruthy();
    }
  });

  it("the library is large enough that guessing ids is the wrong move", () => {
    expect(MOTIF_NAMES.length).toBeGreaterThanOrEqual(200);
  });

  it("most filled motifs are multi-layer so they recolour in more than one slot", () => {
    const filled = MOTIF_NAMES.filter((n) => !MOTIFS[n]!.stroke);
    const layered = filled.filter((n) => (MOTIFS[n]!.layers?.length ?? 0) >= 2);
    expect(layered.length / filled.length).toBeGreaterThan(0.8);
  });

  it("the real balloon-bunch motif is a genuine multi-layer demo", () => {
    // Proves the feature actually landed in the real library, not just in
    // an isolated fixture test below.
    const layers = MOTIFS["balloon-bunch"]?.layers;
    expect(layers, "balloon-bunch should be a multi-layer motif").toBeDefined();
    expect(layers!.length).toBeGreaterThanOrEqual(2);
    const tones = new Set(layers!.map((l) => l.tone));
    expect(tones.size, "balloon-bunch's layers should use more than one tone").toBeGreaterThan(1);
  });
});

describe("multi-colour motifs (data-tone layers)", () => {
  let dir: string;

  function put(name: string, xml: string) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), xml);
  }

  function makeDir() {
    dir = mkdtempSync(join(tmpdir(), "flyero-motif-test-"));
    return dir;
  }

  function cleanup() {
    rmSync(dir, { recursive: true, force: true });
  }

  it("parses tagged paths into named layers, grouped by tone", () => {
    makeDir();
    try {
      put(
        "two-tone.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <title>Two-tone test shape</title>
          <desc>A fixture shape for testing layer parsing, nothing more.</desc>
          <path data-tone="accent" d="M 10 10 L 40 10 L 40 40 Z"/>
          <path data-tone="ink" d="M 60 60 L 90 60 L 90 90 Z"/>
        </svg>`,
      );
      const lib = loadMotifData(dir);
      const layers = lib["two-tone"]!.layers!;
      expect(layers).toHaveLength(2);
      expect(layers.find((l) => l.tone === "accent")?.d).toContain("10 10");
      expect(layers.find((l) => l.tone === "ink")?.d).toContain("60 60");
      // The flattened `d` still exists — backward compatibility for any
      // caller that doesn't (yet) know about `layers`.
      expect(lib["two-tone"]!.d).toContain("10 10");
      expect(lib["two-tone"]!.d).toContain("60 60");
    } finally {
      cleanup();
    }
  });

  it("concatenates multiple paths sharing the same tone into one layer", () => {
    makeDir();
    try {
      put(
        "shared.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <title>Shared tone test</title>
          <desc>A fixture shape for testing layer parsing, nothing more.</desc>
          <path data-tone="ink" d="M 1 1 L 2 2 Z"/>
          <path data-tone="ink" d="M 3 3 L 4 4 Z"/>
          <path data-tone="accent" d="M 5 5 L 6 6 Z"/>
        </svg>`,
      );
      const layers = loadMotifData(dir)["shared"]!.layers!;
      expect(layers).toHaveLength(2);
      const inkLayer = layers.find((l) => l.tone === "ink")!;
      expect(inkLayer.d).toContain("1 1");
      expect(inkLayer.d).toContain("3 3");
    } finally {
      cleanup();
    }
  });

  it("a plain single-colour motif has no layers field at all", () => {
    makeDir();
    try {
      put(
        "plain.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <title>Plain</title>
          <desc>A fixture shape for testing that single-colour motifs have no layers field.</desc>
          <path d="M 1 1 L 2 2 Z"/>
        </svg>`,
      );
      expect(loadMotifData(dir)["plain"]!.layers).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("rejects a motif with no <title>, naming the file", () => {
    makeDir();
    try {
      put(
        "no-title.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <desc>Has a description but no title.</desc>
          <path d="M 1 1 L 2 2 Z"/>
        </svg>`,
      );
      expect(() => loadMotifData(dir)).toThrow(/no-title\.svg has no <title>/);
    } finally {
      cleanup();
    }
  });

  it("rejects a motif with no <desc>, naming the file", () => {
    makeDir();
    try {
      put(
        "no-desc.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <title>Has a title but no description</title>
          <path d="M 1 1 L 2 2 Z"/>
        </svg>`,
      );
      expect(() => loadMotifData(dir)).toThrow(/no-desc\.svg has no <desc>/);
    } finally {
      cleanup();
    }
  });

  it("rejects a motif that tags some paths but not others", () => {
    makeDir();
    try {
      put(
        "partial.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <title>Partial</title>
          <path data-tone="ink" d="M 1 1 L 2 2 Z"/>
          <path d="M 3 3 L 4 4 Z"/>
        </svg>`,
      );
      expect(() => loadMotifData(dir)).toThrow(/leaves others untagged/);
    } finally {
      cleanup();
    }
  });

  it("rejects an unknown data-tone value, naming the bad value", () => {
    makeDir();
    try {
      put(
        "badtone.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <title>Bad tone</title>
          <path data-tone="mauve" d="M 1 1 L 2 2 Z"/>
        </svg>`,
      );
      expect(() => loadMotifData(dir)).toThrow(/data-tone="mauve"/);
    } finally {
      cleanup();
    }
  });

  it("rejects mixing data-tone layers with fill=\"none\" line art", () => {
    makeDir();
    try {
      put(
        "mixed.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <title>Mixed</title>
          <path data-tone="ink" d="M 1 1 L 2 2 Z" fill="none"/>
        </svg>`,
      );
      expect(() => loadMotifData(dir)).toThrow(/mixes data-tone layers with fill="none"/);
    } finally {
      cleanup();
    }
  });

  it("still rejects an arbitrary baked-in fill colour, same as before this feature", () => {
    makeDir();
    try {
      put(
        "arbitrary.svg",
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <title>Arbitrary</title>
          <path d="M 1 1 L 2 2 Z" fill="#ff00ff"/>
        </svg>`,
      );
      expect(() => loadMotifData(dir)).toThrow(/#ff00ff/);
    } finally {
      cleanup();
    }
  });

  it("MOTIF_TONES is exactly the six theme slots figure.tsx's own tone prop uses", () => {
    expect(MOTIF_TONES).toEqual(["ink", "accent", "accent2", "muted", "paper", "ground"]);
  });
});

describe("motif search", () => {
  it("ranks an exact id match first", () => {
    const results = searchMotifs("balloon");
    expect(results[0]?.id).toBe("balloon");
  });

  it("matches on words in the description, not just the id", () => {
    // Nothing in the id "leaf" or "clover" says "nature" — this only works
    // if category and title text are actually searched.
    const results = searchMotifs("nature");
    expect(results.map((r) => r.category)).toContain("nature");
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchMotifs("qwqwqwzzznomatch")).toEqual([]);
  });

  it("matches a synonym even when the literal word never appears in an id", () => {
    // "birthday" is a synonym for celebration — party-hat lives in that folder.
    const results = searchMotifs("birthday");
    expect(results.map((r) => r.id)).toContain("party-hat");
  });

  it("finds a motif by a word that only lives in the desc, not the id", () => {
    const results = searchMotifs("bakery");
    expect(results.map((r) => r.id)).toContain("cake");
  });

  it("finds background ornaments by the words an agent would actually type", () => {
    expect(searchMotifs("wreath").map((r) => r.id)).toContain("laurel-wreath");
    expect(searchMotifs("sunburst").map((r) => r.id)).toContain("sunburst-rays");
    expect(searchMotifs("flourish").some((r) => r.category === "ornament")).toBe(true);
  });

  it("respects the limit", () => {
    // A broad, real category word — every "celebration" motif is a hit —
    // so the limit is what actually truncates the result, not the query.
    expect(searchMotifs("celebration", 3)).toHaveLength(3);
  });
});

describe("pattern tiles", () => {
  it("tiles are square-ish and non-empty", () => {
    for (const tile of [checkerTile(20), stripeTile(10, 6), halftoneTile(18, 5), gridTile(30, 2)]) {
      expect(tile.w).toBeGreaterThan(0);
      expect(tile.h).toBeGreaterThan(0);
      expect(tile.d).toMatch(PATH_CHARS);
    }
  });

  it("a tile is orders of magnitude smaller than enumerating the field", () => {
    // This is the whole reason patterns exist here: the current grain texture
    // emits 900 <circle> nodes for what a tile expresses in a few dozen bytes.
    const field = { x: 0, y: 0, w: 1080, h: 1350 };
    const enumerated = checkerRects(field, 24).length;
    expect(enumerated).toBeGreaterThan(1000);
    expect(checkerTile(24).d.length).toBeLessThan(200);
  });
});

describe("id safety", () => {
  it("no shape helper produces a string that would trip the editability check", () => {
    // src/core/export/index.ts:54 fails any export containing a <path> whose id
    // mentions headline/copy/text/label. Arc guides are the obvious trap, so
    // this asserts the geometry layer never suggests such a name itself.
    const banned = /(headline|copy|text|label)/i;
    for (const d of Object.values(DETERMINISTIC).map((fn) => fn())) {
      expect(banned.test(d)).toBe(false);
    }
  });
});
