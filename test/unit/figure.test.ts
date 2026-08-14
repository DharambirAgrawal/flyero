import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getComponent } from "../../src/components/registry.js";
import { fontPairById } from "../../src/creative/fontpairs.js";
import { materialById } from "../../src/creative/materials.js";
import { typographyById } from "../../src/creative/typebehaviors.js";
import { Rng } from "../../src/lib/rng.js";
import type { RenderContext } from "../../src/components/types.js";

function ctx(props: Record<string, unknown>, shaded = false): RenderContext {
  return {
    id: "fig",
    box: { x: 40, y: 40, w: 400, h: 400, zIndex: 1 },
    theme: {
      palette: {
        bg: "#fff8f0",
        fg: "#1a1814",
        accent: "#e23b4a",
        accent2: "#2a9d6a",
        muted: "#8a8078",
      },
      fonts: fontPairById("fraunces-inter"),
      material: materialById("soft-industrial"),
      typography: typographyById("quiet-with-one-loud-word"),
      light: { azimuth: 40, elevation: 55, softness: 0.35, tint: "#3a2a20" },
    },
    copy: { eyebrow: null, headline: "Hi", body: null, cta: { label: "Go", url: null, qr: false } },
    productName: "Test",
    props,
    assets: [],
    rng: new Rng("figure-shade"),
  };
}

function draw(motif: string, shaded: boolean) {
  const figure = getComponent("composed-figure");
  return renderToStaticMarkup(
    figure.render(
      ctx({
        parts: [
          {
            id: "mark",
            draw: { kind: "motif", motif, shaded },
            size: "large",
            at: { at: "center" },
          },
        ],
      }),
    ),
  );
}

describe("composed-figure motif shading", () => {
  it("applies a light-keyed sheen to a multi-layer motif when shaded", () => {
    const svg = draw("balloon", true);
    expect(svg).toMatch(/<radialGradient/);
    expect(svg).toMatch(/url\(#sheen-fig-mark-/);
    // Body and knot sheen; the paper highlight stays the page colour.
    expect((svg.match(/<radialGradient/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg).toContain("#fff8f0");
  });

  it("does not sheen the same multi-layer motif when shaded is off", () => {
    const svg = draw("balloon", false);
    expect(svg).not.toMatch(/radialGradient/);
    expect(svg).toContain("#e23b4a");
    expect(svg).toContain("#fff8f0");
  });

  it("still ignores shaded on line-art motifs", () => {
    const svg = draw("gift-outline", true);
    expect(svg).not.toMatch(/radialGradient/);
    expect(svg).toMatch(/stroke="/);
  });
});
