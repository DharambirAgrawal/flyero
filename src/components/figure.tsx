import { z } from "zod";
import { FittedLine, Group, inkFor, mutedInkFor } from "./primitives.js";
import type { ComponentModule, RenderContext, Theme } from "./types.js";
import { focalPreserveAspect } from "./assets.js";
import { mix, withAlpha } from "../creative/color.js";
import { shadowFor } from "../core/canvas/light.js";
import { resolveParts, type PartInput, type PlacedPart } from "../core/layout/anchors.js";
import {
  MOTIF_NAMES,
  MOTIFS,
  archPath,
  blobPath,
  burstPath,
  ellipsePath,
  motifTransform,
  polygonPath,
  ribbonPath,
  roundedRectPath,
  scallopedCirclePath,
  sparklePath,
  squigglePath,
  starPath,
  tapeStripPath,
  tornEdgePath,
  wavePath,
  type MotifName,
} from "./shapes.js";

/**
 * `composed-figure` — the component an agent builds for one flyer.
 *
 * Everything else in the library is a finished object: you choose it and take
 * what it gives you. That covers the arrangements worth having permanently, and
 * misses every one-off. "A balloon at the top right", "three leaves drifting
 * past the headline", "a sun behind a mountain with the price stamped on it" —
 * real briefs ask for these constantly and no component will ever be written
 * for them, because each is wanted exactly once.
 *
 * This is that component. The agent names the parts and how they sit relative
 * to each other; `resolveParts` does the arithmetic. No coordinates cross the
 * boundary in either direction, so AGENTS.md law 1 holds — see the long note in
 * `src/core/layout/anchors.ts` for why declaring a *relationship* is design and
 * declaring an x/y is not.
 *
 * It also answers the density problem. Gate G3 counts elements, and seven
 * elements is not many marks — which is why output kept coming back sparse. One
 * composed figure is one element carrying up to eight parts, so a page can be
 * genuinely busy while the restraint gate stays exactly as strict.
 */

const SHAPE_FORMS = [
  "circle",
  "blob",
  "star",
  "sparkle",
  "burst",
  "seal",
  "ribbon",
  "polygon",
  "squiggle",
  "wave",
  "tape",
  "arch",
  "panel",
  "torn",
] as const;

const TONES = ["ink", "accent", "muted", "paper", "ground"] as const;

const partSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(24)
    .regex(/^[a-z0-9-]+$/, "part ids are lowercase kebab-case"),

  /**
   * What to draw. Split into three cases rather than one string so the schema
   * can reject `motif: "unicorn"` at compose time with a usable message instead
   * of silently rendering nothing — a blank patch on a flyer is the kind of
   * failure nobody reports and everybody sees.
   */
  draw: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("motif"),
      motif: z.enum(MOTIF_NAMES as [MotifName, ...MotifName[]]),
    }),
    z.object({
      kind: z.literal("shape"),
      form: z.enum(SHAPE_FORMS),
      /** Outline instead of fill. A page of solid blobs reads as clip art. */
      outline: z.boolean().default(false),
      sides: z.number().int().min(3).max(12).optional(),
    }),
    z.object({
      kind: z.literal("photo"),
      /** Index into the element's `assets`. */
      slot: z.number().int().min(0).max(5).default(0),
      mask: z.enum(["rect", "circle", "arch", "blob", "torn"]).default("rect"),
    }),
    z.object({
      kind: z.literal("word"),
      text: z.string().min(1).max(24),
    }),
  ]),

  size: z.enum(["tiny", "small", "medium", "large", "huge"]).default("medium"),

  /**
   * Placement, and the only thing the author says about position. Either a spot
   * on the figure itself, or a relationship to a sibling part.
   */
  at: z.union([
    z.object({
      at: z.enum([
        "top-left",
        "top",
        "top-right",
        "left",
        "center",
        "right",
        "bottom-left",
        "bottom",
        "bottom-right",
      ]),
    }),
    z.object({
      of: z.string().min(1),
      side: z.enum([
        "above",
        "below",
        "left-of",
        "right-of",
        "on",
        "top-left-of",
        "top-right-of",
        "bottom-left-of",
        "bottom-right-of",
      ]),
      gap: z.enum(["touching", "tight", "near", "far"]).default("near"),
    }),
  ]),

  tone: z.enum(TONES).default("accent"),
  layer: z.enum(["behind", "with", "front"]).default("with"),
  /** Degrees. A tilt is character, not a position — this one is allowed. */
  rotate: z.number().min(-30).max(30).default(0),
});

export type FigurePart = z.infer<typeof partSchema>;

const figureProps = z.object({
  /**
   * Capped at eight. Not an arbitrary number: past roughly eight marks a
   * figure stops reading as one object and starts reading as a mess, and the
   * whole justification for exempting this from Gate G3 is that it *is* one
   * object. The cap is what keeps that claim honest.
   */
  parts: z.array(partSchema).min(1).max(8),
});

/*
 * There was a `caption` prop here. It positioned itself outside the resolver —
 * straight to a FittedLine at a hand-computed offset — and duly landed off the
 * canvas on a wide evidence box, which is precisely the failure mode the
 * resolver exists to remove. A `word` part says the same thing and goes through
 * the tested placement path, so the second route was deleted rather than
 * patched. One way to place things, or the guarantee is worthless.
 */

/**
 * The ink a composed figure will actually lay down, as flat rects.
 *
 * The solver needs this *before* rendering, because the canvas tone field is
 * what decides whether the eyebrow above this figure gets dark ink or light.
 * The field only ever knew about photographic components, so the first drawn
 * figure that ran under a line of type put solid accent behind grey text and
 * nothing measured it — the same class of bug the tone field was built to end,
 * reintroduced by adding a component that draws.
 *
 * Approximated as each part's bounding rect rather than its true silhouette. A
 * star does not fill its box, so this slightly overstates coverage — which is
 * the safe direction: overstating costs a scrim that was not strictly needed,
 * understating costs an unreadable line.
 */
export function figureInk(
  rawProps: unknown,
  box: { x: number; y: number; w: number; h: number },
  palette: { bg: string; fg: string; accent: string; muted: string },
): { rect: { x: number; y: number; w: number; h: number }; fill: string }[] {
  const parsed = figureProps.safeParse(rawProps);
  if (!parsed.success) return [];

  const inputs: PartInput[] = parsed.data.parts.map((part) => ({
    id: part.id,
    aspect: aspectOf(part),
    size: part.size,
    at: part.at,
    layer: part.layer,
    rotate: part.rotate,
  }));

  let placed: PlacedPart[];
  try {
    placed = resolveParts(inputs, box);
  } catch {
    return [];
  }

  const byId = new Map(parsed.data.parts.map((p) => [p.id, p]));
  return placed.flatMap((rect) => {
    const part = byId.get(rect.id)!;
    // Outlines and open strokes barely tint what is under them; counting them
    // as solid would trigger scrims the page does not need.
    if (part.draw.kind === "shape" && part.draw.outline) return [];
    const fill =
      part.tone === "ink"
        ? palette.fg
        : part.tone === "accent"
          ? palette.accent
          : part.tone === "muted"
            ? palette.muted
            : part.tone === "paper"
              ? palette.bg
              : mix(palette.bg, palette.accent, 0.3);
    return [{ rect: { x: rect.x, y: rect.y, w: rect.w, h: rect.h }, fill }];
  });
}

/** Natural width:height for each thing we can draw. */
function aspectOf(part: FigurePart): number {
  switch (part.draw.kind) {
    case "motif":
      return 1;
    case "word":
      // Roughly the width a short word wants at a readable weight.
      return Math.max(1.2, part.draw.text.length * 0.55);
    case "photo":
      return part.draw.mask === "arch" ? 0.78 : 1;
    case "shape":
      switch (part.draw.form) {
        case "ribbon":
        case "tape":
          return 3.2;
        case "squiggle":
        case "wave":
          return 4;
        case "arch":
          return 0.72;
        case "panel":
          return 1.5;
        default:
          return 1;
      }
  }
}

function colourFor(tone: FigurePart["tone"], theme: Theme, box: { onDark?: boolean; ground?: string }): string {
  switch (tone) {
    case "ink":
      return inkFor(theme, box);
    case "accent":
      return theme.palette.accent;
    case "muted":
      return mutedInkFor(theme, box);
    case "paper":
      return theme.palette.bg;
    case "ground":
      return mix(theme.palette.bg, theme.palette.accent, 0.3);
  }
}

/** The path for a shape part, drawn to fill its resolved rect. */
function shapePath(
  form: (typeof SHAPE_FORMS)[number],
  rect: PlacedPart,
  sides: number,
  rng: RenderContext["rng"],
): string {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const r = Math.min(rect.w, rect.h) / 2;

  switch (form) {
    case "circle":
      return ellipsePath(cx, cy, rect.w / 2, rect.h / 2);
    case "blob":
      return blobPath(cx, cy, rect.w / 2, rect.h / 2, rng);
    case "star":
      return starPath(cx, cy, r, r * 0.45, 5);
    case "sparkle":
      return sparklePath(cx, cy, r);
    case "burst":
      return burstPath(cx, cy, r, r * 0.72, 12);
    case "seal":
      return scallopedCirclePath(cx, cy, r);
    case "ribbon":
      return ribbonPath(rect.x, rect.y, rect.w, rect.h);
    case "polygon":
      return polygonPath(cx, cy, r, sides);
    case "squiggle":
      return squigglePath(rect.x, cy, rect.w, rect.h / 2);
    case "wave":
      return wavePath(rect.x, cy, rect.w, rect.h / 2, rect.w / 3);
    case "tape":
      return tapeStripPath(cx, cy, rect.w, rect.h, 0);
    case "arch":
      return archPath(rect);
    case "panel":
      return roundedRectPath(rect, Math.min(rect.w, rect.h) * 0.08);
    case "torn":
      return tornEdgePath(rect, "bottom", rng);
  }
}

function renderPart(
  part: FigurePart,
  rect: PlacedPart,
  ctx: RenderContext,
): React.ReactElement | null {
  const { theme, box, assets, rng, id } = ctx;
  const fill = colourFor(part.tone, theme, box);
  const key = `${id}-${part.id}`;
  const spin =
    rect.rotate === 0
      ? undefined
      : `rotate(${rect.rotate} ${rect.x + rect.w / 2} ${rect.y + rect.h / 2})`;

  switch (part.draw.kind) {
    case "motif": {
      const motif = MOTIFS[part.draw.motif];
      const size = Math.min(rect.w, rect.h);
      return (
        <g key={key} data-name={key} transform={spin}>
          <g transform={motifTransform(rect.x, rect.y, size, 0)}>
            <path d={motif.d} fill={fill} fillRule="evenodd" />
          </g>
        </g>
      );
    }

    case "shape": {
      const d = shapePath(part.draw.form, rect, part.draw.sides ?? 6, rng);
      const stroke = Math.max(2, Math.min(rect.w, rect.h) * 0.05);
      const open = part.draw.form === "squiggle" || part.draw.form === "wave";
      return (
        <path
          key={key}
          data-name={key}
          d={d}
          transform={spin}
          fill={part.draw.outline || open ? "none" : fill}
          stroke={part.draw.outline || open ? fill : "none"}
          strokeWidth={part.draw.outline || open ? stroke : undefined}
          strokeLinecap={open ? "round" : undefined}
        />
      );
    }

    case "photo": {
      const asset = assets[part.draw.slot];
      const clip = `clip-${key}`;
      const mask = part.draw.mask;
      const d =
        mask === "circle"
          ? ellipsePath(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2)
          : mask === "arch"
            ? archPath(rect)
            : mask === "blob"
              ? blobPath(rect.x + rect.w / 2, rect.y + rect.h / 2, rect.w / 2, rect.h / 2, rng)
              : mask === "torn"
                ? tornEdgePath(rect, "bottom", rng)
                : roundedRectPath(rect, 0);

      // No asset in that slot is a real and common case — the agent composed
      // for three photos and the user supplied two. A tinted silhouette keeps
      // the composition intact instead of punching a hole in it.
      if (!asset) {
        return (
          <path
            key={key}
            data-name={key}
            d={d}
            transform={spin}
            fill={mix(theme.palette.bg, theme.palette.accent, 0.22)}
          />
        );
      }

      const shadow = shadowFor(theme.light, Math.max(rect.w, rect.h), 0.6);
      return (
        <g key={key} data-name={key} transform={spin}>
          <clipPath id={clip}>
            <path d={d} />
          </clipPath>
          <path d={d} transform={`translate(${shadow.dx} ${shadow.dy})`} fill={shadow.fill} />
          <image
            href={asset.href}
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            preserveAspectRatio={focalPreserveAspect(asset)}
            clipPath={`url(#${clip})`}
          />
        </g>
      );
    }

    case "word":
      return (
        <g key={key} data-name={key} transform={spin}>
          <FittedLine
            name={key}
            text={part.draw.text}
            x={rect.x + rect.w / 2}
            y={rect.y + rect.h * 0.72}
            maxWidth={rect.w}
            maxSize={rect.h * 0.9}
            minSize={Math.max(10, rect.h * 0.3)}
            role="display"
            theme={theme}
            fill={fill}
            align="middle"
          />
        </g>
      );
  }
}

const composedFigure: ComponentModule = {
  manifest: {
    id: "composed-figure",
    visual: {
      shape: "freeform",
      aspect: 1,
      density: "medium",
      carriesTone: false,
      reads: "Whatever you assemble — a few drawn marks, motifs, cut photos and short words arranged relative to each other, reading as one drawn object rather than a row of stickers.",
    },
    category: "evidence",
    purpose:
      "A figure you assemble for this one flyer from motifs, shapes, cut-out photos and short words, each placed relative to the figure or to another part ('the balloon top-right of the sun'). Use it when no finished component says what the brief needs — a one-off arrangement, an illustrated scene, a stamp or badge, or simply to give a sparse page real density: it is ONE element against the 4-7 budget but can carry up to eight parts. You describe relationships; the engine computes every coordinate.",
    roles: ["evidence", "support", "structure", "brand"],
    minSize: { w: 200, h: 200 },
    maxSize: { w: 1080, h: 1350 },
    topologies: "any",
    assetSlots: 6,
    motion: "parts settle in declaration order",
  },
  props: figureProps,
  render(ctx) {
    const props = figureProps.parse(ctx.props);
    const { box, id, theme } = ctx;

    const inputs: PartInput[] = props.parts.map((part) => ({
      id: part.id,
      aspect: aspectOf(part),
      size: part.size,
      at: part.at,
      layer: part.layer,
      rotate: part.rotate,
    }));

    // A bad reference or a cycle is an authoring error, and the schema cannot
    // see it because it is cross-field. Failing the element rather than the
    // whole flyer keeps the rest of the composition recoverable.
    let placed: PlacedPart[];
    try {
      placed = resolveParts(inputs, box);
    } catch {
      return <Group name={id}>{null}</Group>;
    }

    const byId = new Map(props.parts.map((p) => [p.id, p]));

    return (
      <Group name={id}>
        {placed.map((rect) => renderPart(byId.get(rect.id)!, rect, ctx))}
      </Group>
    );
  },
};

export const FIGURE_COMPONENTS: ComponentModule[] = [composedFigure];
