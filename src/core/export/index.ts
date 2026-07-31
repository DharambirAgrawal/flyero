import { flyerKey, putBuffer, putText } from "../../store/objects.js";
import { rasterize } from "../render/index.js";
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

export function exportFlyer(input: {
  jobId: string;
  revision: number;
  spec: DesignSpec;
  svg: string;
  png?: Buffer;
}): ExportPaths {
  const png = input.png ?? rasterize(input.svg);
  const paths: ExportPaths = {
    png: flyerKey(input.jobId, input.revision, "render.png"),
    svg: flyerKey(input.jobId, input.revision, "render.svg"),
    spec: flyerKey(input.jobId, input.revision, "spec.json"),
  };
  putBuffer(paths.png, png);
  putText(paths.svg, input.svg);
  putText(paths.spec, JSON.stringify(input.spec, null, 2));
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
