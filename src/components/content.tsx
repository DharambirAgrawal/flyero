import { z } from "zod";
import QRCode from "qrcode";
import { FittedLine, Group, Panel, Rule, TextBlock, textBlockHeight, fitText, inkFor, measureText, metricsFor, mutedInkFor } from "./primitives.js";
import type { ComponentModule } from "./types.js";
import { ensureContrast, mix, withAlpha } from "../creative/color.js";
import { arcGuideId, arcTextPath } from "./shapes.js";

/** Content components: the words. Eight modules, each professional on its own. */

const headlineBlock: ComponentModule = {
  manifest: {
    id: "headline-block",
    category: "content",
    purpose:
      "The primary message. Sized by the solver to be the loudest typographic object unless an oversized anchor outranks it.",
    roles: ["message"],
    minSize: { w: 320, h: 90 },
    maxSize: { w: 1080, h: 620 },
    topologies: "any",
    assetSlots: 0,
    motion: "lines rise and settle, staggered by 60ms",
    textLimits: { headline: 90 },
  },
  props: z.object({
    align: z.enum(["start", "middle", "end"]).default("start"),
    /** Word the typography behaviour may set apart; must appear in the headline. */
    loudWord: z.string().nullable().default(null),
    /**
     * How the type itself is drawn. Chosen from a fixed set, so this is a
     * design decision the Composer may make — it is not placing pixels.
     * `arch` sets the line along a curve using <textPath>, which keeps it real
     * <text> and preserves the SVG editability guarantee.
     */
    treatment: z.enum(["plain", "outline", "shadow", "arch", "plate", "band"]).default("plain"),
  }),
  intrinsicHeight: (props, theme, width) => {
    const size = Math.min(140, width * 0.16) * theme.typography.headlineScale;
    return textBlockHeight("Mm", theme, "display", size, width, {
      lineHeight: theme.typography.lineHeight,
    });
  },
  render: ({ id, box, theme, copy, props }) => {
    const { align, loudWord, treatment } = props as {
      align: "start" | "middle" | "end";
      loudWord: string | null;
      treatment: "plain" | "outline" | "shadow" | "arch" | "plate" | "band";
    };
    const size = box.fontSize ?? 96;
    const lines = box.lines ?? [copy.headline];
    const quietMode = theme.typography.id === "quiet-with-one-loud-word" && loudWord;

    if (quietMode) {
      // One word carries the accent; the rest stays in the foreground colour.
      const family = theme.fonts.display;
      const weight = theme.fonts.weights.display;
      return (
        <Group name={id}>
          {lines.map((line, i) => {
            const idx = line.toLowerCase().indexOf(loudWord!.toLowerCase());
            const y = box.y + i * size * theme.typography.lineHeight;
            if (idx === -1) {
              return (
                <TextBlock
                  key={i}
                  name={`${id}-line-${i + 1}`}
                  text={line}
                  lines={[line]}
                  x={box.x}
                  y={y}
                  width={box.w}
                  size={size}
                  role="display"
                  theme={theme}
                  fill={inkFor(theme, box)}
                  tracking={theme.typography.tracking}
                  lineHeight={theme.typography.lineHeight}
                  align={align}
                />
              );
            }
            const before = line.slice(0, idx);
            const word = line.slice(idx, idx + loudWord!.length);
            const after = line.slice(idx + loudWord!.length);
            const offset = measureText(before, { family, weight, size, tracking: theme.typography.tracking });
            const wordW = measureText(word, { family, weight, size, tracking: theme.typography.tracking });
            return (
              <Group key={i} name={`${id}-line-${i + 1}`}>
                {before ? (
                  <TextBlock
                    name={`${id}-line-${i + 1}-a`}
                    text={before}
                    lines={[before]}
                    x={box.x}
                    y={y}
                    width={box.w}
                    size={size}
                    role="display"
                    theme={theme}
                    fill={inkFor(theme, box)}
                    tracking={theme.typography.tracking}
                    lineHeight={theme.typography.lineHeight}
                  />
                ) : null}
                <TextBlock
                  name={`${id}-line-${i + 1}-loud`}
                  text={word}
                  lines={[word]}
                  x={box.x + offset}
                  y={y}
                  width={box.w}
                  size={size}
                  role="display"
                  theme={theme}
                  fill={ensureContrast(theme.palette.accent, theme.palette.bg)}
                  tracking={theme.typography.tracking}
                  lineHeight={theme.typography.lineHeight}
                />
                {after ? (
                  <TextBlock
                    name={`${id}-line-${i + 1}-b`}
                    text={after}
                    lines={[after]}
                    x={box.x + offset + wordW}
                    y={y}
                    width={box.w}
                    size={size}
                    role="display"
                    theme={theme}
                    fill={inkFor(theme, box)}
                    tracking={theme.typography.tracking}
                    lineHeight={theme.typography.lineHeight}
                  />
                ) : null}
              </Group>
            );
          })}
        </Group>
      );
    }

    if (theme.typography.id === "stacked-contrast" && lines.length > 1) {
      // Alternating scale between lines, flush to the block's edge.
      let y = box.y;
      return (
        <Group name={id}>
          {lines.map((line, i) => {
            const lineSize = i % 2 === 0 ? size : size * 0.78;
            const el = (
              <TextBlock
                key={i}
                name={`${id}-line-${i + 1}`}
                text={line}
                lines={[line]}
                x={box.x}
                y={y}
                width={box.w}
                size={lineSize}
                role="display"
                theme={theme}
                fill={inkFor(theme, box)}
                tracking={theme.typography.tracking}
                lineHeight={theme.typography.lineHeight}
                align={align}
              />
            );
            y += lineSize * theme.typography.lineHeight;
            return el;
          })}
        </Group>
      );
    }

    // ── Type treatments ──────────────────────────────────────────────────────
    // These run before the default branch but after the typography behaviours,
    // which have their own reasons for laying lines out the way they do.
    /**
     * `plate` and `band` set the headline on a solid colour block.
     *
     * This is the device nearly every reference poster uses and the library had
     * no way to express: a saturated block over the photograph, type reversed
     * out of it. It is what turns "stock photo with a caption" into a
     * composition, and because it is a *treatment* rather than an element it
     * costs nothing against the 4-7 budget Gate G3 enforces.
     *
     * `plate` hugs each line; `band` runs the full width of the box.
     */
    if (treatment === "plate" || treatment === "band") {
      const family = theme.fonts.display;
      const weight = theme.fonts.weights.display;
      const block = ensureContrast(theme.palette.accent, theme.palette.bg, true);
      const ink = ensureContrast("#ffffff", block) === "#ffffff" ? "#ffffff" : theme.palette.bg;
      const padX = size * 0.22;
      const padY = size * 0.12;
      const lh = theme.typography.lineHeight;
      // The plate is sized to the *ink*, not to the line box. Using
      // size * lineHeight made the block far taller than the letters and hung
      // the descenders out below its bottom edge.
      const { ascent, descent } = metricsFor({
        family,
        weight,
        size,
        tracking: theme.typography.tracking,
        lineHeight: lh,
      });
      // fontkit's ascent includes internal leading, which on a display face is
      // generous — using it whole left a band of colour above the capitals as
      // tall as the letters themselves. Cap height is ~0.72 of the em for the
      // faces in this library, and that is what the eye reads as the top edge.
      const capHeight = size * 0.72;
      const plateH = capHeight + descent + padY * 2;

      return (
        <Group name={id}>
          {lines.map((line, i) => {
            const w =
              treatment === "band"
                ? box.w
                : measureText(line, { family, weight, size, tracking: theme.typography.tracking }) + padX * 2;
            const y = box.y + i * size * lh;
            const x = align === "end" ? box.x + box.w - w : align === "middle" ? box.x + (box.w - w) / 2 : box.x;
            return (
              <Group key={i} name={`${id}-line-${i + 1}`}>
                <rect x={x} y={y} width={w} height={plateH} fill={block} />
                <text
                  x={x + padX}
                  y={y + padY + capHeight}
                  fill={ink}
                  fontFamily={family}
                  fontSize={size}
                  fontWeight={weight}
                  letterSpacing={theme.typography.tracking * size}
                  xmlSpace="preserve"
                >
                  {line}
                </text>
              </Group>
            );
          })}
        </Group>
      );
    }

    if (treatment !== "plain") {
      const family = theme.fonts.display;
      const weight = theme.fonts.weights.display;
      const ink = inkFor(theme, box);
      const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
      const anchorX = align === "start" ? box.x : align === "middle" ? box.x + box.w / 2 : box.x + box.w;

      if (treatment === "arch") {
        // One curved line. Arching wrapped text reads as a mistake, so the
        // lines are joined and the curve is sized to the block.
        const text = lines.join(" ");
        const radius = Math.max(box.w * 0.62, size * 2.4);
        const guide = arcGuideId(id);
        return (
          <Group name={id}>
            <defs>
              <path
                id={guide}
                d={arcTextPath(box.x + box.w / 2, box.y + size * 0.2, radius, { direction: "down" })}
                fill="none"
              />
            </defs>
            <text
              id={`${id}-line-1`}
              data-name={`${id}-line-1`}
              fill={ink}
              fontFamily={family}
              fontSize={size}
              fontWeight={weight}
              letterSpacing={theme.typography.tracking * size}
              xmlSpace="preserve"
            >
              <textPath href={`#${guide}`} startOffset="50%" textAnchor="middle">
                {text}
              </textPath>
            </text>
          </Group>
        );
      }

      const { ascent } = metricsFor({
        family,
        weight,
        size,
        tracking: theme.typography.tracking,
        lineHeight: theme.typography.lineHeight,
      });

      return (
        <Group name={id}>
          {lines.map((line, i) => {
            const y = box.y + i * size * theme.typography.lineHeight + ascent;
            const common = {
              x: anchorX,
              y,
              fontFamily: family,
              fontSize: size,
              fontWeight: weight,
              letterSpacing: theme.typography.tracking * size,
              textAnchor: align,
              xmlSpace: "preserve" as const,
            };
            return (
              <Group key={i} name={`${id}-line-${i + 1}`}>
                {treatment === "shadow" ? (
                  // A hard offset copy in the accent — the poster device, not a
                  // blur. Drawn first so the real line sits on top of it. The
                  // offset has to clear the stroke weight or it reads as a
                  // colour fringe on the glyph edge rather than as a shadow.
                  <text {...common} x={anchorX + size * 0.11} y={y + size * 0.115} fill={accent}>
                    {line}
                  </text>
                ) : null}
                <text
                  {...common}
                  fill={treatment === "outline" ? "none" : ink}
                  stroke={treatment === "outline" ? ink : undefined}
                  strokeWidth={treatment === "outline" ? Math.max(1.5, size * 0.022) : undefined}
                >
                  {line}
                </text>
              </Group>
            );
          })}
        </Group>
      );
    }

    const baselineBreak = theme.typography.id === "baseline-broken" && lines.length > 1;
    return (
      <Group name={id}>
        {lines.map((line, i) => (
          <TextBlock
            key={i}
            name={`${id}-line-${i + 1}`}
            text={line}
            lines={[line]}
            x={box.x + (baselineBreak && i === 1 ? size * 0.28 : 0)}
            y={box.y + i * size * theme.typography.lineHeight}
            width={box.w}
            size={size}
            role="display"
            theme={theme}
            fill={inkFor(theme, box)}
            tracking={theme.typography.tracking}
            lineHeight={theme.typography.lineHeight}
            align={align}
          />
        ))}
      </Group>
    );
  },
};

const eyebrowLabel: ComponentModule = {
  manifest: {
    id: "eyebrow-label",
    category: "content",
    purpose: "A short label above the headline that names the category or the moment. Never a slogan.",
    roles: ["support", "brand"],
    minSize: { w: 160, h: 22 },
    maxSize: { w: 900, h: 48 },
    topologies: "any",
    assetSlots: 0,
    motion: "fades in first",
    textLimits: { eyebrow: 42 },
  },
  props: z.object({
    rule: z.boolean().default(true),
  }),
  intrinsicHeight: (_props, _theme, _width) => 34,
  render: ({ id, box, theme, copy, props }) => {
    const { rule } = props as { rule: boolean };
    const text = copy.eyebrow ?? "";
    if (!text) return <Group name={id}>{null}</Group>;
    const size = Math.min(box.h * 0.62, 22);
    const color = mutedInkFor(theme, box);
    const width = measureText(text.toUpperCase(), {
      family: theme.fonts.mono ?? theme.fonts.body,
      weight: theme.fonts.weights.label,
      size,
      tracking: 0.12,
    });
    return (
      <Group name={id}>
        <FittedLine
          name={`${id}-text`}
          text={text}
          x={box.x}
          y={box.y}
          maxWidth={box.w}
          maxSize={size}
          minSize={11}
          role={theme.fonts.mono ? "mono" : "body"}
          theme={theme}
          fill={color}
          weight={theme.fonts.weights.label}
          tracking={0.12}
          uppercase
        />
        {rule ? (
          <Rule
            name={`${id}-rule`}
            x1={box.x + Math.min(width + 16, box.w)}
            y1={box.y + size * 0.62}
            x2={box.x + box.w}
            y2={box.y + size * 0.62}
            stroke={withAlpha(theme.palette.muted, 0.5)}
            strokeWidth={theme.material.surface.strokeWidth * 0.75}
          />
        ) : null}
      </Group>
    );
  },
};

const bodyParagraph: ComponentModule = {
  manifest: {
    id: "body-paragraph",
    category: "content",
    purpose: "One short paragraph of specific, human supporting copy. Optional — omit it when the picture says enough.",
    roles: ["support"],
    minSize: { w: 260, h: 48 },
    maxSize: { w: 760, h: 260 },
    topologies: "any",
    assetSlots: 0,
    motion: "fades in after the headline",
    textLimits: { body: 180 },
  },
  props: z.object({
    maxLines: z.number().int().min(1).max(6).default(4),
  }),
  intrinsicHeight: (props, theme, width) => {
    const { maxLines } = props as { maxLines: number };
    return Math.min(maxLines, 4) * 26 * 1.45;
  },
  render: ({ id, box, theme, copy }) => {
    const text = copy.body ?? "";
    if (!text) return <Group name={id}>{null}</Group>;
    const fit = fitText(
      text,
      { family: theme.fonts.body, weight: theme.fonts.weights.body, tracking: 0, lineHeight: 1.45 },
      { w: box.w, h: box.h },
      { min: 15, max: 26, maxLines: 5, lineHeight: 1.45 },
    );
    return (
      <Group name={id}>
        <TextBlock
          name={`${id}-text`}
          text={text}
          lines={fit.lines}
          x={box.x}
          y={box.y}
          width={box.w}
          size={fit.size}
          role="body"
          theme={theme}
          fill={inkFor(theme, box)}
          lineHeight={1.45}
        />
      </Group>
    );
  },
};

const benefitList: ComponentModule = {
  manifest: {
    id: "benefit-list",
    category: "content",
    purpose: "Two to four concrete benefits as short lines with markers. Use only when the benefits are specific.",
    roles: ["support"],
    minSize: { w: 260, h: 90 },
    maxSize: { w: 620, h: 340 },
    topologies: "any",
    assetSlots: 0,
    motion: "items reveal in sequence",
    textLimits: { items: 52 },
  },
  props: z.object({
    items: z.array(z.string().max(52)).min(2).max(4),
    marker: z.enum(["rule", "index", "dot"]).default("rule"),
  }),
  intrinsicHeight: (props) => {
    const { items } = props as { items: string[] };
    return items.length * 46;
  },
  render: ({ id, box, theme, props }) => {
    const { items, marker } = props as { items: string[]; marker: "rule" | "index" | "dot" };
    const rowH = Math.min(box.h / items.length, 56);
    const size = Math.min(rowH * 0.42, 21);
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
    const indent = marker === "index" ? 44 : 28;
    return (
      <Group name={id}>
        {items.map((item, i) => {
          const y = box.y + i * rowH;
          return (
            <Group key={i} name={`${id}-item-${i + 1}`}>
              {marker === "rule" ? (
                <Rule
                  name={`${id}-marker-${i + 1}`}
                  x1={box.x}
                  y1={y + size * 0.72}
                  x2={box.x + 16}
                  y2={y + size * 0.72}
                  stroke={accent}
                  strokeWidth={theme.material.surface.strokeWidth * 1.4}
                />
              ) : marker === "dot" ? (
                <circle
                  id={`${id}-marker-${i + 1}`}
                  data-name={`${id}-marker-${i + 1}`}
                  cx={box.x + 6}
                  cy={y + size * 0.68}
                  r={5}
                  fill={accent}
                />
              ) : (
                <TextBlock
                  name={`${id}-marker-${i + 1}`}
                  text={String(i + 1).padStart(2, "0")}
                  lines={[String(i + 1).padStart(2, "0")]}
                  x={box.x}
                  y={y}
                  width={36}
                  size={size * 0.85}
                  role={theme.fonts.mono ? "mono" : "body"}
                  theme={theme}
                  fill={accent}
                  weight={theme.fonts.weights.label}
                />
              )}
              <TextBlock
                name={`${id}-text-${i + 1}`}
                text={item}
                x={box.x + indent}
                y={y}
                width={box.w - indent}
                size={size}
                role="body"
                theme={theme}
                fill={inkFor(theme, box)}
                lineHeight={1.3}
              />
            </Group>
          );
        })}
      </Group>
    );
  },
};

/** The mandatory quiet zone around a QR, in px. Scanners need it. */
const QR_QUIET = 6;

/** QR modules are generated synchronously so rendering stays a pure function. */
function qrMatrix(text: string): boolean[][] {
  const qr = (QRCode as any).create(text, { errorCorrectionLevel: "M" });
  const size: number = qr.modules.size;
  const data: Uint8Array = qr.modules.data;
  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(data[y * size + x] === 1);
    rows.push(row);
  }
  return rows;
}

const ctaButton: ComponentModule = {
  manifest: {
    id: "cta-button",
    category: "content",
    purpose:
      "The action. Carries the label, the URL and optionally a scannable QR — it is a flyer, so the CTA must work in the physical world.",
    roles: ["cta"],
    minSize: { w: 220, h: 56 },
    maxSize: { w: 760, h: 220 },
    topologies: "any",
    assetSlots: 0,
    motion: "underline draws left to right",
    textLimits: { label: 34 },
  },
  props: z.object({
    style: z.enum(["underlined", "solid", "bracketed"]).default("underlined"),
  }),
  intrinsicHeight: (props, _theme, _width) => {
    const { style } = props as { style: string };
    return style === "solid" ? 72 : 84;
  },
  render: ({ id, box, theme, copy, props }) => {
    const { style } = props as { style: "underlined" | "solid" | "bracketed" };
    const accent = theme.palette.accent;
    const label = copy.cta.label;
    const url = copy.cta.url;
    const showQr = copy.cta.qr && Boolean(url);
    const qrSize = showQr ? Math.min(box.h, 116) : 0;
    const textW = box.w - (showQr ? qrSize + 22 : 0);
    const labelSize = Math.min(34, textW * 0.09 + 16);
    const onAccent = ensureContrast("#ffffff", accent) === "#ffffff" ? "#ffffff" : "#111111";

    const qr = showQr && url ? qrMatrix(url) : null;
    const cell = qr ? qrSize / qr.length : 0;

    return (
      <Group name={id}>
        {style === "solid" ? (
          <>
            <Panel
              name={`${id}-plate`}
              x={box.x}
              y={box.y}
              w={textW}
              h={Math.min(box.h, 72)}
              fill={accent}
              radius={theme.material.surface.cornerRadius}
              elevation={theme.material.surface.elevation}
          light={theme.light}
            />
            <FittedLine
              name={`${id}-label`}
              text={label}
              x={box.x + 24}
              y={box.y + Math.min(box.h, 72) / 2 - labelSize * 0.62}
              maxWidth={textW - 48}
              maxSize={labelSize}
              minSize={16}
              role="body"
              theme={theme}
              fill={onAccent}
              weight={theme.fonts.weights.label}
            />
          </>
        ) : (
          <>
            <FittedLine
              name={`${id}-label`}
              text={label}
              x={box.x + (style === "bracketed" ? 18 : 0)}
              y={box.y}
              maxWidth={textW - (style === "bracketed" ? 36 : 0)}
              maxSize={labelSize}
              minSize={16}
              role="body"
              theme={theme}
              fill={inkFor(theme, box)}
              weight={theme.fonts.weights.label}
            />
            <Rule
              name={`${id}-underline`}
              x1={box.x}
              y1={box.y + labelSize * 1.45}
              x2={box.x + Math.min(textW, 420)}
              y2={box.y + labelSize * 1.45}
              stroke={ensureContrast(accent, theme.palette.bg, true)}
              strokeWidth={theme.material.surface.strokeWidth * 2.2}
            />
            {style === "bracketed" ? (
              <>
                <Rule
                  name={`${id}-bracket-l`}
                  x1={box.x}
                  y1={box.y - 4}
                  x2={box.x}
                  y2={box.y + labelSize * 1.35}
                  stroke={ensureContrast(accent, theme.palette.bg, true)}
                  strokeWidth={theme.material.surface.strokeWidth * 1.6}
                />
                <Rule
                  name={`${id}-bracket-r`}
                  x1={box.x + Math.min(textW, 420)}
                  y1={box.y - 4}
                  x2={box.x + Math.min(textW, 420)}
                  y2={box.y + labelSize * 1.35}
                  stroke={ensureContrast(accent, theme.palette.bg, true)}
                  strokeWidth={theme.material.surface.strokeWidth * 1.6}
                />
              </>
            ) : null}
          </>
        )}
        {url ? (
          <FittedLine
            name={`${id}-url`}
            text={url.replace(/^https?:\/\//, "")}
            x={box.x + (style === "solid" ? 0 : 0)}
            y={box.y + (style === "solid" ? Math.min(box.h, 72) + 12 : labelSize * 1.45 + 14)}
            maxWidth={textW}
            maxSize={17}
            minSize={12}
            role={theme.fonts.mono ? "mono" : "body"}
            theme={theme}
            fill={mutedInkFor(theme, box)}
            weight={theme.fonts.weights.body}
          />
        ) : null}
        {qr ? (
          <Group name={`${id}-qr`}>
            {/*
              A QR is a machine target before it is a graphic. Its modules and
              its backing must be a fixed high-contrast pair, never the theme
              ink: on a photographic ground `inkFor` returns white, which was
              being drawn on the light `bg` backing — an unscannable code that
              rendered as a blank square. The quiet zone is part of the spec,
              not padding, so it is drawn explicitly.
            */}
            <rect
              x={box.x + box.w - qrSize - QR_QUIET}
              y={box.y - QR_QUIET}
              width={qrSize + QR_QUIET * 2}
              height={qrSize + QR_QUIET * 2}
              rx={2}
              fill="#ffffff"
            />
            {qr.flatMap((row, y) =>
              row.map((on, x) =>
                on ? (
                  <rect
                    key={`${x}-${y}`}
                    x={box.x + box.w - qrSize + x * cell}
                    y={box.y + y * cell}
                    width={cell + 0.4}
                    height={cell + 0.4}
                    fill="#111111"
                  />
                ) : null,
              ),
            )}
          </Group>
        ) : null}
      </Group>
    );
  },
};

const footerLockup: ComponentModule = {
  manifest: {
    id: "footer-lockup",
    category: "content",
    purpose: "Product name (or logo asset) plus one line of context, sitting quietly at an edge.",
    roles: ["brand"],
    minSize: { w: 200, h: 34 },
    maxSize: { w: 960, h: 120 },
    topologies: "any",
    assetSlots: 1,
    motion: "static",
    textLimits: { tagline: 48 },
  },
  props: z.object({
    tagline: z.string().max(48).nullable().default(null),
    // "middle" is required: `radial-field` centres every slot including brand,
    // and the solver passes the recipe's alignment straight through. Omitting it
    // made that topology throw for any flyer using this component.
    align: z.enum(["start", "middle", "end"]).default("start"),
  }),
  intrinsicHeight: () => 46,
  render: ({ id, box, theme, productName, props, assets }) => {
    const { tagline, align } = props as { tagline: string | null; align: "start" | "middle" | "end" };
    const logo = assets[0];
    const size = Math.min(box.h * 0.5, 26);
    return (
      <Group name={id}>
        {logo ? (
          <image
            id={`${id}-logo`}
            data-name={`${id}-logo`}
            href={logo.href}
            x={
              align === "start"
                ? box.x
                : align === "middle"
                  ? box.x + (box.w - Math.min(box.h * 2.6, 150)) / 2
                  : box.x + box.w - Math.min(box.h * 2.6, 150)
            }
            y={box.y}
            width={Math.min(box.h * 2.6, 150)}
            height={box.h * 0.72}
            preserveAspectRatio="xMinYMid meet"
          />
        ) : (
          <FittedLine
            name={`${id}-name`}
            text={productName}
            x={box.x}
            y={box.y}
            maxWidth={box.w}
            maxSize={size}
            minSize={14}
            role="display"
            theme={theme}
            fill={inkFor(theme, box)}
            weight={theme.fonts.weights.display}
            align={align}
          />
        )}
        {tagline ? (
          <FittedLine
            name={`${id}-tagline`}
            text={tagline}
            x={box.x}
            y={box.y + size * 1.5}
            maxWidth={box.w}
            maxSize={16}
            minSize={12}
            role="body"
            theme={theme}
            fill={mutedInkFor(theme, box)}
            align={align}
          />
        ) : null}
      </Group>
    );
  },
};

const quoteBlock: ComponentModule = {
  manifest: {
    id: "quote-block",
    category: "content",
    purpose:
      "A short verbatim line in the user's own voice. Only usable when the brief supplies real words — never invented testimony.",
    roles: ["support", "message"],
    minSize: { w: 300, h: 110 },
    maxSize: { w: 760, h: 340 },
    topologies: "any",
    assetSlots: 0,
    motion: "typewriter reveal",
    textLimits: { text: 120 },
  },
  props: z.object({
    text: z.string().max(120),
    attribution: z.string().max(40).nullable().default(null),
  }),
  intrinsicHeight: (props, theme, width) => {
    const { text } = props as { text: string };
    return textBlockHeight(text, theme, "display", 34, width, { lineHeight: 1.25 }) + 30;
  },
  render: ({ id, box, theme, props }) => {
    const { text, attribution } = props as { text: string; attribution: string | null };
    const fit = fitText(
      text,
      { family: theme.fonts.display, weight: theme.fonts.weights.display, tracking: -0.01, lineHeight: 1.22 },
      { w: box.w - 26, h: box.h - 30 },
      { min: 20, max: 40, maxLines: 4, lineHeight: 1.22 },
    );
    return (
      <Group name={id}>
        <Rule
          name={`${id}-bar`}
          x1={box.x}
          y1={box.y}
          x2={box.x}
          y2={box.y + fit.height}
          stroke={ensureContrast(theme.palette.accent, theme.palette.bg, true)}
          strokeWidth={theme.material.surface.strokeWidth * 2}
        />
        <TextBlock
          name={`${id}-text`}
          text={text}
          lines={fit.lines}
          x={box.x + 22}
          y={box.y}
          width={box.w - 26}
          size={fit.size}
          role="display"
          theme={theme}
          fill={inkFor(theme, box)}
          lineHeight={1.22}
        />
        {attribution ? (
          <FittedLine
            name={`${id}-attribution`}
            text={attribution}
            x={box.x + 22}
            y={box.y + fit.height + 12}
            maxWidth={box.w - 26}
            maxSize={16}
            minSize={12}
            role="body"
            theme={theme}
            fill={mutedInkFor(theme, box)}
          />
        ) : null}
      </Group>
    );
  },
};

const bigNumeral: ComponentModule = {
  manifest: {
    id: "big-numeral",
    category: "content",
    purpose:
      "One number set very large with a short caption. Only for figures the user supplied — never an invented statistic.",
    roles: ["support", "message"],
    minSize: { w: 200, h: 140 },
    maxSize: { w: 720, h: 520 },
    topologies: "any",
    assetSlots: 0,
    motion: "counts up",
    textLimits: { value: 8, caption: 44 },
  },
  props: z.object({
    value: z.string().max(8),
    caption: z.string().max(44),
  }),
  intrinsicHeight: (_props, _theme, width) => width * 0.55,
  render: ({ id, box, theme, props }) => {
    const { value, caption } = props as { value: string; caption: string };
    const captionSize = 18;
    const numeralMax = Math.min(box.h - captionSize * 2.4, box.w * 0.72);
    return (
      <Group name={id}>
        <FittedLine
          name={`${id}-value`}
          text={value}
          x={box.x}
          y={box.y}
          maxWidth={box.w}
          maxSize={Math.max(60, numeralMax)}
          minSize={48}
          role="display"
          theme={theme}
          fill={ensureContrast(theme.palette.accent, theme.palette.bg, true)}
          weight={theme.fonts.weights.display}
          tracking={-0.04}
        />
        <TextBlock
          name={`${id}-caption`}
          text={caption}
          x={box.x}
          y={box.y + Math.max(60, numeralMax) * 0.86}
          width={box.w}
          size={captionSize}
          role="body"
          theme={theme}
          fill={inkFor(theme, box)}
          lineHeight={1.35}
        />
      </Group>
    );
  },
};


/**
 * A brand emblem placed at proper scale beside (or above) the name. A logo
 * dropped in raw is the single most common way a flyer looks amateur: it is
 * either too big, or floating with no relationship to the type. This gives it a
 * lockup with a fixed optical size and an optional dividing rule.
 */
const logoLockup: ComponentModule = {
  manifest: {
    id: "logo-lockup",
    category: "content",
    purpose:
      "A logo image set at a controlled size, locked up with the company name and an optional tagline. Use this whenever the user supplies a logo — prepare it with the logo-clean preset first so it sits on any ground.",
    roles: ["brand"],
    minSize: { w: 220, h: 60 },
    maxSize: { w: 900, h: 320 },
    topologies: "any",
    assetSlots: 1,
    motion: "fades in last",
    textLimits: { tagline: 52 },
  },
  props: z.object({
    layout: z.enum(["beside", "above"]).default("beside"),
    tagline: z.string().max(52).nullable().default(null),
    showName: z.boolean().default(true),
    align: z.enum(["start", "middle", "end"]).default("start"),
  }),
  intrinsicHeight: (props, _theme, width) => {
    const { layout } = props as { layout: "beside" | "above" };
    return layout === "above" ? Math.min(width * 0.62, 240) : 96;
  },
  render: ({ id, box, theme, productName, props, assets }) => {
    const { layout, tagline, showName, align } = props as {
      layout: "beside" | "above";
      tagline: string | null;
      showName: boolean;
      align: "start" | "middle" | "end";
    };
    const logo = assets[0];
    const stacked = layout === "above";
    const mark = Math.min(stacked ? box.h * 0.62 : box.h * 0.9, stacked ? 190 : 110);
    const ink = inkFor(theme, box);

    // Optical placement: the mark leads in reading order unless stacked.
    const markX =
      align === "middle" ? box.x + box.w / 2 - mark / 2 : align === "end" ? box.x + box.w - mark : box.x;
    const textX = stacked ? box.x : box.x + (logo ? mark + 26 : 0);
    const textW = stacked ? box.w : box.w - (logo ? mark + 26 : 0);
    const textY = stacked ? box.y + mark + 18 : box.y + (box.h - (tagline ? 62 : 34)) / 2;

    return (
      <Group name={id}>
        {logo ? (
          <image
            id={`${id}-mark`}
            data-name={`${id}-mark`}
            href={logo.href}
            x={markX}
            y={box.y}
            width={mark}
            height={mark}
            preserveAspectRatio="xMidYMid meet"
          />
        ) : null}
        {showName ? (
          <FittedLine
            name={`${id}-name`}
            text={productName}
            x={textX}
            y={textY}
            maxWidth={Math.max(80, textW)}
            maxSize={stacked ? 40 : 34}
            minSize={16}
            role="display"
            theme={theme}
            fill={ink}
            weight={theme.fonts.weights.display}
            tracking={-0.01}
            align={stacked ? align : "start"}
          />
        ) : null}
        {tagline ? (
          <FittedLine
            name={`${id}-tagline`}
            text={tagline}
            x={textX}
            y={textY + (stacked ? 46 : 40)}
            maxWidth={Math.max(80, textW)}
            maxSize={17}
            minSize={12}
            role="body"
            theme={theme}
            fill={mutedInkFor(theme, box)}
            align={stacked ? align : "start"}
          />
        ) : null}
      </Group>
    );
  },
};

export const CONTENT_COMPONENTS: ComponentModule[] = [
  headlineBlock,
  eyebrowLabel,
  bodyParagraph,
  benefitList,
  ctaButton,
  footerLockup,
  quoteBlock,
  bigNumeral,
  logoLockup,
];
