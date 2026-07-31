import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { createElement } from "react";
import { config } from "../../config.js";
import type { AssetRef } from "../../components/types.js";
import { Flyer } from "./flyer.js";
import { fontFiles } from "./fonts.js";
import { themeFromSpec } from "./theme.js";
import { solveLayout, type LayoutResult } from "../layout/solver.js";
import type { DesignSpec } from "../compose/spec.js";

/**
 * Stage 6 — Renderer. React → SVG → PNG, deterministic in both directions
 * (AGENTS.md law 3: same spec + seed → identical bytes).
 */

export type RenderOutput = {
  svg: string;
  layout: LayoutResult;
};

export function renderSpec(spec: DesignSpec, assets: AssetRef[] = []): RenderOutput {
  const theme = themeFromSpec(spec);
  // Photographs contribute their measured brightness to the tone field; without
  // a map they are treated as unknown and busy, which is the safe default.
  const assetTone = new Map(assets.map((a) => [a.assetId, a.toneMap]));
  const layout = solveLayout(spec, theme, assetTone);
  const assetMap = new Map(assets.map((a) => [a.assetId, a]));
  const body = renderToStaticMarkup(
    createElement(Flyer, { spec, layout, theme, assets: assetMap }),
  );
  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
  return { svg, layout };
}

/** Renders an already-solved layout — used by the reviser so geometry is reused. */
export function renderWithLayout(
  spec: DesignSpec,
  layout: LayoutResult,
  assets: AssetRef[] = [],
): string {
  const theme = themeFromSpec(spec);
  const assetMap = new Map(assets.map((a) => [a.assetId, a]));
  const body = renderToStaticMarkup(
    createElement(Flyer, { spec, layout, theme, assets: assetMap }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
}

export function rasterize(svg: string, scale = config.renderScale): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "zoom", value: scale },
    font: {
      fontFiles: fontFiles(),
      loadSystemFonts: false,
      defaultFontFamily: "Inter",
    },
    // Images are embedded as data: URIs, so nothing is fetched at render time.
    logLevel: "error",
  });
  return Buffer.from(resvg.render().asPng());
}

/** Smaller raster for vision critique — cheaper tokens, same composition. */
export function rasterizeForCritique(svg: string): Buffer {
  return rasterize(svg, 0.75);
}

export { themeFromSpec, solveLayout };
export type { LayoutResult };
