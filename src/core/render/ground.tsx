import type { ReactElement } from "react";
import { Group } from "../../components/primitives.js";
import type { Decoration, DecorNode, GroundPlan } from "../decor/types.js";
import { MOTIFS, motifTransform } from "../../components/shapes.js";

/**
 * Painters for the ground and the ornament bands. Both are deliberately dumb:
 * every decision was already made in the solver, and these just turn plain data
 * into SVG. Nothing here reads the theme, the spec or an RNG.
 *
 * Definitions (`<pattern>`, `<linearGradient>`) are emitted inline inside their
 * own group rather than hoisted into a document-level `<defs>`. That matches
 * what the photo components already do, resvg resolves it happily, and it keeps
 * every id next to the thing that uses it.
 */

/** Angle in degrees → the x1/y1/x2/y2 quadruple a linearGradient wants. */
function gradientVector(angle: number): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (angle * Math.PI) / 180;
  return {
    x1: 0.5 - Math.cos(rad) / 2,
    y1: 0.5 - Math.sin(rad) / 2,
    x2: 0.5 + Math.cos(rad) / 2,
    y2: 0.5 + Math.sin(rad) / 2,
  };
}

export function Ground({
  plan,
  canvas,
}: {
  plan: GroundPlan;
  canvas: { w: number; h: number };
}): ReactElement {
  const { w, h } = canvas;
  const vector = plan.gradient ? gradientVector(plan.gradient.angle) : null;

  return (
    <Group name="ground">
      {plan.gradient && vector ? (
        <defs>
          <linearGradient id={plan.gradient.id} {...vector}>
            <stop offset="0" stopColor={plan.gradient.from} />
            <stop offset="1" stopColor={plan.gradient.to} />
          </linearGradient>
        </defs>
      ) : null}
      {plan.texture ? (
        <defs>
          <pattern
            id={plan.texture.id}
            width={plan.texture.tile.w}
            height={plan.texture.tile.h}
            patternUnits="userSpaceOnUse"
            patternTransform={plan.texture.rotate ? `rotate(${plan.texture.rotate})` : undefined}
          >
            <path d={plan.texture.tile.d} fill={plan.texture.fill} />
          </pattern>
        </defs>
      ) : null}

      <rect x={0} y={0} width={w} height={h} fill={plan.base} />

      {plan.gradient ? (
        <rect x={0} y={0} width={w} height={h} fill={`url(#${plan.gradient.id})`} />
      ) : null}

      {plan.regions.map((region, i) =>
        region.d ? (
          <path key={i} d={region.d} fill={region.fill} fillRule="evenodd" />
        ) : null,
      )}

      {plan.texture ? (
        <rect x={0} y={0} width={w} height={h} fill={`url(#${plan.texture.id})`} />
      ) : null}
    </Group>
  );
}

function Node({ node, index }: { node: DecorNode; index: number }): ReactElement | null {
  switch (node.t) {
    case "path":
      return (
        <path
          key={index}
          d={node.d}
          fill={node.fill ?? "none"}
          fillRule={node.rule}
          stroke={node.stroke}
          strokeWidth={node.sw}
          strokeDasharray={node.dash}
          strokeLinecap={node.dash ? "round" : undefined}
          opacity={node.op}
        />
      );
    case "rect":
      return (
        <rect
          key={index}
          x={node.x}
          y={node.y}
          width={node.w}
          height={node.h}
          rx={node.rx}
          fill={node.fill}
          opacity={node.op}
        />
      );
    case "circle":
      return (
        <circle key={index} cx={node.cx} cy={node.cy} r={node.r} fill={node.fill} opacity={node.op} />
      );
    case "motif": {
      const motif = MOTIFS[node.name];
      return (
        <g key={index} transform={motifTransform(node.x, node.y, node.size, node.rotate)}>
          <path
            d={motif.d}
            fill={motif.stroke ? "none" : node.fill}
            stroke={motif.stroke ? node.fill : undefined}
            strokeWidth={motif.stroke ? 2.5 : undefined}
            strokeLinecap={motif.stroke ? "round" : undefined}
            strokeLinejoin={motif.stroke ? "round" : undefined}
            fillRule={motif.fillRule}
            opacity={node.op}
          />
        </g>
      );
    }
    case "pattern":
      return (
        <g key={index}>
          <defs>
            <pattern
              id={node.id}
              width={node.tile.w}
              height={node.tile.h}
              patternUnits="userSpaceOnUse"
              patternTransform={node.rotate ? `rotate(${node.rotate})` : undefined}
            >
              <path d={node.tile.d} fill={node.fill} />
            </pattern>
          </defs>
          <rect
            x={node.target.x}
            y={node.target.y}
            width={node.target.w}
            height={node.target.h}
            fill={`url(#${node.id})`}
            opacity={node.op}
          />
        </g>
      );
    default:
      return null;
  }
}

/**
 * One ornament band. Rendered as two flat passes (below the content, then above
 * it) rather than interleaved into the element z-order — that sort is already
 * delicate, with relationship overlaps mutating z by +5 and connectors reaching
 * for `ctaBox.zIndex - 1`. Two passes is provably correct and keeps the "over"
 * set the only thing needing strict keep-out enforcement.
 */
export function DecorBand({
  name,
  items,
}: {
  name: string;
  items: Decoration[];
}): ReactElement | null {
  if (items.length === 0) return null;
  return (
    <Group name={name}>
      {items.map((decoration) => (
        <Group key={decoration.id} name={decoration.id}>
          {decoration.nodes.map((node, i) => (
            <Node key={i} node={node} index={i} />
          ))}
        </Group>
      ))}
    </Group>
  );
}
