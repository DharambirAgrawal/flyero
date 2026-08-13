import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCuratedLibrary } from "../../src/core/images/providers/library.js";

/** A 1x1 opaque PNG — no alpha channel at all. */
const OPAQUE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

/** A real transparent PNG, built with sharp rather than hand-crafted bytes — a 10x10 image, half opaque red, half fully transparent, so `detectTransparency` has genuine alpha=0 pixels to find. */
async function transparentPng(): Promise<Buffer> {
  const opaqueHalf = { create: { width: 10, height: 5, channels: 4 as const, background: { r: 255, g: 0, b: 0, alpha: 1 } } };
  const clearHalf = { create: { width: 10, height: 5, channels: 4 as const, background: { r: 255, g: 0, b: 0, alpha: 0 } } };
  const top = await sharp(opaqueHalf).png().toBuffer();
  const bottom = await sharp(clearHalf).png().toBuffer();
  return sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: top, top: 0, left: 0 }, { input: bottom, top: 5, left: 0 }])
    .png()
    .toBuffer();
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "flyero-library-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function put(relPath: string, content: Buffer | string) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

describe("curated library loader", () => {
  it("loads an image with a valid sidecar (no license required)", async () => {
    put("celebration/confetti-burst.png", OPAQUE_PNG);
    put(
      "celebration/confetti-burst.json",
      JSON.stringify({ title: "Confetti burst", tags: ["confetti", "party"] }),
    );
    const lib = await loadCuratedLibrary(dir);
    expect(lib.size).toBe(1);
    const item = lib.get("celebration/confetti-burst")!;
    expect(item.title).toBe("Confetti burst");
    expect(item.category).toBe("celebration");
    expect(item.mime).toBe("image/png");
    expect(item.tags).toEqual(["confetti", "party"]);
    expect(item.license).toBeUndefined();
  });

  it("still accepts an optional license, author and usage hint", async () => {
    put("x.png", OPAQUE_PNG);
    put(
      "x.json",
      JSON.stringify({ title: "X", license: "CC0", author: "Jane", usage: "hero shot for the storefront" }),
    );
    const item = (await loadCuratedLibrary(dir)).get("x")!;
    expect(item.license).toBe("CC0");
    expect(item.author).toBe("Jane");
    expect(item.usage).toBe("hero shot for the storefront");
  });

  it("measures transparency from real pixels rather than trusting a declared field", async () => {
    put("opaque.png", OPAQUE_PNG);
    put("opaque.json", JSON.stringify({ title: "Opaque" }));
    put("cutout.png", await transparentPng());
    put("cutout.json", JSON.stringify({ title: "Cutout" }));
    const lib = await loadCuratedLibrary(dir);
    expect(lib.get("opaque")!.transparent).toBe(false);
    expect(lib.get("cutout")!.transparent).toBe(true);
  });

  it("defaults assetType from measured transparency when no type is declared", async () => {
    put("opaque.png", OPAQUE_PNG);
    put("opaque.json", JSON.stringify({ title: "Opaque" }));
    put("cutout.png", await transparentPng());
    put("cutout.json", JSON.stringify({ title: "Cutout" }));
    const lib = await loadCuratedLibrary(dir);
    expect(lib.get("opaque")!.assetType).toBe("photo");
    expect(lib.get("cutout")!.assetType).toBe("png");
  });

  it("lets a declared type override the transparency default — the balloon/water case", async () => {
    // The exact scenario that motivated this field: a "balloon" image could
    // be a full-bleed background, a decorative cutout, or the literal
    // product photo — three different jobs a filename alone can't say.
    put("water-bg.png", OPAQUE_PNG);
    put("water-bg.json", JSON.stringify({ title: "Water surface texture", type: "background" }));
    put("balloon-icon.png", OPAQUE_PNG);
    put("balloon-icon.json", JSON.stringify({ title: "Balloon accent", type: "icon" }));
    const lib = await loadCuratedLibrary(dir);
    expect(lib.get("water-bg")!.assetType).toBe("background");
    expect(lib.get("balloon-icon")!.assetType).toBe("icon");
  });

  it("throws naming the file when a declared type is not a real MediaAssetType", async () => {
    put("x.png", OPAQUE_PNG);
    put("x.json", JSON.stringify({ title: "X", type: "wallpaper" }));
    await expect(loadCuratedLibrary(dir)).rejects.toThrow(/x\.png.*"wallpaper"/);
  });

  it("throws naming the file when a sidecar is missing", async () => {
    put("celebration/no-sidecar.png", OPAQUE_PNG);
    await expect(loadCuratedLibrary(dir)).rejects.toThrow(/no-sidecar\.png.*sidecar/i);
  });

  it("throws when the sidecar is missing a title", async () => {
    put("x.png", OPAQUE_PNG);
    put("x.json", JSON.stringify({ tags: ["a"] }));
    await expect(loadCuratedLibrary(dir)).rejects.toThrow(/title/i);
  });

  it("throws on malformed sidecar JSON", async () => {
    put("x.png", OPAQUE_PNG);
    put("x.json", "{not valid json");
    await expect(loadCuratedLibrary(dir)).rejects.toThrow(/not valid JSON/i);
  });

  it("does not collide when the same basename is used in two different subfolders", async () => {
    put("a/rose.png", OPAQUE_PNG);
    put("a/rose.json", JSON.stringify({ title: "Rose A" }));
    put("b/rose.png", OPAQUE_PNG);
    put("b/rose.json", JSON.stringify({ title: "Rose B" }));
    // The id is the full relative path (minus extension), so same basename
    // in different subfolders is two distinct ids, not a collision.
    const lib = await loadCuratedLibrary(dir);
    expect(lib.size).toBe(2);
    expect(lib.has("a/rose")).toBe(true);
    expect(lib.has("b/rose")).toBe(true);
  });

  it("throws when the same relative path is used with two different image extensions", async () => {
    put("rose.png", OPAQUE_PNG);
    put("rose.json", JSON.stringify({ title: "Rose (png)" }));
    put("rose.jpg", OPAQUE_PNG);
    // Both "rose.png" and "rose.jpg" reduce to id "rose" — a real collision,
    // sharing the one "rose.json" sidecar between them.
    await expect(loadCuratedLibrary(dir)).rejects.toThrow(/"rose".*used twice/);
  });

  it("returns an empty map for a directory that does not exist", async () => {
    expect((await loadCuratedLibrary(join(dir, "does-not-exist"))).size).toBe(0);
  });

  it("returns an empty map for an empty directory", async () => {
    expect((await loadCuratedLibrary(dir)).size).toBe(0);
  });

  it("supports jpg and webp alongside png", async () => {
    put("x.jpg", OPAQUE_PNG);
    put("x.json", JSON.stringify({ title: "A jpg" }));
    put("y.webp", OPAQUE_PNG);
    put("y.json", JSON.stringify({ title: "A webp" }));
    const lib = await loadCuratedLibrary(dir);
    expect(lib.get("x")!.mime).toBe("image/jpeg");
    expect(lib.get("y")!.mime).toBe("image/webp");
  });
});

describe("curated library — search results tell the agent what it needs to know", () => {
  it("a search result's description states transparency and usage, not just a tag", async () => {
    const { libraryProvider, reloadCuratedLibrary } = await import(
      "../../src/core/images/providers/library.js"
    );
    put("cutout.png", await transparentPng());
    put(
      "cutout.json",
      JSON.stringify({ title: "Peony cutout", tags: ["flower"], usage: "layer over any background" }),
    );
    await reloadCuratedLibrary(dir);
    const results = await libraryProvider.search("peony", 1, 10);
    expect(results).toHaveLength(1);
    expect(results[0]!.description).toMatch(/transparent/i);
    expect(results[0]!.description).toMatch(/layer over any background/);
    expect(results[0]!.assetType).toBe("png");
    expect(results[0]!.tags).toContain("transparent-background");
  });

  it("an opaque photo is typed and described as a photo, not a cutout", async () => {
    const { libraryProvider, reloadCuratedLibrary } = await import(
      "../../src/core/images/providers/library.js"
    );
    put("hero.png", OPAQUE_PNG);
    put("hero.json", JSON.stringify({ title: "Storefront hero" }));
    await reloadCuratedLibrary(dir);
    const results = await libraryProvider.search("storefront", 1, 10);
    expect(results[0]!.assetType).toBe("photo");
    expect(results[0]!.description).toMatch(/opaque/i);
    expect(results[0]!.tags).toContain("opaque-background");
  });

  // These tests point the module's shared, process-wide state at a fixture
  // directory — restore it to the real (currently empty) library afterwards
  // so later tests, in this file or run after it, see real state again.
  afterEach(async () => {
    const { reloadCuratedLibrary } = await import("../../src/core/images/providers/library.js");
    await reloadCuratedLibrary();
  });
});

describe("curated library — wired into the real search/import path", () => {
  it("the real (currently empty) library provider returns no results without erroring", async () => {
    const { libraryProvider } = await import("../../src/core/images/providers/library.js");
    const results = await libraryProvider.search("anything at all", 1, 10);
    expect(results).toEqual([]);
  });

  it("search_images includes the library provider and does not error when it's empty", async () => {
    const { imageProvider } = await import("../../src/core/images/search.js");
    const results = await imageProvider.search({ query: "cake" });
    // Not asserting non-empty — the real curated folder starts empty. The
    // point is that adding "library" to every provider order list didn't
    // break the aggregator fan-out for a completely ordinary query.
    expect(Array.isArray(results)).toBe(true);
  });

  it("isTrustedDownloadUrl rejects a library: reference that does not exist", async () => {
    const { isTrustedDownloadUrl } = await import("../../src/core/images/search.js");
    expect(isTrustedDownloadUrl("library:no-such-id")).toBe(false);
  });

  it("fetchCandidate throws a clear, catchable error for a stale library: reference", async () => {
    const { fetchCandidate } = await import("../../src/core/images/search.js");
    await expect(fetchCandidate({ downloadUrl: "library:no-such-id" })).rejects.toThrow(
      /no longer exists/,
    );
  });
});
