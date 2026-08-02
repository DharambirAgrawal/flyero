import { flyerKey, putBuffer, putText } from "../../store/objects.js";
import { rasterize } from "../render/index.js";
import { config } from "../../config.js";
import type { DesignSpec } from "../compose/spec.js";

/**
 * Stage 10 — Exporter. PNG for delivery, SVG for editing, spec.json as the
 * source of truth. PDF is post-v1 and the API returns 501 for it.
 */

export type ExportPaths = {
  png: string;
  svg: string;
  spec: string;
};

/**
 * Persist a flyer.
 *
 * **The spec is the artefact; the render is a derivative.** Rendering is
 * deterministic — the same spec, seed and assets always produce identical bytes
 * (AGENTS.md law 3) — so storing the PNG and SVG is storing something we can
 * always recompute. Measured on a few days of test runs: renders were 226MB of
 * 274MB, 83% of everything, while the specs that actually define those flyers
 * came to 8KB each.
 *
 * So by default only the spec is written, and exports re-render on demand. On a
 * 0.5GB database that is the difference between a few hundred flyers and a few
 * hundred thousand.
 *
 * `config.persistRenders` turns caching back on where re-rendering would cost
 * more than the disk — a busy instance serving the same flyer repeatedly.
 */
export function exportFlyer(input: {
  jobId: string;
  revision: number;
  spec: DesignSpec;
  svg: string;
  png?: Buffer;
}): ExportPaths {
  const paths: ExportPaths = {
    png: flyerKey(input.jobId, input.revision, "render.png"),
    svg: flyerKey(input.jobId, input.revision, "render.svg"),
    spec: flyerKey(input.jobId, input.revision, "spec.json"),
  };
  // The spec always persists: it is what the flyer *is*.
  putText(paths.spec, JSON.stringify(input.spec));
  if (config.persistRenders) {
    putBuffer(paths.png, input.png ?? rasterize(input.svg));
    putText(paths.svg, input.svg);
  }
  return paths;
}

export type EditabilityReport = {
  editable: boolean;
  textNodes: number;
  namedGroups: number;
  problems: string[];
};

/**
 * Verifies the promise that exported SVG opens in Figma with live text
 * (REQUIREMENTS.md acceptance test 4). Cheap enough to run on every export.
 */
export function checkEditability(svg: string): EditabilityReport {
  const problems: string[] = [];
  const textNodes = (svg.match(/<text\b/g) ?? []).length;
  const namedGroups = (svg.match(/<g[^>]*\bid="/g) ?? []).length;

  if (textNodes === 0) problems.push("no <text> elements — text has been outlined or is missing");
  if (namedGroups === 0) problems.push("no named groups — layers would be unnavigable");
  // A <path> whose id looks like text, or a font-face embed, means outlining crept in.
  if (/<path[^>]*\bid="[^"]*(headline|copy|text|label)/i.test(svg)) {
    problems.push("text appears to have been converted to paths");
  }
  if (/<image[^>]+href="(?!data:)/.test(svg)) {
    problems.push("an image references an external URL — the SVG is not self-contained");
  }

  return { editable: problems.length === 0, textNodes, namedGroups, problems };
}
