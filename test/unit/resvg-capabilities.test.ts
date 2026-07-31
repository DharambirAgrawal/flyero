import { describe, expect, it } from "vitest";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { fontFiles } from "../../src/core/render/fonts.js";

/**
 * A standing guard on what the installed renderer can actually draw.
 *
 * `@resvg/resvg-js` documents nothing about its SVG feature coverage, and the
 * decoration layer leans on patterns, gradients, masks, filters and `textPath`.
 * Worse, at least one feature (`mix-blend-mode`) is *silently* ignored in one
 * spelling and honoured in another — no warning, no error, just a wrong
 * picture. Without this file a resvg upgrade turns that into a visual
 * regression nobody notices; with it, it turns into a red test.
 *
 * These assertions sample real pixels. An earlier throwaway probe tried to
 * infer "did it draw?" from compressed PNG byte counts and reported every
 * feature as unsupported, including the ones that plainly worked — so nothing
 * here trusts file size.
 */

const SIZE = 60;

/** Renders a fragment on white and returns raw RGBA pixels. */
async function pixels(body: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="#ffffff"/>${body}</svg>`;
  const png = new Resvg(svg, {
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Inter" },
    logLevel: "error",
  })
    .render()
    .asPng();
  return sharp(Buffer.from(png)).ensureAlpha().raw().toBuffer();
}

function at(buf: Buffer, x: number, y: number): [number, number, number] {
  const i = (y * SIZE + x) * 4;
  return [buf[i]!, buf[i + 1]!, buf[i + 2]!];
}

/** Count of pixels that are not pure white — i.e. how much ink landed. */
function inked(buf: Buffer): number {
  let count = 0;
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i] !== 255 || buf[i + 1] !== 255 || buf[i + 2] !== 255) count++;
  }
  return count;
}

const GREEN = `#12A150`;

describe("resvg capabilities — features the decoration layer depends on", () => {
  it("renders nothing for an empty document (control)", async () => {
    expect(inked(await pixels(""))).toBe(0);
  });

  it("supports <pattern> with userSpaceOnUse", async () => {
    const buf = await pixels(
      `<defs><pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="10" height="20" fill="${GREEN}"/></pattern></defs>` +
        `<rect width="${SIZE}" height="${SIZE}" fill="url(#p)"/>`,
    );
    // Half-width bars over the full canvas: expect close to 50% coverage.
    const ratio = inked(buf) / (SIZE * SIZE);
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it("supports patternTransform (how diagonals are made)", async () => {
    const tile = `<pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"{{T}}><rect width="10" height="20" fill="${GREEN}"/></pattern>`;
    const flat = await pixels(`<defs>${tile.replace("{{T}}", "")}</defs><rect width="${SIZE}" height="${SIZE}" fill="url(#p)"/>`);
    const spun = await pixels(
      `<defs>${tile.replace("{{T}}", ` patternTransform="rotate(45)"`)}</defs><rect width="${SIZE}" height="${SIZE}" fill="url(#p)"/>`,
    );
    expect(Buffer.compare(flat, spun)).not.toBe(0);
  });

  it("supports linear and radial gradients", async () => {
    const lin = await pixels(
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${GREEN}"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs>` +
        `<rect width="${SIZE}" height="${SIZE}" fill="url(#g)"/>`,
    );
    // A gradient must actually vary across the canvas, not paint one flat tone.
    expect(at(lin, 2, 30)[0]).toBeLessThan(at(lin, SIZE - 3, 30)[0]);

    const rad = await pixels(
      `<defs><radialGradient id="r"><stop offset="0" stop-color="${GREEN}"/><stop offset="1" stop-color="#ffffff"/></radialGradient></defs>` +
        `<rect width="${SIZE}" height="${SIZE}" fill="url(#r)"/>`,
    );
    expect(at(rad, 30, 30)[0]).toBeLessThan(at(rad, 2, 2)[0]);
  });

  it("supports <mask>", async () => {
    const buf = await pixels(
      `<defs><mask id="m"><rect width="${SIZE}" height="${SIZE}" fill="#000"/><circle cx="30" cy="30" r="18" fill="#fff"/></mask></defs>` +
        `<rect width="${SIZE}" height="${SIZE}" fill="${GREEN}" mask="url(#m)"/>`,
    );
    expect(at(buf, 30, 30)).not.toEqual([255, 255, 255]); // inside the hole: painted
    expect(at(buf, 2, 2)).toEqual([255, 255, 255]); // outside: masked away
  });

  it("supports <clipPath> over an arbitrary path", async () => {
    const buf = await pixels(
      `<defs><clipPath id="c"><path d="M 0 0 L 60 0 L 0 60 Z"/></clipPath></defs>` +
        `<rect width="${SIZE}" height="${SIZE}" fill="${GREEN}" clip-path="url(#c)"/>`,
    );
    expect(at(buf, 5, 5)).not.toEqual([255, 255, 255]);
    expect(at(buf, 55, 55)).toEqual([255, 255, 255]);
  });

  it("supports <textPath> — arched headlines stay real text", async () => {
    const arched = await pixels(
      `<defs><path id="a" d="M 4 50 A 40 40 0 0 1 56 50" fill="none"/></defs>` +
        `<text font-family="Inter" font-size="15" font-weight="700" fill="${GREEN}"><textPath href="#a" startOffset="50%" text-anchor="middle">ARCH</textPath></text>`,
    );
    const flat = await pixels(
      `<text x="30" y="50" font-family="Inter" font-size="15" font-weight="700" text-anchor="middle" fill="${GREEN}">ARCH</text>`,
    );
    expect(inked(arched)).toBeGreaterThan(0);
    expect(Buffer.compare(arched, flat)).not.toBe(0);
  });

  it("supports outlined text via stroke and paint-order", async () => {
    const outline = await pixels(
      `<text x="30" y="40" font-family="Inter" font-size="26" font-weight="900" text-anchor="middle" fill="none" stroke="${GREEN}" stroke-width="1.5">AB</text>`,
    );
    expect(inked(outline)).toBeGreaterThan(0);
    const solid = await pixels(
      `<text x="30" y="40" font-family="Inter" font-size="26" font-weight="900" text-anchor="middle" fill="${GREEN}">AB</text>`,
    );
    // Outlined type must have strictly less ink than the filled version.
    expect(inked(outline)).toBeLessThan(inked(solid));
  });

  it("supports feGaussianBlur and feDropShadow", async () => {
    const sharpEdge = await pixels(`<rect x="18" y="18" width="24" height="24" fill="${GREEN}"/>`);
    const blurred = await pixels(
      `<defs><filter id="b"><feGaussianBlur stdDeviation="4"/></filter></defs>` +
        `<rect x="18" y="18" width="24" height="24" fill="${GREEN}" filter="url(#b)"/>`,
    );
    // Blur spreads ink beyond the original rect.
    expect(inked(blurred)).toBeGreaterThan(inked(sharpEdge));

    const shadowed = await pixels(
      `<defs><filter id="d"><feDropShadow dx="5" dy="5" stdDeviation="2" flood-opacity="0.6"/></filter></defs>` +
        `<rect x="18" y="18" width="24" height="24" fill="${GREEN}" filter="url(#d)"/>`,
    );
    expect(inked(shadowed)).toBeGreaterThan(inked(sharpEdge));
  });

  /**
   * The landmine. resvg honours `mix-blend-mode` only as a CSS declaration; as
   * a presentation attribute it is dropped without complaint and you get an
   * opaque colour block where you expected a blend. React emits
   * `style={{ mixBlendMode }}` in the working form — so any decoration code
   * must set it via `style`, never as a JSX attribute.
   */
  it("supports mix-blend-mode via style, and IGNORES it as an attribute", async () => {
    const base = `<rect width="${SIZE}" height="${SIZE}" fill="#00ff00"/>`;
    const plain = await pixels(`${base}<rect width="${SIZE}" height="${SIZE}" fill="#ff00ff"/>`);
    const asAttr = await pixels(
      `${base}<rect width="${SIZE}" height="${SIZE}" fill="#ff00ff" mix-blend-mode="multiply"/>`,
    );
    const asStyle = await pixels(
      `${base}<rect width="${SIZE}" height="${SIZE}" fill="#ff00ff" style="mix-blend-mode:multiply"/>`,
    );

    // Attribute form: indistinguishable from no blending at all.
    expect(Buffer.compare(asAttr, plain)).toBe(0);
    // Style form: green × magenta multiplies to black.
    expect(Buffer.compare(asStyle, plain)).not.toBe(0);
    expect(at(asStyle, 30, 30)).toEqual([0, 0, 0]);
  });

  it("supports group opacity and rotation", async () => {
    const buf = await pixels(
      `<g transform="rotate(20 30 30)" opacity="0.5"><rect x="10" y="20" width="40" height="20" fill="${GREEN}"/></g>`,
    );
    const [r, g, b] = at(buf, 30, 30);
    expect(r).toBeGreaterThan(100); // half-transparent, so lifted toward white
    expect(g + b).toBeGreaterThan(0);
  });

  it("supports non-uniform corner radii", async () => {
    const wide = await pixels(`<rect x="5" y="5" width="50" height="50" rx="24" ry="4" fill="${GREEN}"/>`);
    const even = await pixels(`<rect x="5" y="5" width="50" height="50" rx="24" ry="24" fill="${GREEN}"/>`);
    expect(inked(wide)).toBeGreaterThan(inked(even));
  });
});
