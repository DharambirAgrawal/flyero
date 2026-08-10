import type { ReactElement, ReactNode } from "react";
import { fitText, measureText, metricsFor, wrapText } from "../core/render/fonts.js";
import type { Theme } from "./types.js";
import { ensureContrast, mix, withAlpha } from "../creative/color.js";
import { shadowFor, type LightSource } from "../core/canvas/light.js";

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
  box: { onDark?: boolean; ground?: string; fontSize?: number },
  fallback?: string,
): string {
  const large = (box.fontSize ?? 0) >= 32;
  if (!box.onDark) {
    const base = fallback ?? theme.palette.fg;
    return box.ground ? ensureContrast(base, box.ground, large) : base;
  }
  // When the solver knows the exact ground fill, hold contrast against that.
  // The mixed-down foreground is only a stand-in for a photograph, whose real
  // colour we cannot know at this point.
  const plate = box.ground ?? mix(theme.palette.fg, "#000000", 0.5);
  return ensureContrast("#ffffff", plate, large);
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
  /** Bypasses `familyFor(theme, role)` — see the same param on `FittedLine`. */
  family?: string;
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
  const family = props.family ?? familyFor(theme, role);
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
  family: familyOverride,
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
  /** Bypasses `familyFor(theme, role)` — for the rare case a caller needs a specific family the role lookup can't name (a font pair's optional `accent` register). */
  family?: string;
  tracking?: number;
  align?: "start" | "middle" | "end";
  uppercase?: boolean;
  opacity?: number;
}): ReactElement {
  const content = uppercase ? text.toUpperCase() : text;
  const family = familyOverride ?? familyFor(theme, role);
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
      family={family}
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
  light,
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
  /**
   * The poster's single light. Passed rather than assumed: this used to offset
   * a black rect by a hardcoded (3, 6) regardless of where anything else was
   * lit from, which is exactly what makes composited elements look pasted.
   */
  light?: LightSource;
}): ReactElement {
  const shadow = elevation && light ? shadowFor(light, Math.max(w, h), 0.8) : null;
  return (
    <g id={name} data-name={name}>
      {shadow ? (
        <>
          <defs>
            <filter id={`sh-${name}`} x="-25%" y="-25%" width="150%" height="150%">
              <feGaussianBlur stdDeviation={shadow.blur} />
            </filter>
          </defs>
          <rect
            x={x + shadow.dx}
            y={y + shadow.dy}
            width={w}
            height={h}
            rx={radius}
            ry={radius}
            fill={shadow.fill}
            filter={`url(#sh-${name})`}
          />
        </>
      ) : elevation ? (
        // No light supplied: draw nothing rather than an arbitrary shadow that
        // disagrees with the rest of the page.
        null
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
