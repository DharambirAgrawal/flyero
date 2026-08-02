import type { ReactElement } from "react";
import { getComponent } from "../../components/registry.js";
import type { AssetRef, Box, Theme } from "../../components/types.js";
import { Rng } from "../../lib/rng.js";
import { DecorBand, Ground } from "./ground.js";
import { depthEffects, FOCAL_DEPTH } from "../canvas/depth.js";
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

  /**
   * Occluders per element, from `layout.masks`.
   *
   * The solver has always computed these — which element passes behind which —
   * and the renderer threw them away. So `woven-through-image` and
   * `masked-by-subject` were labels: the type was drawn flat on top and Gate G4
   * could still count it as participating. Weaving only exists if something is
   * actually cut.
   */
  const occludersFor = new Map<string, string[]>();
  for (const mask of layout.masks) {
    const list = occludersFor.get(mask.elementId) ?? [];
    list.push(mask.occluderId);
    occludersFor.set(mask.elementId, list);
  }

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
    /**
     * Atmosphere, derived from the element's depth.
     *
     * Applied as an overlay rather than by recolouring: a photograph would have
     * to be decoded and re-encoded on every render otherwise, and the whole
     * point of this engine is that rendering stays a cheap pure function.
     */
    const effects = depthEffects(box.depth ?? FOCAL_DEPTH, theme.material.surface.elevation ? 1 : 0.6);
    const atmosphere = layout.ground.base;

    const occluders = occludersFor.get(el.id) ?? [];
    const maskId = occluders.length > 0 ? `weave-${el.id}` : null;
    const wrapped = maskId ? (
      <>
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            {/* White keeps, black cuts: the element shows everywhere except
                where the occluder physically sits in front of it. */}
            <rect x={0} y={0} width={spec.canvas.w} height={spec.canvas.h} fill="#ffffff" />
            {occluders.map((oid) => {
              const ob = layout.boxes[oid];
              if (!ob) return null;
              return (
                <rect
                  key={oid}
                  x={ob.x}
                  y={ob.y}
                  width={ob.w}
                  height={ob.h}
                  fill="#000000"
                  transform={
                    ob.rotate
                      ? `rotate(${ob.rotate.toFixed(3)} ${(ob.x + ob.w / 2).toFixed(2)} ${(ob.y + ob.h / 2).toFixed(2)})`
                      : undefined
                  }
                />
              );
            })}
          </mask>
        </defs>
        <g mask={`url(#${maskId})`}>{drawnContent}</g>
      </>
    ) : (
      drawnContent
    );

    if (box.rotate) {
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      return (
        <g key={el.id} transform={`rotate(${box.rotate.toFixed(3)} ${cx.toFixed(2)} ${cy.toFixed(2)})`}>
          {wrapped}
        </g>
      );
    }
    const withAtmosphere =
      effects.haze > 0.02 || effects.blur > 0.4 ? (
        <>
          {effects.blur > 0.4 ? (
            <defs>
              <filter id={`dof-${el.id}`} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation={Math.min(effects.blur, 6).toFixed(2)} />
              </filter>
            </defs>
          ) : null}
          <g filter={effects.blur > 0.4 ? `url(#dof-${el.id})` : undefined}>{wrapped}</g>
          {effects.haze > 0.02 ? (
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              fill={atmosphere}
              opacity={Math.min(0.4, effects.haze).toFixed(3)}
              pointerEvents="none"
            />
          ) : null}
        </>
      ) : (
        wrapped
      );

    return <g key={el.id}>{withAtmosphere}</g>;
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
