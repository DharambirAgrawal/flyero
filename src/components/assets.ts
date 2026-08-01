import type { AssetRef } from "./types.js";

/**
 * SVG's cover crop aligned to the analysed subject rather than the geometric
 * centre. It is intentionally coarse (left/centre/right × top/centre/bottom):
 * preserveAspectRatio is deterministic and editable, while an arbitrary
 * object-position transform would push crop geometry into component code.
 */
export function focalPreserveAspect(
  asset: Pick<AssetRef, "focalPoint">,
  fit: "slice" | "meet" = "slice",
): string {
  const point = asset.focalPoint ?? { x: 0.5, y: 0.5 };
  const x = point.x < 0.35 ? "xMin" : point.x > 0.65 ? "xMax" : "xMid";
  const y = point.y < 0.35 ? "YMin" : point.y > 0.65 ? "YMax" : "YMid";
  return `${x}${y} ${fit}`;
}
