import type { ReactElement, ReactNode } from "react";
import { fitText, measureText, metricsFor, wrapText } from "../core/render/fonts.js";
import type { Theme } from "./types.js";
import { ensureContrast, mix, withAlpha } from "../creative/color.js";

/**
 * Shared drawing primitives. Two rules hold everywhere in here:
 *  - text is always <text>/<tspan>, never a path (REQUIREMENTS.md FR-2)
 *  - every group carries a readable name so exported SVG is navigable in Figma
 */


/**
 * The ink a text element should use given what it is sitting on. Dark type on a
 * photograph is invisible, so when the solver has marked a box `onDark` we swap
 * to a light ink and hold it against the plate rather than against the page.
 */
export function inkFor(
  theme: Theme,
  box: { onDark?: boolean; ground?: string },
  fallback?: string,
): string {
  if (!box.onDark) return fallback ?? theme.palette.fg;
  // When the solver knows the exact ground fill, hold contrast against that.
  // The mixed-down foreground is only a stand-in for a photograph, whose real
  // colour we cannot know at this point.
  const plate = box.ground ?? mix(theme.palette.fg, "#000000", 0.5);
  return ensureContrast("#ffffff", plate);
}

/** Muted ink, same rule. */
export function mutedInkFor(theme: Theme, box: { onDark?: boolean; ground?: string }): string {
  if (box.onDark) return withAlpha(inkFor(theme, box), 0.86);
  // Held against whatever the solver measured underneath, not against the page
  // colour. A muted grey that reads on white paper disappears on a photograph,
  // which is how the date and the CTA came out illegible while the headline
  // looked fine.
  return ensureContrast(theme.palette.muted, box.ground ?? theme.palette.bg, true);
}

export function Group({
  name,
  transform,
  opacity,
  children,
}: {
  name: string;
  transform?: string;
  opacity?: number;
  children: ReactNode;
}): ReactElement {
  return (
    <g id={name} data-name={name} transform={transform} opacity={opacity}>
      {children}
    </g>
  );
}

export type TextRole = "display" | "body" | "mono";

export function familyFor(theme: Theme, role: TextRole): string {
  if (role === "display") return theme.fonts.display;
  if (role === "mono") return theme.fonts.mono ?? theme.fonts.body;
  return theme.fonts.body;
}

export function weightFor(theme: Theme, role: TextRole): number {
  if (role === "display") return theme.fonts.weights.display;
  if (role === "mono") return theme.fonts.weights.label;
  return theme.fonts.weights.body;
}

export type TextBlockProps = {
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  role: TextRole;
  theme: Theme;
  fill: string;
  weight?: number;
  tracking?: number;
  lineHeight?: number;
  align?: "start" | "middle" | "end";
  /** Pre-wrapped lines; when absent the block wraps itself at `width`. */
  lines?: string[];
  uppercase?: boolean;
  opacity?: number;
};

/** Wrapped multi-line text anchored at its top-left (not the baseline). */
export function TextBlock(props: TextBlockProps): ReactElement {
  const {
    name,
    text,
    x,
    y,
    width,
    size,
    role,
    theme,
    fill,
    align = "start",
    uppercase = false,
    opacity,
  } = props;
  const family = familyFor(theme, role);
  const weight = props.weight ?? weightFor(theme, role);
  const tracking = props.tracking ?? 0;
  const lineHeight = props.lineHeight ?? 1.1;
  const content = uppercase ? text.toUpperCase() : text;
  const style = { family, weight, size, tracking, lineHeight };
  const lines = props.lines ?? wrapText(content, style, width);
  const { ascent } = metricsFor(style);
  const anchorX = align === "start" ? x : align === "middle" ? x + width / 2 : x + width;

  return (
    <text
      id={name}
      data-name={name}
      x={anchorX}
      y={y + ascent}
      fill={fill}
      fontFamily={family}
      fontSize={size}
      fontWeight={weight}
      letterSpacing={tracking * size}
      textAnchor={align}
      opacity={opacity}
      xmlSpace="preserve"
    >
      {lines.map((line, i) => (
        <tspan key={i} x={anchorX} dy={i === 0 ? 0 : size * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Height a TextBlock will occupy — used by intrinsicHeight implementations. */
export function textBlockHeight(
  text: string,
  theme: Theme,
  role: TextRole,
  size: number,
  width: number,
  opts: { lineHeight?: number; tracking?: number; weight?: number; uppercase?: boolean } = {},
): number {
  const lineHeight = opts.lineHeight ?? 1.1;
  const style = {
    family: familyFor(theme, role),
    weight: opts.weight ?? weightFor(theme, role),
    size,
    tracking: opts.tracking ?? 0,
    lineHeight,
  };
  const content = opts.uppercase ? text.toUpperCase() : text;
  const lines = wrapText(content, style, width);
  const { ascent, descent } = metricsFor(style);
  if (lines.length === 0) return 0;
  return (lines.length - 1) * size * lineHeight + ascent + descent;
}

/** Single line that shrinks until it fits — for labels that must not wrap. */
export function FittedLine({
  name,
  text,
  x,
  y,
  maxWidth,
  maxSize,
  minSize,
  role,
  theme,
  fill,
  weight,
  tracking = 0,
  align = "start",
  uppercase = false,
  opacity,
}: {
  name: string;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  maxSize: number;
  minSize: number;
  role: TextRole;
  theme: Theme;
  fill: string;
  weight?: number;
  tracking?: number;
  align?: "start" | "middle" | "end";
  uppercase?: boolean;
  opacity?: number;
}): ReactElement {
  const content = uppercase ? text.toUpperCase() : text;
  const family = familyFor(theme, role);
  const w = weight ?? weightFor(theme, role);
  let size = maxSize;
  while (size > minSize && measureText(content, { family, weight: w, size, tracking }) > maxWidth) {
    size -= 1;
  }
  return (
    <TextBlock
      name={name}
      text={content}
      lines={[content]}
      x={x}
      y={y}
      width={maxWidth}
      size={size}
      role={role}
      theme={theme}
      fill={fill}
      weight={w}
      tracking={tracking}
      align={align}
      opacity={opacity}
    />
  );
}

export { fitText, measureText, metricsFor, wrapText };

/** Rounded-rect path honouring the material's corner radius. */
export function Panel({
  name,
  x,
  y,
  w,
  h,
  fill,
  stroke,
  strokeWidth,
  radius,
  opacity,
  elevation,
}: {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius: number;
  opacity?: number;
  elevation?: boolean;
}): ReactElement {
  return (
    <g id={name} data-name={name}>
      {elevation ? (
        <rect
          x={x + 3}
          y={y + 6}
          width={w}
          height={h}
          rx={radius}
          ry={radius}
          fill="#000000"
          opacity={0.08}
        />
      ) : null}
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={radius}
        ry={radius}
        fill={fill ?? "none"}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
      />
    </g>
  );
}

/** A straight rule, the workhorse of editorial structure. */
export function Rule({
  name,
  x1,
  y1,
  x2,
  y2,
  stroke,
  strokeWidth,
  dash,
  opacity,
}: {
  name: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  dash?: string;
  opacity?: number;
}): ReactElement {
  return (
    <line
      id={name}
      data-name={name}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeDasharray={dash}
      strokeLinecap="square"
      opacity={opacity}
    />
  );
}

export function clipPathId(id: string): string {
  return `clip-${id}`;
}
