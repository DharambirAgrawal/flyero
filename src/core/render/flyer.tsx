import type { ReactElement } from "react";
import { getComponent } from "../../components/registry.js";
import type { AssetRef, Box, Theme } from "../../components/types.js";
import { Rng } from "../../lib/rng.js";
import { DecorBand, Ground } from "./ground.js";
import type { DesignSpec } from "../compose/spec.js";
import type { LayoutResult } from "../layout/solver.js";

/**
 * The flyer's React tree. Rendering is a pure function of (spec, layout, assets)
 * — no time, no randomness beyond the seeded RNG, no network.
 */

export function Flyer({
  spec,
  layout,
  theme,
  assets,
}: {
  spec: DesignSpec;
  layout: LayoutResult;
  theme: Theme;
  assets: Map<string, AssetRef>;
}): ReactElement {
  const drawn = [...spec.elements].sort(
    (a, b) => (layout.boxes[a.id]?.zIndex ?? 0) - (layout.boxes[b.id]?.zIndex ?? 0),
  );
  const under = layout.decorations.filter((d) => d.layer === "under");
  const over = layout.decorations.filter((d) => d.layer === "over");

  /**
   * Ground plates (a full-bleed photograph, z=2) are painted before the
   * under-ornament rather than after it. Otherwise every "under" mark is buried
   * beneath the photograph, and on exactly the topologies that look best the
   * graphic language does nothing at all — which is how a poster ends up as a
   * stock photo with a caption on it.
   */
  const GROUND_Z = 2;
  const groundPlates = drawn.filter((el) => (layout.boxes[el.id]?.zIndex ?? 0) <= GROUND_Z);
  const content = drawn.filter((el) => (layout.boxes[el.id]?.zIndex ?? 0) > GROUND_Z);

  function drawElement(el: (typeof drawn)[number]) {
    const box = layout.boxes[el.id];
    if (!box) return null;
    const mod = getComponent(el.component);
    const props = mod.props.parse({ ...(el.props ?? {}), ...(box.propsOverride ?? {}) });
    const elementAssets = (el.assets ?? [])
      .map((id) => assets.get(id))
      .filter((a): a is AssetRef => Boolean(a));
    const drawnContent = mod.render({
      id: el.id,
      box: box as Box,
      theme,
      copy: spec.copy,
      productName: spec.productName,
      props,
      assets: elementAssets,
      rng: new Rng(`element:${spec.seed}:${el.id}`),
    });
    if (box.rotate) {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      return (
        <g key={el.id} transform={`rotate(${box.rotate.toFixed(3)} ${cx.toFixed(2)} ${cy.toFixed(2)})`}>
          {drawnContent}
        </g>
      );
    }
    return <g key={el.id}>{drawnContent}</g>;
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      xmlnsXlink="http://www.w3.org/1999/xlink"
      width={spec.canvas.w}
      height={spec.canvas.h}
      viewBox={`0 0 ${spec.canvas.w} ${spec.canvas.h}`}
      role="img"
      aria-label={spec.idea}
    >
      <title>{spec.idea}</title>
      <desc>{`Flyero ${spec.specVersion} · ${spec.lineage.metaphor} · ${spec.lineage.topology}`}</desc>
      <Ground plan={layout.ground} canvas={spec.canvas} />
      {groundPlates.map(drawElement)}
      <DecorBand name="decor-under" items={under} />
      {content.map(drawElement)}
      <DecorBand name="decor-over" items={over} />
    </svg>
  );
}
