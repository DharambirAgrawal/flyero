import { z } from "zod";
import { FittedLine, Group, Panel, Rule, TextBlock, fitText, inkFor} from "./primitives.js";
import type { ComponentModule } from "./types.js";
import { ensureContrast, mix, withAlpha } from "../creative/color.js";

/**
 * Evidence components — the reason Gate G2 (cover test) can pass. Each one shows
 * the product doing something. When the user supplies a screenshot it goes inside
 * the frame; when they don't, the component draws a credible abstraction of the
 * artefact rather than a generic tech shape.
 */

/** Abstract "lines of content" used when no screenshot is available. */
function ContentLines({
  id,
  x,
  y,
  w,
  h,
  rows,
  color,
  emphasisRow,
  emphasisColor,
  rowHeight = 10,
  seedWidths,
}: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rows: number;
  color: string;
  emphasisRow?: number;
  emphasisColor?: string;
  rowHeight?: number;
  seedWidths: number[];
}) {
  const gap = Math.max(8, (h - rows * rowHeight) / Math.max(rows - 1, 1));
  return (
    <Group name={id}>
      {Array.from({ length: rows }).map((_, i) => {
        const isEmphasis = emphasisRow === i;
        const width = w * (seedWidths[i % seedWidths.length] ?? 0.8);
        return (
          <rect
            key={i}
            x={x}
            y={y + i * (rowHeight + gap)}
            width={isEmphasis ? Math.min(w, width * 1.05) : width}
            height={isEmphasis ? rowHeight * 1.35 : rowHeight}
            rx={rowHeight / 2}
            fill={isEmphasis ? (emphasisColor ?? color) : color}
            opacity={isEmphasis ? 1 : 0.55}
          />
        );
      })}
    </Group>
  );
}

function widthsFrom(rng: { float: () => number }, n: number): number[] {
  return Array.from({ length: n }, () => 0.55 + rng.float() * 0.42);
}

const browserFrame: ComponentModule = {
  manifest: {
    id: "browser-frame",
    category: "evidence",
    purpose:
      "The product as a web app, in a restrained browser chrome. Shows a screenshot asset when one exists. Software only — never the evidence for a physical product.",
    roles: ["evidence"],
    minSize: { w: 340, h: 260 },
    maxSize: { w: 1180, h: 900 },
    topologies: "any",
    assetSlots: 1,
    motion: "content scrolls once",
  },
  props: z.object({
    label: z.string().max(40).nullable().default(null),
    emphasisRow: z.number().int().min(0).max(8).nullable().default(null),
  }),
  intrinsicHeight: (_p, _t, width) => width * 0.68,
  render: ({ id, box, theme, props, assets, rng }) => {
    const { label, emphasisRow } = props as { label: string | null; emphasisRow: number | null };
    const asset = assets[0];
    const radius = Math.max(theme.material.surface.cornerRadius, 6);
    const barH = Math.min(38, box.h * 0.11);
    const ink = theme.palette.fg;
    const surface = mix(theme.palette.bg, "#ffffff", 0.55);
    return (
      <Group name={id}>
        <Panel
          name={`${id}-frame`}
          x={box.x}
          y={box.y}
          w={box.w}
          h={box.h}
          fill={surface}
          stroke={withAlpha(ink, 0.28)}
          strokeWidth={theme.material.surface.strokeWidth}
          radius={radius}
          elevation={theme.material.surface.elevation}
        />
        <Group name={`${id}-chrome`}>
          <Rule
            name={`${id}-chrome-rule`}
            x1={box.x}
            y1={box.y + barH}
            x2={box.x + box.w}
            y2={box.y + barH}
            stroke={withAlpha(ink, 0.22)}
            strokeWidth={theme.material.surface.strokeWidth}
          />
          {[0, 1, 2].map((i) => (
            <circle
              key={i}
              cx={box.x + 20 + i * 17}
              cy={box.y + barH / 2}
              r={4.5}
              fill={withAlpha(ink, 0.3)}
            />
          ))}
          {label ? (
            <FittedLine
              name={`${id}-label`}
              text={label}
              x={box.x + 84}
              y={box.y + barH / 2 - 7}
              maxWidth={box.w - 110}
              maxSize={13}
              minSize={10}
              role={theme.fonts.mono ? "mono" : "body"}
              theme={theme}
              fill={withAlpha(ink, 0.6)}
            />
          ) : null}
        </Group>
        {asset ? (
          <>
            <clipPath id={`clip-${id}`}>
              <rect
                x={box.x}
                y={box.y + barH}
                width={box.w}
                height={box.h - barH}
                rx={0}
              />
            </clipPath>
            <image
              id={`${id}-screenshot`}
              data-name={`${id}-screenshot`}
              href={asset.href}
              x={box.x}
              y={box.y + barH}
              width={box.w}
              height={box.h - barH}
              preserveAspectRatio="xMidYMin slice"
              clipPath={`url(#clip-${id})`}
            />
          </>
        ) : (
          <ContentLines
            id={`${id}-content`}
            x={box.x + 26}
            y={box.y + barH + 26}
            w={box.w - 52}
            h={box.h - barH - 52}
            rows={6}
            rowHeight={Math.max(8, box.h * 0.028)}
            color={withAlpha(ink, 0.9)}
            emphasisRow={emphasisRow ?? 2}
            emphasisColor={ensureContrast(theme.palette.accent, surface, true)}
            seedWidths={widthsFrom(rng, 6)}
          />
        )}
      </Group>
    );
  },
};

const phoneFrame: ComponentModule = {
  manifest: {
    id: "phone-frame",
    category: "evidence",
    purpose:
      "The product on a phone. Tall and narrow — good for split and two-column topologies. Software only — never the evidence for a physical product.",
    roles: ["evidence"],
    minSize: { w: 200, h: 380 },
    maxSize: { w: 520, h: 1040 },
    topologies: "any",
    assetSlots: 1,
    motion: "notification slides in",
  },
  props: z.object({
    emphasisRow: z.number().int().min(0).max(8).nullable().default(null),
  }),
  intrinsicHeight: (_p, _t, width) => width * 2.03,
  render: ({ id, box, theme, props, assets, rng }) => {
    const { emphasisRow } = props as { emphasisRow: number | null };
    const asset = assets[0];
    const ink = theme.palette.fg;
    const surface = mix(theme.palette.bg, "#ffffff", 0.55);
    const radius = Math.min(box.w * 0.11, 42);
    return (
      <Group name={id}>
        <Panel
          name={`${id}-body`}
          x={box.x}
          y={box.y}
          w={box.w}
          h={box.h}
          fill={surface}
          stroke={withAlpha(ink, 0.35)}
          strokeWidth={theme.material.surface.strokeWidth * 1.5}
          radius={radius}
          elevation={theme.material.surface.elevation}
        />
        <rect
          x={box.x + box.w * 0.34}
          y={box.y + 12}
          width={box.w * 0.32}
          height={7}
          rx={3.5}
          fill={withAlpha(ink, 0.35)}
        />
        {asset ? (
          <>
            <clipPath id={`clip-${id}`}>
              <rect
                x={box.x + 10}
                y={box.y + 32}
                width={box.w - 20}
                height={box.h - 52}
                rx={radius * 0.7}
              />
            </clipPath>
            <image
              id={`${id}-screenshot`}
              data-name={`${id}-screenshot`}
              href={asset.href}
              x={box.x + 10}
              y={box.y + 32}
              width={box.w - 20}
              height={box.h - 52}
              preserveAspectRatio="xMidYMin slice"
              clipPath={`url(#clip-${id})`}
            />
          </>
        ) : (
          <ContentLines
            id={`${id}-content`}
            x={box.x + 26}
            y={box.y + 56}
            w={box.w - 52}
            h={box.h - 96}
            rows={7}
            rowHeight={Math.max(8, box.h * 0.018)}
            color={withAlpha(ink, 0.9)}
            emphasisRow={emphasisRow ?? 3}
            emphasisColor={ensureContrast(theme.palette.accent, surface, true)}
            seedWidths={widthsFrom(rng, 7)}
          />
        )}
      </Group>
    );
  },
};

const documentCard: ComponentModule = {
  manifest: {
    id: "document-card",
    category: "evidence",
    purpose:
      "A page-like artefact — résumé, report, brief. The subject when the product acts on documents. Not a picture frame: for photographs use photo-hero, masked-image or asset-image.",
    roles: ["evidence"],
    minSize: { w: 260, h: 340 },
    maxSize: { w: 760, h: 1040 },
    topologies: "any",
    assetSlots: 1,
    motion: "page settles",
  },
  props: z.object({
    title: z.string().max(36).nullable().default(null),
    emphasisRow: z.number().int().min(0).max(9).nullable().default(null),
    strikeRow: z.number().int().min(0).max(9).nullable().default(null),
  }),
  intrinsicHeight: (_p, _t, width) => width * 1.34,
  render: ({ id, box, theme, props, assets, rng }) => {
    const { title, emphasisRow, strikeRow } = props as {
      title: string | null;
      emphasisRow: number | null;
      strikeRow: number | null;
    };
    const asset = assets[0];
    const ink = theme.palette.fg;
    const paper = mix(theme.palette.bg, "#ffffff", 0.72);
    const rows = 8;
    const widths = widthsFrom(rng, rows);
    const rowH = Math.max(7, box.h * 0.022);
    const contentY = box.y + (title ? 74 : 40);
    const contentH = box.h - (title ? 108 : 74);
    const gap = Math.max(8, (contentH - rows * rowH) / (rows - 1));
    const accent = ensureContrast(theme.palette.accent, paper, true);

    return (
      <Group name={id}>
        <Panel
          name={`${id}-page`}
          x={box.x}
          y={box.y}
          w={box.w}
          h={box.h}
          fill={paper}
          stroke={withAlpha(ink, 0.24)}
          strokeWidth={theme.material.surface.strokeWidth}
          radius={theme.material.surface.cornerRadius}
          elevation={theme.material.surface.elevation}
        />
        {asset ? (
          <>
            <clipPath id={`clip-${id}`}>
              <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={theme.material.surface.cornerRadius} />
            </clipPath>
            <image
              id={`${id}-scan`}
              data-name={`${id}-scan`}
              href={asset.href}
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              preserveAspectRatio="xMidYMin slice"
              clipPath={`url(#clip-${id})`}
            />
          </>
        ) : (
          <>
            {title ? (
              <FittedLine
                name={`${id}-title`}
                text={title}
                x={box.x + 30}
                y={box.y + 34}
                maxWidth={box.w - 60}
                maxSize={Math.min(24, box.w * 0.07)}
                minSize={13}
                role="display"
                theme={theme}
                fill={ensureContrast(ink, paper)}
                weight={theme.fonts.weights.display}
              />
            ) : null}
            <Group name={`${id}-lines`}>
              {Array.from({ length: rows }).map((_, i) => {
                const y = contentY + i * (rowH + gap);
                const w = (box.w - 60) * (widths[i] ?? 0.8);
                const isEmphasis = emphasisRow === i;
                const isStrike = strikeRow === i;
                return (
                  <Group key={i} name={`${id}-line-${i + 1}`}>
                    <rect
                      x={box.x + 30}
                      y={y}
                      width={w}
                      height={isEmphasis ? rowH * 1.4 : rowH}
                      rx={rowH / 2}
                      fill={isEmphasis ? accent : withAlpha(ink, 0.85)}
                      opacity={isStrike ? 0.32 : isEmphasis ? 1 : 0.55}
                    />
                    {isStrike ? (
                      <Rule
                        name={`${id}-strike-${i + 1}`}
                        x1={box.x + 26}
                        y1={y + rowH / 2}
                        x2={box.x + 34 + w}
                        y2={y + rowH / 2}
                        stroke={accent}
                        strokeWidth={theme.material.surface.strokeWidth * 1.3}
                      />
                    ) : null}
                  </Group>
                );
              })}
            </Group>
          </>
        )}
      </Group>
    );
  },
};

const beforeAfterStack: ComponentModule = {
  manifest: {
    id: "before-after-stack",
    category: "evidence",
    purpose:
      "Two states of the same artefact along one hard seam. The single strongest component for transformation and before/after metaphors. Give it two image assets (before, after) and it shows them; without assets it draws abstract document lines — only credible for document/software subjects.",
    roles: ["evidence"],
    minSize: { w: 320, h: 320 },
    maxSize: { w: 1080, h: 940 },
    topologies: "any",
    assetSlots: 2,
    motion: "seam wipes left to right",
    textLimits: { beforeLabel: 18, afterLabel: 18 },
  },
  props: z.object({
    beforeLabel: z.string().max(18).default("Before"),
    afterLabel: z.string().max(18).default("After"),
    axis: z.enum(["vertical", "horizontal"]).default("vertical"),
  }),
  intrinsicHeight: (_p, _t, width) => width * 0.86,
  render: ({ id, box, theme, props, assets, rng }) => {
    const { beforeLabel, afterLabel, axis } = props as {
      beforeLabel: string;
      afterLabel: string;
      axis: "vertical" | "horizontal";
    };
    const ink = theme.palette.fg;
    const paper = mix(theme.palette.bg, "#ffffff", 0.7);
    const accent = ensureContrast(theme.palette.accent, paper, true);
    const labelH = 26;
    const vertical = axis === "vertical";
    const halfW = vertical ? (box.w - 18) / 2 : box.w;
    const halfH = vertical ? box.h - labelH : (box.h - labelH - 18) / 2;
    const rows = 5;
    const wA = widthsFrom(rng, rows);
    const wB = widthsFrom(rng, rows);

    const half = (
      key: string,
      x: number,
      y: number,
      w: number,
      h: number,
      label: string,
      after: boolean,
      widths: number[],
      asset: (typeof assets)[number] | undefined,
    ) => {
      const rowH = Math.max(6, h * 0.045);
      const gap = Math.max(7, (h - 40 - rows * rowH) / (rows - 1));
      const radius = theme.material.surface.cornerRadius;
      const side = after ? "after" : "before";
      return (
        <Group key={key} name={`${id}-${side}`}>
          <FittedLine
            name={`${id}-${side}-label`}
            text={label}
            x={x}
            y={y}
            maxWidth={w}
            maxSize={14}
            minSize={10}
            role={theme.fonts.mono ? "mono" : "body"}
            theme={theme}
            fill={after ? accent : withAlpha(ink, 0.55)}
            weight={theme.fonts.weights.label}
            tracking={0.1}
            uppercase
          />
          <Panel
            name={`${id}-${side}-panel`}
            x={x}
            y={y + labelH}
            w={w}
            h={h - labelH}
            fill={after ? paper : mix(paper, theme.palette.bg, 0.55)}
            stroke="none"
            radius={radius}
            elevation={after && theme.material.surface.elevation}
          />
          {asset ? (
            <>
              <clipPath id={`clip-${id}-${side}`}>
                <rect x={x} y={y + labelH} width={w} height={h - labelH} rx={radius} />
              </clipPath>
              <image
                id={`${id}-${side}-image`}
                data-name={`${id}-${side}-image`}
                href={asset.href}
                x={x}
                y={y + labelH}
                width={w}
                height={h - labelH}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#clip-${id}-${side})`}
              />
              {!after ? (
                // The before state reads as the duller past: a quiet wash of the
                // ground colour over the photograph, not a filter.
                <rect
                  x={x}
                  y={y + labelH}
                  width={w}
                  height={h - labelH}
                  rx={radius}
                  fill={theme.palette.bg}
                  opacity={0.32}
                />
              ) : null}
            </>
          ) : (
            Array.from({ length: rows }).map((_, i) => (
              <rect
                key={i}
                x={x + 18}
                y={y + labelH + 22 + i * (rowH + gap)}
                width={(w - 36) * (widths[i] ?? 0.7) * (after ? 1 : 0.82)}
                height={after && i === 1 ? rowH * 1.5 : rowH}
                rx={rowH / 2}
                fill={after && i === 1 ? accent : withAlpha(ink, 0.8)}
                opacity={after ? (i === 1 ? 1 : 0.6) : 0.3}
              />
            ))
          )}
          <Panel
            name={`${id}-${side}-frame`}
            x={x}
            y={y + labelH}
            w={w}
            h={h - labelH}
            fill="none"
            stroke={after ? accent : withAlpha(ink, 0.2)}
            strokeWidth={theme.material.surface.strokeWidth * (after ? 1.6 : 1)}
            radius={radius}
          />
        </Group>
      );
    };

    return (
      <Group name={id}>
        {half(
          "b",
          box.x,
          box.y,
          halfW,
          vertical ? halfH + labelH : halfH + labelH,
          beforeLabel,
          false,
          wA,
          assets[0],
        )}
        {half(
          "a",
          vertical ? box.x + halfW + 18 : box.x,
          vertical ? box.y : box.y + halfH + labelH + 18,
          halfW,
          vertical ? halfH + labelH : halfH + labelH,
          afterLabel,
          true,
          wB,
          assets[1],
        )}
        <Rule
          name={`${id}-seam`}
          x1={vertical ? box.x + halfW + 9 : box.x}
          y1={vertical ? box.y + labelH : box.y + halfH + labelH + 9}
          x2={vertical ? box.x + halfW + 9 : box.x + box.w}
          y2={vertical ? box.y + box.h : box.y + halfH + labelH + 9}
          stroke={accent}
          strokeWidth={theme.material.surface.strokeWidth * 1.2}
          dash="1 9"
        />
      </Group>
    );
  },
};

const scoreRing: ComponentModule = {
  manifest: {
    id: "score-ring",
    category: "evidence",
    purpose: "A measured reading of something. Only for values the brief supplies — never an invented score.",
    roles: ["evidence", "support"],
    minSize: { w: 150, h: 150 },
    maxSize: { w: 520, h: 520 },
    topologies: "any",
    assetSlots: 0,
    motion: "arc sweeps to value",
    textLimits: { label: 28 },
  },
  props: z.object({
    value: z.number().min(0).max(100),
    label: z.string().max(28),
    display: z.string().max(6).nullable().default(null),
  }),
  intrinsicHeight: (_p, _t, width) => width,
  render: ({ id, box, theme, props }) => {
    const { value, label, display } = props as { value: number; label: string; display: string | null };
    const size = Math.min(box.w, box.h);
    const cx = box.x + box.w / 2;
    const cy = box.y + size / 2;
    const r = size * 0.4;
    const stroke = Math.max(8, size * 0.075);
    const circumference = 2 * Math.PI * r;
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
    return (
      <Group name={id}>
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={withAlpha(theme.palette.fg, 0.16)}
          strokeWidth={stroke}
        />
        <circle
          id={`${id}-arc`}
          data-name={`${id}-arc`}
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${(circumference * value) / 100} ${circumference}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <FittedLine
          name={`${id}-value`}
          text={display ?? String(Math.round(value))}
          x={box.x}
          y={cy - size * 0.17}
          maxWidth={box.w}
          maxSize={size * 0.3}
          minSize={18}
          role="display"
          theme={theme}
          fill={theme.palette.fg}
          weight={theme.fonts.weights.display}
          align="middle"
        />
        <FittedLine
          name={`${id}-label`}
          text={label}
          x={box.x}
          y={cy + size * 0.46}
          maxWidth={box.w}
          maxSize={15}
          minSize={11}
          role="body"
          theme={theme}
          fill={ensureContrast(theme.palette.muted, theme.palette.bg, true)}
          align="middle"
        />
      </Group>
    );
  },
};

const annotationLabel: ComponentModule = {
  manifest: {
    id: "annotation-label",
    category: "evidence",
    purpose:
      "A short expert note with a leader line pointing into the evidence. This is what makes annotation/editorial metaphors read.",
    roles: ["support"],
    minSize: { w: 140, h: 40 },
    maxSize: { w: 460, h: 200 },
    topologies: "any",
    assetSlots: 0,
    motion: "leader line draws, then text fades",
    textLimits: { text: 64 },
  },
  props: z.object({
    text: z.string().max(64),
    /** Where the leader line ends, in canvas coordinates. Set by the solver. */
    pointTo: z
      .object({ x: z.number(), y: z.number() })
      .nullable()
      .default(null),
    side: z.enum(["left", "right"]).default("right"),
  }),
  intrinsicHeight: (props, theme, width) => {
    const { text } = props as { text: string };
    return Math.max(44, Math.ceil(text.length / Math.max(1, width / 9)) * 22 + 12);
  },
  render: ({ id, box, theme, props }) => {
    const { text, pointTo, side } = props as {
      text: string;
      pointTo: { x: number; y: number } | null;
      side: "left" | "right";
    };
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
    const fit = fitText(
      text,
      { family: theme.fonts.mono ?? theme.fonts.body, weight: theme.fonts.weights.label, tracking: 0, lineHeight: 1.3 },
      { w: box.w - 14, h: box.h },
      { min: 12, max: 17, maxLines: 3, lineHeight: 1.3 },
    );
    const anchorX = side === "right" ? box.x : box.x + box.w;
    const anchorY = box.y + fit.height / 2;
    return (
      <Group name={id}>
        <Rule
          name={`${id}-bar`}
          x1={box.x}
          y1={box.y}
          x2={box.x}
          y2={box.y + fit.height}
          stroke={accent}
          strokeWidth={theme.material.surface.strokeWidth * 1.5}
        />
        <TextBlock
          name={`${id}-text`}
          text={text}
          lines={fit.lines}
          x={box.x + 12}
          y={box.y}
          width={box.w - 14}
          size={fit.size}
          role={theme.fonts.mono ? "mono" : "body"}
          theme={theme}
          fill={inkFor(theme, box)}
          lineHeight={1.3}
        />
        {pointTo ? (
          <Group name={`${id}-leader`}>
            <path
              d={`M ${anchorX} ${anchorY} L ${(anchorX + pointTo.x) / 2} ${anchorY} L ${pointTo.x} ${pointTo.y}`}
              fill="none"
              stroke={accent}
              strokeWidth={theme.material.surface.strokeWidth}
              strokeDasharray="4 4"
            />
            <circle cx={pointTo.x} cy={pointTo.y} r={4} fill={accent} />
          </Group>
        ) : null}
      </Group>
    );
  },
};

const uiFragment: ComponentModule = {
  manifest: {
    id: "ui-fragment",
    category: "evidence",
    purpose: "A single close-up piece of the interface — one control, one row, one result. Good for magnification.",
    roles: ["evidence"],
    minSize: { w: 220, h: 90 },
    maxSize: { w: 780, h: 340 },
    topologies: "any",
    assetSlots: 1,
    motion: "state toggles once",
    textLimits: { primary: 40, secondary: 40 },
  },
  props: z.object({
    primary: z.string().max(40),
    secondary: z.string().max(40).nullable().default(null),
    state: z.enum(["idle", "active", "resolved"]).default("resolved"),
  }),
  intrinsicHeight: (_p, _t, width) => width * 0.32,
  render: ({ id, box, theme, props }) => {
    const { primary, secondary, state } = props as {
      primary: string;
      secondary: string | null;
      state: "idle" | "active" | "resolved";
    };
    const surface = mix(theme.palette.bg, "#ffffff", 0.6);
    const accent = ensureContrast(theme.palette.accent, surface, true);
    const active = state !== "idle";
    return (
      <Group name={id}>
        <Panel
          name={`${id}-surface`}
          x={box.x}
          y={box.y}
          w={box.w}
          h={box.h}
          fill={surface}
          stroke={active ? accent : withAlpha(theme.palette.fg, 0.22)}
          strokeWidth={theme.material.surface.strokeWidth * (active ? 1.8 : 1)}
          radius={Math.max(theme.material.surface.cornerRadius, 4)}
          elevation={theme.material.surface.elevation}
        />
        {state === "resolved" ? (
          <path
            d={`M ${box.x + box.w - 46} ${box.y + box.h / 2} l 10 11 l 20 -23`}
            fill="none"
            stroke={accent}
            strokeWidth={theme.material.surface.strokeWidth * 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        <FittedLine
          name={`${id}-primary`}
          text={primary}
          x={box.x + 22}
          y={box.y + (secondary ? box.h * 0.26 : box.h / 2 - 12)}
          maxWidth={box.w - 90}
          maxSize={Math.min(24, box.h * 0.3)}
          minSize={13}
          role="body"
          theme={theme}
          fill={ensureContrast(theme.palette.fg, surface)}
          weight={theme.fonts.weights.label}
        />
        {secondary ? (
          <FittedLine
            name={`${id}-secondary`}
            text={secondary}
            x={box.x + 22}
            y={box.y + box.h * 0.58}
            maxWidth={box.w - 90}
            maxSize={15}
            minSize={11}
            role="body"
            theme={theme}
            fill={withAlpha(theme.palette.fg, 0.6)}
          />
        ) : null}
      </Group>
    );
  },
};

const assetImage: ComponentModule = {
  manifest: {
    id: "asset-image",
    category: "evidence",
    purpose:
      "A user-supplied image placed directly, no chrome, with a chosen aspect. Use when the asset itself is the subject — a cutout product shot, an illustration, a logo lockup.",
    roles: ["evidence"],
    minSize: { w: 200, h: 200 },
    maxSize: { w: 1180, h: 1180 },
    topologies: "any",
    assetSlots: 1,
    motion: "slow scale",
  },
  props: z.object({
    fit: z.enum(["cover", "contain"]).default("cover"),
    aspect: z.enum(["square", "portrait", "landscape"]).default("square"),
  }),
  intrinsicHeight: (p, _t, width) => {
    const { aspect } = p as { aspect: "square" | "portrait" | "landscape" };
    return aspect === "portrait" ? width * 1.3 : aspect === "landscape" ? width * 0.68 : width;
  },
  render: ({ id, box, theme, props, assets }) => {
    const { fit } = props as { fit: "cover" | "contain" };
    const asset = assets[0];
    if (!asset) {
      return (
        <Group name={id}>
          <Panel
            name={`${id}-placeholder`}
            x={box.x}
            y={box.y}
            w={box.w}
            h={box.h}
            fill={mix(theme.palette.bg, theme.palette.fg, 0.08)}
            radius={theme.material.surface.cornerRadius}
          />
        </Group>
      );
    }
    return (
      <Group name={id}>
        <clipPath id={`clip-${id}`}>
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            rx={theme.material.surface.cornerRadius}
          />
        </clipPath>
        <image
          id={`${id}-image`}
          data-name={`${id}-image`}
          href={asset.href}
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          preserveAspectRatio={fit === "cover" ? "xMidYMid slice" : "xMidYMid meet"}
          clipPath={`url(#clip-${id})`}
        />
      </Group>
    );
  },
};

const checklistCard: ComponentModule = {
  manifest: {
    id: "checklist-card",
    category: "evidence",
    purpose: "Items being resolved one by one — shows the product working through a list rather than describing it.",
    roles: ["evidence"],
    minSize: { w: 260, h: 200 },
    maxSize: { w: 720, h: 620 },
    topologies: "any",
    assetSlots: 0,
    motion: "checks land in sequence",
    textLimits: { items: 40 },
  },
  props: z.object({
    items: z.array(z.string().max(40)).min(2).max(5),
    /** How many are already resolved; the rest read as pending. */
    resolved: z.number().int().min(0).max(5).default(2),
  }),
  intrinsicHeight: (props) => {
    const { items } = props as { items: string[] };
    return items.length * 58 + 40;
  },
  render: ({ id, box, theme, props }) => {
    const { items, resolved } = props as { items: string[]; resolved: number };
    const surface = mix(theme.palette.bg, "#ffffff", 0.62);
    const accent = ensureContrast(theme.palette.accent, surface, true);
    const rowH = Math.min((box.h - 36) / items.length, 64);
    return (
      <Group name={id}>
        <Panel
          name={`${id}-surface`}
          x={box.x}
          y={box.y}
          w={box.w}
          h={box.h}
          fill={surface}
          stroke={withAlpha(theme.palette.fg, 0.2)}
          strokeWidth={theme.material.surface.strokeWidth}
          radius={theme.material.surface.cornerRadius}
          elevation={theme.material.surface.elevation}
        />
        {items.map((item, i) => {
          const y = box.y + 18 + i * rowH;
          const done = i < resolved;
          const boxSize = Math.min(22, rowH * 0.4);
          return (
            <Group key={i} name={`${id}-row-${i + 1}`}>
              <rect
                x={box.x + 20}
                y={y + rowH / 2 - boxSize / 2 - 6}
                width={boxSize}
                height={boxSize}
                rx={theme.material.surface.cornerRadius > 8 ? 6 : 2}
                fill={done ? accent : "none"}
                stroke={done ? accent : withAlpha(theme.palette.fg, 0.35)}
                strokeWidth={theme.material.surface.strokeWidth}
              />
              {done ? (
                <path
                  d={`M ${box.x + 25} ${y + rowH / 2 - 6} l ${boxSize * 0.28} ${boxSize * 0.28} l ${boxSize * 0.5} ${-boxSize * 0.55}`}
                  fill="none"
                  stroke={surface}
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null}
              <FittedLine
                name={`${id}-label-${i + 1}`}
                text={item}
                x={box.x + 32 + boxSize}
                y={y + rowH / 2 - boxSize / 2 - 6}
                maxWidth={box.w - 60 - boxSize}
                maxSize={Math.min(19, rowH * 0.34)}
                minSize={12}
                role="body"
                theme={theme}
                fill={done ? ensureContrast(theme.palette.fg, surface) : withAlpha(theme.palette.fg, 0.5)}
              />
            </Group>
          );
        })}
      </Group>
    );
  },
};

const chatExchange: ComponentModule = {
  manifest: {
    id: "chat-exchange",
    category: "evidence",
    purpose: "A question and a markedly better answer. The component that makes the conversation metaphor concrete.",
    roles: ["evidence"],
    minSize: { w: 280, h: 220 },
    maxSize: { w: 760, h: 620 },
    topologies: "any",
    assetSlots: 0,
    motion: "reply types in",
    textLimits: { ask: 60, reply: 90 },
  },
  props: z.object({
    ask: z.string().max(60),
    reply: z.string().max(90),
  }),
  intrinsicHeight: (_p, _t, width) => width * 0.62,
  render: ({ id, box, theme, props }) => {
    const { ask, reply } = props as { ask: string; reply: string };
    const surface = mix(theme.palette.bg, "#ffffff", 0.6);
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
    const radius = Math.max(theme.material.surface.cornerRadius, 8);
    const askW = box.w * 0.72;
    const askFit = fitText(
      ask,
      { family: theme.fonts.body, weight: theme.fonts.weights.body, tracking: 0, lineHeight: 1.35 },
      { w: askW - 36, h: box.h * 0.35 },
      { min: 13, max: 19, maxLines: 3, lineHeight: 1.35 },
    );
    const askH = askFit.height + 30;
    const replyW = box.w * 0.86;
    const replyFit = fitText(
      reply,
      { family: theme.fonts.body, weight: theme.fonts.weights.label, tracking: 0, lineHeight: 1.35 },
      { w: replyW - 36, h: box.h * 0.5 },
      { min: 14, max: 21, maxLines: 4, lineHeight: 1.35 },
    );
    const replyH = replyFit.height + 32;
    const replyY = box.y + askH + 18;
    return (
      <Group name={id}>
        <Group name={`${id}-ask`}>
          <Panel
            name={`${id}-ask-bubble`}
            x={box.x}
            y={box.y}
            w={askW}
            h={askH}
            fill={surface}
            stroke={withAlpha(theme.palette.fg, 0.18)}
            strokeWidth={theme.material.surface.strokeWidth}
            radius={radius}
          />
          <TextBlock
            name={`${id}-ask-text`}
            text={ask}
            lines={askFit.lines}
            x={box.x + 18}
            y={box.y + 15}
            width={askW - 36}
            size={askFit.size}
            role="body"
            theme={theme}
            fill={withAlpha(theme.palette.fg, 0.75)}
            lineHeight={1.35}
          />
        </Group>
        <Group name={`${id}-reply`}>
          <Panel
            name={`${id}-reply-bubble`}
            x={box.x + box.w - replyW}
            y={replyY}
            w={replyW}
            h={replyH}
            fill={theme.palette.bg}
            stroke={accent}
            strokeWidth={theme.material.surface.strokeWidth * 1.8}
            radius={radius}
            elevation={theme.material.surface.elevation}
          />
          <TextBlock
            name={`${id}-reply-text`}
            text={reply}
            lines={replyFit.lines}
            x={box.x + box.w - replyW + 18}
            y={replyY + 16}
            width={replyW - 36}
            size={replyFit.size}
            role="body"
            theme={theme}
            fill={ensureContrast(theme.palette.fg, theme.palette.bg)}
            weight={theme.fonts.weights.label}
            lineHeight={1.35}
          />
        </Group>
      </Group>
    );
  },
};

const photoHero: ComponentModule = {
  manifest: {
    id: "photo-hero",
    category: "evidence",
    purpose:
      "The photograph IS the design: a full-crop image with no chrome and an optional scrim so the headline can sit directly on it. The default evidence for physical products — food, flowers, fashion, places, events. Requires a prepared image asset.",
    roles: ["evidence"],
    minSize: { w: 420, h: 380 },
    maxSize: { w: 1180, h: 1350 },
    topologies: "any",
    assetSlots: 1,
    motion: "slow push-in",
    textLimits: { caption: 48 },
  },
  props: z.object({
    aspect: z.enum(["portrait", "landscape", "square"]).default("portrait"),
    /** Where a darkened band sits so overlapping type stays legible. */
    /**
     * "full" darkens the entire image evenly. Required when the photograph is
     * the whole page rather than a plate: type can then land anywhere, and a
     * directional gradient only guarantees contrast at the edge it starts from.
     */
    scrim: z.enum(["none", "bottom", "top", "full"]).default("bottom"),
    caption: z.string().max(48).nullable().default(null),
  }),
  intrinsicHeight: (p, _t, width) => {
    const { aspect } = p as { aspect: "portrait" | "landscape" | "square" };
    return aspect === "portrait" ? width * 1.25 : aspect === "landscape" ? width * 0.66 : width;
  },
  render: ({ id, box, theme, props, assets }) => {
    const { scrim, caption } = props as {
      scrim: "none" | "bottom" | "top" | "full";
      caption: string | null;
    };
    const asset = assets[0];
    const radius = theme.material.surface.cornerRadius;
    /**
     * The scrim takes the *ground* colour, not a neutral grey.
     *
     * It used to be mix(fg, black) — and on a dark palette `fg` is white, so the
     * scrim was literally grey and every photographic poster came out
     * monochrome whatever the campaign colour was. A water campaign has to read
     * blue and a tree campaign green; tinting the scrim is what makes the
     * photograph join the palette instead of fighting it.
     */
    const scrimInk = mix(theme.palette.bg, "#000000", 0.35);
    const scrimH = scrim === "full" ? box.h : box.h * 0.48;
    const scrimY = scrim === "top" || scrim === "full" ? box.y : box.y + box.h - scrimH;
    if (!asset) {
      // A quiet brand-toned field, so a missing asset degrades honestly instead
      // of drawing fake photography.
      return (
        <Group name={id}>
          <Panel
            name={`${id}-placeholder`}
            x={box.x}
            y={box.y}
            w={box.w}
            h={box.h}
            fill={mix(theme.palette.bg, theme.palette.accent, 0.16)}
            radius={radius}
          />
        </Group>
      );
    }
    return (
      <Group name={id}>
        <clipPath id={`clip-${id}`}>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={radius} />
        </clipPath>
        <image
          id={`${id}-photo`}
          data-name={`${id}-photo`}
          href={asset.href}
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#clip-${id})`}
        />
        {scrim !== "none" ? (
          <>
            <linearGradient
              id={`scrim-${id}`}
              x1="0"
              y1={scrim === "top" ? "1" : "0"}
              x2="0"
              y2={scrim === "top" ? "0" : "1"}
            >
              {scrim === "full" ? (
                <>
                  {/* Even wash: a bright photograph needs a floor of darkness
                      everywhere, not only at one edge. */}
                  <stop offset="0" stopColor={scrimInk} stopOpacity="0.62" />
                  <stop offset="1" stopColor={scrimInk} stopOpacity="0.74" />
                </>
              ) : (
                <>
                  <stop offset="0" stopColor={scrimInk} stopOpacity="0.05" />
                  <stop offset="1" stopColor={scrimInk} stopOpacity="0.82" />
                </>
              )}
            </linearGradient>
            <rect
              id={`${id}-scrim`}
              data-name={`${id}-scrim`}
              x={box.x}
              y={scrimY}
              width={box.w}
              height={scrimH}
              fill={`url(#scrim-${id})`}
              clipPath={`url(#clip-${id})`}
            />
          </>
        ) : null}
        {caption ? (
          <FittedLine
            name={`${id}-caption`}
            text={caption}
            x={box.x + 26}
            y={scrim === "top" ? box.y + 24 : box.y + box.h - 44}
            maxWidth={box.w - 52}
            maxSize={16}
            minSize={11}
            role={theme.fonts.mono ? "mono" : "body"}
            theme={theme}
            fill={ensureContrast("#ffffff", scrimInk)}
            weight={theme.fonts.weights.label}
            tracking={0.08}
            uppercase
          />
        ) : null}
      </Group>
    );
  },
};

/** Deterministic organic blob path: eight points around an ellipse, jittered by the seeded RNG. */
function blobPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rng: { float: () => number },
): string {
  const n = 8;
  const pts = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2;
    const jitter = 0.78 + rng.float() * 0.22;
    return { x: cx + Math.cos(angle) * rx * jitter, y: cy + Math.sin(angle) * ry * jitter };
  });
  // Catmull-Rom through the points, converted to cubic Béziers, closed.
  let d = `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return `${d} Z`;
}

const maskedImage: ComponentModule = {
  manifest: {
    id: "masked-image",
    category: "evidence",
    purpose:
      "A photograph cut into a deliberate shape — circle, arch, pill or organic blob. The florist/boutique/editorial device that makes an image feel composed rather than pasted. Requires a prepared image asset.",
    roles: ["evidence"],
    minSize: { w: 260, h: 260 },
    maxSize: { w: 980, h: 1180 },
    topologies: "any",
    assetSlots: 1,
    motion: "mask reveals",
  },
  props: z.object({
    shape: z.enum(["circle", "arch", "pill", "blob"]).default("circle"),
    /** Draw an accent ring just outside the mask edge. */
    ring: z.boolean().default(false),
  }),
  intrinsicHeight: (p, _t, width) => {
    const { shape } = p as { shape: "circle" | "arch" | "pill" | "blob" };
    return shape === "arch" ? width * 1.35 : shape === "pill" ? width * 1.5 : width;
  },
  render: ({ id, box, theme, props, assets, rng }) => {
    const { shape, ring } = props as {
      shape: "circle" | "arch" | "pill" | "blob";
      ring: boolean;
    };
    const asset = assets[0];
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);

    // One node builder serves clip, placeholder fill and ring, so all three are
    // guaranteed to trace the same edge. The blob path is computed exactly once
    // — it consumes the element's seeded rng and must not be re-drawn.
    const blobD =
      shape === "blob"
        ? blobPath(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, rng)
        : null;
    const shapeNode = (extra: {
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
    }) => {
      const common = { fill: extra.fill ?? "none", stroke: extra.stroke, strokeWidth: extra.strokeWidth };
      if (shape === "circle") {
        const r = Math.min(box.w, box.h) / 2;
        return <circle cx={box.x + box.w / 2} cy={box.y + box.h / 2} r={r} {...common} />;
      }
      if (shape === "pill") {
        return (
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            rx={box.w / 2}
            ry={box.w / 2}
            {...common}
          />
        );
      }
      if (shape === "arch") {
        const r = box.w / 2;
        const d = `M ${box.x} ${box.y + box.h} L ${box.x} ${box.y + r} A ${r} ${r} 0 0 1 ${box.x + box.w} ${box.y + r} L ${box.x + box.w} ${box.y + box.h} Z`;
        return <path d={d} {...common} />;
      }
      return <path d={blobD!} {...common} />;
    };

    if (!asset) {
      return (
        <Group name={id}>
          {shapeNode({ fill: mix(theme.palette.bg, theme.palette.accent, 0.18) })}
        </Group>
      );
    }

    return (
      <Group name={id}>
        <clipPath id={`clip-${id}`}>{shapeNode({ fill: undefined })}</clipPath>
        <image
          id={`${id}-photo`}
          data-name={`${id}-photo`}
          href={asset.href}
          x={box.x}
          y={box.y}
          width={box.w}
          height={box.h}
          preserveAspectRatio="xMidYMid slice"
          clipPath={`url(#clip-${id})`}
        />
        {ring ? (
          <Group name={`${id}-ring`}>
            {shapeNode({ stroke: accent, strokeWidth: theme.material.surface.strokeWidth * 2 })}
          </Group>
        ) : null}
      </Group>
    );
  },
};

export const EVIDENCE_COMPONENTS: ComponentModule[] = [
  browserFrame,
  phoneFrame,
  documentCard,
  beforeAfterStack,
  scoreRing,
  annotationLabel,
  uiFragment,
  assetImage,
  photoHero,
  maskedImage,
  checklistCard,
  chatExchange,
];
