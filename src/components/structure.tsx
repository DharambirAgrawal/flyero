import { z } from "zod";
import type { ReactElement } from "react";
import { FittedLine, Group, Rule } from "./primitives.js";
import type { ComponentModule } from "./types.js";
import { ensureContrast, withAlpha } from "../creative/color.js";

/**
 * Structure components carry the composition itself. They are the ones most at
 * risk of becoming decoration, so every one of them must be justified by a
 * relationship or by the gesture — the banned-list detector checks exactly that.
 */

const gridField: ComponentModule = {
  manifest: {
    id: "grid-field",
    visual: { shape: "grid", aspect: 1, density: "sparse", carriesTone: false, reads: "Faint ruled lines crossing the area at a fixed interval; barely visible on its own, and only earns its place when things line up to it." },
    category: "structure",
    purpose:
      "A measured field the other elements register against. Legitimate only when something actually aligns to it — otherwise it is decoration and will be rejected.",
    roles: ["structure"],
    minSize: { w: 300, h: 300 },
    maxSize: { w: 1080, h: 1350 },
    topologies: ["diagonal-progression", "radial-field", "layered-depth-stack", "framed-evidence"],
    assetSlots: 0,
    motion: "lines draw outward",
  },
  props: z.object({
    columns: z.number().int().min(2).max(12).default(6),
    rows: z.number().int().min(2).max(14).default(8),
    style: z.enum(["lines", "ticks", "dots"]).default("ticks"),
  }),
  render: ({ id, box, theme, props }) => {
    const { columns, rows, style } = props as {
      columns: number;
      rows: number;
      style: "lines" | "ticks" | "dots";
    };
    const color = withAlpha(theme.palette.fg, style === "lines" ? 0.08 : 0.16);
    const sw = theme.material.surface.strokeWidth * 0.6;
    const colW = box.w / columns;
    const rowH = box.h / rows;
    return (
      <Group name={id}>
        {Array.from({ length: columns + 1 }).map((_, i) => {
          const x = box.x + i * colW;
          if (style === "lines") {
            return (
              <Rule key={`c${i}`} name={`${id}-col-${i}`} x1={x} y1={box.y} x2={x} y2={box.y + box.h} stroke={color} strokeWidth={sw} />
            );
          }
          if (style === "ticks") {
            return (
              <Rule key={`c${i}`} name={`${id}-col-${i}`} x1={x} y1={box.y} x2={x} y2={box.y + 12} stroke={color} strokeWidth={sw} />
            );
          }
          return null;
        })}
        {Array.from({ length: rows + 1 }).map((_, i) => {
          const y = box.y + i * rowH;
          if (style === "lines") {
            return (
              <Rule key={`r${i}`} name={`${id}-row-${i}`} x1={box.x} y1={y} x2={box.x + box.w} y2={y} stroke={color} strokeWidth={sw} />
            );
          }
          if (style === "ticks") {
            return (
              <Rule key={`r${i}`} name={`${id}-row-${i}`} x1={box.x} y1={y} x2={box.x + 12} y2={y} stroke={color} strokeWidth={sw} />
            );
          }
          return null;
        })}
        {style === "dots"
          ? Array.from({ length: (columns + 1) * (rows + 1) }).map((_, i) => {
              const cx = box.x + (i % (columns + 1)) * colW;
              const cy = box.y + Math.floor(i / (columns + 1)) * rowH;
              return <circle key={i} cx={cx} cy={cy} r={1.6} fill={color} />;
            })
          : null}
      </Group>
    );
  },
};

const pathConnector: ComponentModule = {
  manifest: {
    id: "path-connector",
    visual: { shape: "line", aspect: 2, density: "sparse", carriesTone: false, reads: "A single drawn line — often curved or dashed — travelling between two points and arriving somewhere on purpose." },
    category: "structure",
    purpose:
      "The line the eye follows through the story. Its endpoint is meaningful — it should arrive somewhere, usually the CTA.",
    roles: ["structure"],
    minSize: { w: 120, h: 60 },
    maxSize: { w: 1080, h: 1350 },
    topologies: "any",
    assetSlots: 0,
    motion: "draws along its length",
  },
  props: z.object({
    /** Normalised waypoints within the element's box. */
    /**
     * Optional, and defaulted, because the solver owns these.
     *
     * They were required — so an agent adding the component its gesture demands
     * was forced to invent coordinates, which is precisely what AGENTS.md law 1
     * forbids and what the solver overwrites a moment later. Requiring a value
     * nobody is allowed to choose is a schema arguing with its own architecture.
     * The default is a placeholder the gesture replaces.
     */
    points: z
      .array(z.object({ x: z.number().min(-0.2).max(1.2), y: z.number().min(-0.2).max(1.2) }))
      .min(2)
      .max(6)
      .default([
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ]),
    curve: z.enum(["straight", "stepped", "curved"]).default("curved"),
    arrow: z.boolean().default(false),
  }),
  render: ({ id, box, theme, props }) => {
    const { points, curve, arrow } = props as {
      points: Array<{ x: number; y: number }>;
      curve: "straight" | "stepped" | "curved";
      arrow: boolean;
    };
    const pts = points.map((p) => ({ x: box.x + p.x * box.w, y: box.y + p.y * box.h }));
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);

    let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!;
      const cur = pts[i]!;
      if (curve === "straight") {
        d += ` L ${cur.x} ${cur.y}`;
      } else if (curve === "stepped") {
        d += ` L ${cur.x} ${prev.y} L ${cur.x} ${cur.y}`;
      } else {
        const mx = (prev.x + cur.x) / 2;
        d += ` C ${mx} ${prev.y}, ${mx} ${cur.y}, ${cur.x} ${cur.y}`;
      }
    }

    const last = pts[pts.length - 1]!;
    const prior = pts[pts.length - 2]!;
    const angle = Math.atan2(last.y - prior.y, last.x - prior.x);
    const head = 13;

    return (
      <Group name={id}>
        <path
          id={`${id}-path`}
          data-name={`${id}-path`}
          d={d}
          fill="none"
          stroke={accent}
          strokeWidth={theme.material.surface.strokeWidth * 1.8}
          strokeLinecap="round"
        />
        {arrow ? (
          <path
            id={`${id}-arrow`}
            data-name={`${id}-arrow`}
            d={`M ${last.x} ${last.y} L ${last.x - head * Math.cos(angle - 0.5)} ${last.y - head * Math.sin(angle - 0.5)} M ${last.x} ${last.y} L ${last.x - head * Math.cos(angle + 0.5)} ${last.y - head * Math.sin(angle + 0.5)}`}
            fill="none"
            stroke={accent}
            strokeWidth={theme.material.surface.strokeWidth * 1.8}
            strokeLinecap="round"
          />
        ) : null}
      </Group>
    );
  },
};

const oversizedLetterform: ComponentModule = {
  manifest: {
    id: "oversized-letterform",
    visual: { shape: "freeform", aspect: 0.8, density: "heavy", carriesTone: false, reads: "One character blown up until it is architecture rather than type, usually bleeding off an edge; other elements lean against it." },
    category: "structure",
    purpose: "One giant character used as architecture. Other elements sit against it, so it is never mere texture.",
    roles: ["structure"],
    minSize: { w: 240, h: 300 },
    maxSize: { w: 1080, h: 1350 },
    topologies: ["oversized-anchor", "layered-depth-stack", "off-center-hero", "split-editorial"],
    assetSlots: 0,
    motion: "drifts slowly",
    textLimits: { character: 2 },
  },
  props: z.object({
    character: z.string().min(1).max(2),
    treatment: z.enum(["solid", "outline", "tinted"]).default("tinted"),
  }),
  render: ({ id, box, theme, props }) => {
    const { character, treatment } = props as { character: string; treatment: "solid" | "outline" | "tinted" };
    const size = Math.min(box.h * 1.18, box.w * 1.5);
    const fill =
      treatment === "solid"
        ? ensureContrast(theme.palette.accent, theme.palette.bg, true)
        : treatment === "tinted"
          ? withAlpha(theme.palette.fg, 0.1)
          : "none";
    return (
      <Group name={id}>
        <text
          id={`${id}-glyph`}
          data-name={`${id}-glyph`}
          x={box.x}
          y={box.y + size * 0.78}
          fontFamily={theme.fonts.display}
          fontSize={size}
          fontWeight={theme.fonts.weights.display}
          fill={fill}
          stroke={treatment === "outline" ? withAlpha(theme.palette.fg, 0.3) : undefined}
          strokeWidth={treatment === "outline" ? theme.material.surface.strokeWidth * 1.4 : undefined}
          letterSpacing={-size * 0.04}
        >
          {character}
        </text>
      </Group>
    );
  },
};

const edgeCropFrame: ComponentModule = {
  manifest: {
    id: "edge-crop-frame",
    visual: { shape: "rectangle", aspect: 1, density: "sparse", carriesTone: false, reads: "A window outline that deliberately cuts whatever is behind it at one edge; you notice the crop, not the frame." },
    category: "structure",
    purpose: "A window the evidence is seen through, deliberately cropping it at one edge.",
    roles: ["structure"],
    minSize: { w: 240, h: 240 },
    maxSize: { w: 1080, h: 1350 },
    topologies: ["framed-evidence", "off-center-hero", "layered-depth-stack", "oversized-anchor"],
    assetSlots: 0,
    motion: "frame expands",
  },
  props: z.object({
    corners: z.enum(["full", "brackets"]).default("brackets"),
  }),
  render: ({ id, box, theme, props }) => {
    const { corners } = props as { corners: "full" | "brackets" };
    const color = withAlpha(theme.palette.fg, 0.4);
    const sw = theme.material.surface.strokeWidth * 1.4;
    const arm = Math.min(box.w, box.h) * 0.16;
    if (corners === "full") {
      return (
        <Group name={id}>
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            rx={theme.material.surface.cornerRadius}
          />
        </Group>
      );
    }
    const corner = (cx: number, cy: number, dx: number, dy: number, key: string) => (
      <path
        key={key}
        d={`M ${cx + dx * arm} ${cy} L ${cx} ${cy} L ${cx} ${cy + dy * arm}`}
        fill="none"
        stroke={color}
        strokeWidth={sw}
      />
    );
    return (
      <Group name={id}>
        {corner(box.x, box.y, 1, 1, "tl")}
        {corner(box.x + box.w, box.y, -1, 1, "tr")}
        {corner(box.x, box.y + box.h, 1, -1, "bl")}
        {corner(box.x + box.w, box.y + box.h, -1, -1, "br")}
      </Group>
    );
  },
};

const ruleLine: ComponentModule = {
  manifest: {
    id: "rule-line",
    visual: { shape: "line", aspect: 20, density: "sparse", carriesTone: false, reads: "One measured line, hairline to heavy, dividing or piercing the page; the cheapest mark that makes a layout look edited." },
    category: "structure",
    purpose: "A single measured rule that divides or pierces. The cheapest way to make a layout feel edited.",
    roles: ["structure"],
    minSize: { w: 80, h: 2 },
    maxSize: { w: 1080, h: 1350 },
    topologies: "any",
    assetSlots: 0,
    motion: "extends",
    textLimits: { label: 24 },
  },
  props: z.object({
    orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
    weight: z.enum(["hair", "medium", "heavy"]).default("medium"),
    label: z.string().max(24).nullable().default(null),
  }),
  render: ({ id, box, theme, props }) => {
    const { orientation, weight, label } = props as {
      orientation: "horizontal" | "vertical";
      weight: "hair" | "medium" | "heavy";
      label: string | null;
    };
    const mult = weight === "hair" ? 0.6 : weight === "medium" ? 1.4 : 3.2;
    const horizontal = orientation === "horizontal";
    return (
      <Group name={id}>
        <Rule
          name={`${id}-line`}
          x1={box.x}
          y1={box.y}
          x2={horizontal ? box.x + box.w : box.x}
          y2={horizontal ? box.y : box.y + box.h}
          stroke={withAlpha(theme.palette.fg, 0.45)}
          strokeWidth={theme.material.surface.strokeWidth * mult}
        />
        {label ? (
          <FittedLine
            name={`${id}-label`}
            text={label}
            x={box.x}
            y={box.y + 10}
            maxWidth={horizontal ? box.w : 160}
            maxSize={12}
            minSize={10}
            role={theme.fonts.mono ? "mono" : "body"}
            theme={theme}
            fill={withAlpha(theme.palette.fg, 0.5)}
            tracking={0.1}
            uppercase
          />
        ) : null}
      </Group>
    );
  },
};

const halftoneField: ComponentModule = {
  manifest: {
    id: "halftone-field",
    visual: { shape: "freeform", aspect: 1, density: "medium", carriesTone: false, reads: "A field of dots graded from dense to sparse; printed-matter texture that can carry a gradient of noise into signal." },
    category: "structure",
    purpose:
      "A graded dot field that gives a printed material its character and can encode a gradient of noise-to-signal.",
    roles: ["structure"],
    minSize: { w: 200, h: 200 },
    maxSize: { w: 1080, h: 1350 },
    topologies: "any",
    assetSlots: 0,
    motion: "dots resolve",
  },
  props: z.object({
    direction: z.enum(["to-right", "to-bottom", "radial"]).default("to-right"),
    density: z.number().int().min(8).max(40).default(20),
  }),
  render: ({ id, box, theme, props }) => {
    const { direction, density } = props as {
      direction: "to-right" | "to-bottom" | "radial";
      density: number;
    };
    const step = Math.max(box.w, box.h) / density;
    const cols = Math.ceil(box.w / step);
    const rows = Math.ceil(box.h / step);
    const color = withAlpha(theme.palette.fg, 0.5);
    const dots: ReactElement[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const nx = cols > 1 ? c / (cols - 1) : 0;
        const ny = rows > 1 ? r / (rows - 1) : 0;
        let t: number;
        if (direction === "to-right") t = 1 - nx;
        else if (direction === "to-bottom") t = 1 - ny;
        else t = 1 - Math.min(1, Math.hypot(nx - 0.5, ny - 0.5) * 2);
        const radius = Math.max(0, t * step * 0.42);
        if (radius < 0.35) continue;
        dots.push(
          <circle
            key={`${r}-${c}`}
            cx={box.x + c * step + step / 2}
            cy={box.y + r * step + step / 2}
            r={radius}
            fill={color}
          />,
        );
      }
    }
    return <Group name={id}>{dots}</Group>;
  },
};

const waypointMarker: ComponentModule = {
  manifest: {
    id: "waypoint-marker",
    visual: { shape: "circle-row", aspect: 1.4, density: "sparse", carriesTone: false, reads: "A small dot or pin with a short label beside it; a single labelled point on a route." },
    category: "structure",
    purpose: "A labelled point on a route — the cartography metaphor's vocabulary.",
    roles: ["structure", "support"],
    minSize: { w: 60, h: 60 },
    maxSize: { w: 320, h: 200 },
    topologies: "any",
    assetSlots: 0,
    motion: "pulses once",
    textLimits: { label: 22 },
  },
  props: z.object({
    label: z.string().max(22).nullable().default(null),
    kind: z.enum(["origin", "waypoint", "destination"]).default("waypoint"),
  }),
  render: ({ id, box, theme, props }) => {
    const { label, kind } = props as { label: string | null; kind: "origin" | "waypoint" | "destination" };
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
    const cx = box.x + 14;
    const cy = box.y + 14;
    return (
      <Group name={id}>
        {kind === "destination" ? (
          <>
            <circle cx={cx} cy={cy} r={13} fill="none" stroke={accent} strokeWidth={theme.material.surface.strokeWidth * 1.6} />
            <circle cx={cx} cy={cy} r={5} fill={accent} />
          </>
        ) : kind === "origin" ? (
          <circle cx={cx} cy={cy} r={7} fill="none" stroke={withAlpha(theme.palette.fg, 0.6)} strokeWidth={theme.material.surface.strokeWidth * 1.6} />
        ) : (
          <circle cx={cx} cy={cy} r={4.5} fill={withAlpha(theme.palette.fg, 0.55)} />
        )}
        {label ? (
          <FittedLine
            name={`${id}-label`}
            text={label}
            x={box.x + 30}
            y={box.y + 5}
            maxWidth={Math.max(60, box.w - 30)}
            maxSize={13}
            minSize={10}
            role={theme.fonts.mono ? "mono" : "body"}
            theme={theme}
            fill={withAlpha(theme.palette.fg, 0.7)}
            tracking={0.06}
            uppercase
          />
        ) : null}
      </Group>
    );
  },
};

export const STRUCTURE_COMPONENTS: ComponentModule[] = [
  gridField,
  pathConnector,
  oversizedLetterform,
  edgeCropFrame,
  ruleLine,
  halftoneField,
  waypointMarker,
];
