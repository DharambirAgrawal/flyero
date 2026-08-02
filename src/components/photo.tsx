import { z } from "zod";
import { FittedLine, Group, inkFor, mutedInkFor } from "./primitives.js";
import type { AssetRef, ComponentModule } from "./types.js";
import { focalPreserveAspect } from "./assets.js";
import { ensureContrast, mix, withAlpha } from "../creative/color.js";
import { shadowFor } from "../core/canvas/light.js";
import {
  MOTIFS,
  arcBands,
  blobPath,
  dashedRoutePath,
  ellipsePath,
  motifTransform,
  polyline,
  routeMidpoint,
  sparklePath,
  squigglePath,
  starPath,
  tornEdgePath,
  hillPath,
  coniferPath,
  broadleafPath,
  figurePath,
  waterBandPath,
  type MotifName,
} from "./shapes.js";

/**
 * Photo-composition components — the *ways* an image can land on a page.
 *
 * The library already had "a photograph in a rectangle" several times over.
 * What it had no way to express is the thing that makes a real poster read as
 * designed: three circular cutouts joined by a dashed route, a stack of tilted
 * prints, a torn edge, a grid that rhymes. Choosing between those is a genuine
 * design decision, so unlike ornament these are Composer-selectable and *do*
 * count against the 4–7 element budget.
 *
 * `motif-collage` is the deliberate exception: it needs no photograph at all.
 * Plenty of briefs have no image worth showing, and the honest answer there is
 * a composed arrangement of drawn marks rather than a stock photo of nothing.
 */

/** Places an image to cover a box without distorting it — SVG's own object-fit. */
function coverImage(id: string, box: { x: number; y: number; w: number; h: number }, asset: AssetRef) {
  return (
    <image
      id={`${id}-photo`}
      data-name={`${id}-photo`}
      href={asset.href}
      x={box.x}
      y={box.y}
      width={box.w}
      height={box.h}
      preserveAspectRatio={focalPreserveAspect(asset)}
    />
  );
}

/** Stand-in fill when the brief supplied no image for this slot. */
function placeholder(theme: { palette: { bg: string; accent: string } }): string {
  return mix(theme.palette.bg, theme.palette.accent, 0.22);
}

// ── photo-cluster ───────────────────────────────────────────────────────────

/**
 * Circular cutouts arranged along a bowed line and joined by a dashed route —
 * the single most recognisable device in travel and event posters, and the one
 * that turns three unrelated photographs into a journey.
 */
const photoCluster: ComponentModule = {
  manifest: {
    id: "photo-cluster",
    visual: { shape: "circle-row", aspect: 1.6, density: "medium", carriesTone: true, reads: "A wide horizontal run of circular photo cutouts joined by a dashed curve; reads as a route across the page and needs width, not height." },
    category: "evidence",
    purpose:
      "Two to four circular photo cutouts strung along a curve and joined by a dashed route, with an optional travel motif riding the line. Turns several images into one journey — the travel, events and itinerary device. Works with fewer images than slots.",
    roles: ["evidence"],
    minSize: { w: 420, h: 300 },
    maxSize: { w: 1180, h: 900 },
    topologies: "any",
    assetSlots: 4,
    motion: "route draws on",
  },
  props: z.object({
    /** How far the string of photos bows. 0 is a straight line. */
    bow: z.number().min(-0.4).max(0.4).default(0.22),
    /** The mark that rides the route. */
    motif: z.enum(["plane", "pin", "compass", "none"]).default("plane"),
    ring: z.boolean().default(true),
  }),
  intrinsicHeight: (_p, _t, width) => width * 0.72,
  render: ({ id, box, theme, props, assets }) => {
    const { bow, motif, ring } = props as {
      bow: number;
      motif: "plane" | "pin" | "compass" | "none";
      ring: boolean;
    };
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
    const ink = inkFor(theme, box);

    // At least two stops, so the route has something to connect.
    const count = Math.min(Math.max(assets.length, 2), 4);
    const pad = box.w * 0.05;

    // The radius has to account for the gaps between stops, not just the count.
    // Sizing it independently lets two large circles overlap into a blob, which
    // is exactly what this component exists to avoid.
    const GAP_RATIO = 0.34; // gap as a fraction of a diameter
    const slots = count * 2 + (count - 1) * GAP_RATIO;
    const lift = Math.abs(bow) * box.h * 0.5;
    const radius = Math.min((box.w - pad * 2) / slots, (box.h - pad * 2 - lift) / 2);

    const diameter = radius * 2;
    const gap = radius * GAP_RATIO;
    const runWidth = count * diameter + (count - 1) * gap;
    const startX = box.x + (box.w - runWidth) / 2 + radius;

    // Stops evenly spaced, each lifted along the bow.
    const raw = Array.from({ length: count }, (_, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1);
      // A parabola through the bow: ends low, middle lifted.
      return { x: startX + i * (diameter + gap), lift: (0.5 - Math.abs(t - 0.5)) * 2 * bow * box.h };
    });

    // Re-centre the whole arrangement vertically. Without this the bow pushes
    // the run against one edge and leaves a band of dead space at the other.
    const lifts = raw.map((s) => s.lift);
    const mid = (Math.max(...lifts) + Math.min(...lifts)) / 2;
    const stops = raw.map((s) => ({ x: s.x, y: box.y + box.h / 2 - (s.lift - mid) }));

    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    const routeMid = routeMidpoint(first, last, bow);

    return (
      <Group name={id}>
        {/* The route sits behind the cutouts so it appears to pass under them. */}
        <Group name={`${id}-route`}>
          {stops.slice(0, -1).map((from, i) => (
            <path
              key={i}
              d={dashedRoutePath(from, stops[i + 1]!, bow * 0.6)}
              fill="none"
              stroke={withAlpha(accent, 0.85)}
              strokeWidth={Math.max(2.5, box.w * 0.006)}
              strokeDasharray={`${Math.round(box.w * 0.022)} ${Math.round(box.w * 0.018)}`}
              strokeLinecap="round"
            />
          ))}
        </Group>

        <Group name={`${id}-stops`}>
          {stops.map((stop, i) => {
            const asset = assets[i];
            const clipId = `clip-${id}-${i}`;
            return (
              <g key={i}>
                <clipPath id={clipId}>
                  <circle cx={stop.x} cy={stop.y} r={radius} />
                </clipPath>
                {asset ? (
                  <g clipPath={`url(#${clipId})`}>
                    {coverImage(
                      `${id}-${i}`,
                      { x: stop.x - radius, y: stop.y - radius, w: radius * 2, h: radius * 2 },
                      asset,
                    )}
                  </g>
                ) : (
                  <circle cx={stop.x} cy={stop.y} r={radius} fill={placeholder(theme)} />
                )}
                {ring ? (
                  <circle
                    cx={stop.x}
                    cy={stop.y}
                    r={radius}
                    fill="none"
                    stroke={accent}
                    strokeWidth={Math.max(2, box.w * 0.005)}
                  />
                ) : null}
              </g>
            );
          })}
        </Group>

        {motif !== "none"
          ? (() => {
              // Ride clear of the cutouts rather than on them: offset along the
              // route's normal by more than a radius, on the outside of the bow.
              const size = box.w * 0.085;
              const rad = (routeMid.angle * Math.PI) / 180;
              const side = bow >= 0 ? -1 : 1;
              const off = radius + size * 0.75;
              const mx = routeMid.x - Math.sin(rad) * off * side;
              const my = routeMid.y + Math.cos(rad) * off * side;
              return (
                <g transform={motifTransform(mx - size / 2, my - size / 2, size, routeMid.angle)}>
                  <path d={MOTIFS[motif].d} fill={accent} fillRule={MOTIFS[motif].fillRule} />
                </g>
              );
            })()
          : null}
      </Group>
    );
  },
};

// ── polaroid-stack ──────────────────────────────────────────────────────────

/** Overlapping tilted prints with white borders — the scrapbook/memory device. */
const polaroidStack: ComponentModule = {
  manifest: {
    id: "polaroid-stack",
    visual: { shape: "stack", aspect: 0.95, density: "heavy", carriesTone: true, reads: "Two or three tilted white-bordered prints overlapping, casting shadows; a compact, roughly square pile that reads as objects on a surface." },
    category: "evidence",
    purpose:
      "Two or three photographs as tilted instant prints with thick white borders, overlapping like a handful of snapshots on a table. Warm and personal — for events, food, portraits and anything nostalgic.",
    roles: ["evidence"],
    minSize: { w: 380, h: 380 },
    maxSize: { w: 1000, h: 1100 },
    topologies: "any",
    assetSlots: 3,
    motion: "prints fan out",
  },
  props: z.object({
    tilt: z.number().min(0).max(14).default(7),
    caption: z.string().max(40).default(""),
  }),
  intrinsicHeight: (_p, _t, width) => width * 1.02,
  render: ({ id, box, theme, props, assets, rng }) => {
    const { tilt, caption } = props as { tilt: number; caption: string };
    const count = Math.min(Math.max(assets.length, 1), 3);
    const border = box.w * 0.035;
    // Each print is smaller than the box so the fan has room to rotate.
    const cardW = box.w * 0.74;
    const cardH = Math.min(cardW * 1.16, box.h * 0.9);
    const paper = "#ffffff";
    const shadow = shadowFor(theme.light, Math.max(cardW, cardH), 1.1);

    return (
      <Group name={id}>
        <defs>
          <filter id={`psh-${id}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={shadow.blur} />
          </filter>
        </defs>
        {Array.from({ length: count }).map((_, i) => {
          // Drawn back to front; the last print is the one on top.
          const depth = count - 1 - i;
          const angle = depth === 0 ? 0 : (rng.float() - 0.5) * 2 * tilt;
          const dx = (rng.float() - 0.5) * box.w * 0.1;
          const dy = depth * box.h * 0.035;
          const x = box.x + (box.w - cardW) / 2 + dx;
          const y = box.y + (box.h - cardH) / 2 - dy;
          const asset = assets[count - 1 - depth];
          const clipId = `clip-${id}-${i}`;
          const photo = {
            x: x + border,
            y: y + border,
            w: cardW - border * 2,
            // Instant prints have a deeper lip at the foot — that is the whole look.
            h: cardH - border * 3.2,
          };
          return (
            <g
              key={i}
              transform={`rotate(${angle.toFixed(2)} ${(x + cardW / 2).toFixed(2)} ${(y + cardH / 2).toFixed(2)})`}
            >
              {/* Every print catches the same light, so a stack reads as one
                  pile of objects rather than several unrelated stickers. */}
              <rect
                x={x + shadow.dx}
                y={y + shadow.dy}
                width={cardW}
                height={cardH}
                fill={shadow.fill}
                filter={`url(#psh-${id})`}
              />
              <rect x={x} y={y} width={cardW} height={cardH} fill={paper} />
              <clipPath id={clipId}>
                <rect x={photo.x} y={photo.y} width={photo.w} height={photo.h} />
              </clipPath>
              {asset ? (
                <g clipPath={`url(#${clipId})`}>{coverImage(`${id}-${i}`, photo, asset)}</g>
              ) : (
                <rect
                  x={photo.x}
                  y={photo.y}
                  width={photo.w}
                  height={photo.h}
                  fill={placeholder(theme)}
                />
              )}
              {depth === 0 && caption ? (
                <FittedLine
                  name={`${id}-caption`}
                  text={caption}
                  x={photo.x}
                  y={photo.y + photo.h + border * 0.35}
                  maxWidth={photo.w}
                  maxSize={border * 0.9}
                  minSize={10}
                  role="body"
                  theme={theme}
                  fill="#3a3a38"
                  align="middle"
                />
              ) : null}
            </g>
          );
        })}
      </Group>
    );
  },
};

// ── photo-grid ──────────────────────────────────────────────────────────────

/** A rhyming grid of images — the editorial/lookbook device. */
const photoGrid: ComponentModule = {
  manifest: {
    id: "photo-grid",
    visual: { shape: "grid", aspect: 1.05, density: "heavy", carriesTone: true, reads: "A tight block of 2-4 photographs edge to edge; a solid rectangle of imagery with no ground showing through." },
    category: "evidence",
    purpose:
      "Two to four photographs in a tight grid with a consistent gutter, optionally with one cell running larger. The lookbook, menu and portfolio device — shows range rather than a single hero.",
    roles: ["evidence"],
    minSize: { w: 360, h: 320 },
    maxSize: { w: 1180, h: 1100 },
    topologies: "any",
    assetSlots: 4,
    motion: "cells stagger in",
  },
  props: z.object({
    gutter: z.number().min(0).max(40).default(12),
    /** Gives the first cell a double-width row — stops a 2×2 reading as a table. */
    feature: z.boolean().default(true),
    // A hard 0 clip is the one thing every sibling evidence component avoids
    // (each bakes in its own edge device); this default gives photo-grid one too.
    radius: z.number().min(0).max(60).default(10),
  }),
  intrinsicHeight: (_p, _t, width) => width * 0.95,
  render: ({ id, box, theme, props, assets }) => {
    const { gutter, feature, radius } = props as {
      gutter: number;
      feature: boolean;
      radius: number;
    };
    const count = Math.min(Math.max(assets.length, 2), 4);

    // Cell rects, chosen so the grid never reads as an even, inert table.
    const cells: { x: number; y: number; w: number; h: number }[] = [];
    if (count === 2) {
      const h = (box.h - gutter) / 2;
      cells.push({ x: box.x, y: box.y, w: box.w, h }, { x: box.x, y: box.y + h + gutter, w: box.w, h });
    } else if (count === 3) {
      const topH = feature ? box.h * 0.58 : (box.h - gutter) / 2;
      const botH = box.h - topH - gutter;
      const halfW = (box.w - gutter) / 2;
      cells.push(
        { x: box.x, y: box.y, w: box.w, h: topH },
        { x: box.x, y: box.y + topH + gutter, w: halfW, h: botH },
        { x: box.x + halfW + gutter, y: box.y + topH + gutter, w: halfW, h: botH },
      );
    } else {
      const halfW = (box.w - gutter) / 2;
      const topH = feature ? box.h * 0.54 : (box.h - gutter) / 2;
      const botH = box.h - topH - gutter;
      const thirdW = (box.w - gutter) / 2;
      cells.push(
        { x: box.x, y: box.y, w: feature ? box.w : halfW, h: topH },
        ...(feature
          ? [
              { x: box.x, y: box.y + topH + gutter, w: thirdW, h: botH },
              { x: box.x + thirdW + gutter, y: box.y + topH + gutter, w: thirdW, h: botH },
            ]
          : [
              { x: box.x + halfW + gutter, y: box.y, w: halfW, h: topH },
              { x: box.x, y: box.y + topH + gutter, w: halfW, h: botH },
            ]),
        { x: box.x + halfW + gutter, y: box.y + topH + gutter, w: halfW, h: botH },
      );
    }

    return (
      <Group name={id}>
        {cells.slice(0, count).map((cell, i) => {
          const asset = assets[i];
          const clipId = `clip-${id}-${i}`;
          return (
            <g key={i}>
              <rect
                x={cell.x}
                y={cell.y + 2}
                width={cell.w}
                height={cell.h}
                rx={radius}
                ry={radius}
                fill="#000000"
                opacity={0.12}
              />
              <clipPath id={clipId}>
                <rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} rx={radius} ry={radius} />
              </clipPath>
              {asset ? (
                <g clipPath={`url(#${clipId})`}>{coverImage(`${id}-${i}`, cell, asset)}</g>
              ) : (
                <rect
                  x={cell.x}
                  y={cell.y}
                  width={cell.w}
                  height={cell.h}
                  rx={radius}
                  ry={radius}
                  fill={placeholder(theme)}
                />
              )}
            </g>
          );
        })}
      </Group>
    );
  },
};

// ── torn-photo ──────────────────────────────────────────────────────────────

/** A photograph with a torn paper edge — the collage/zine device. */
const tornPhoto: ComponentModule = {
  manifest: {
    id: "torn-photo",
    visual: { shape: "rectangle", aspect: 0.9, density: "heavy", carriesTone: true, reads: "One photograph with a ragged torn edge over an offset colour block; a solid upright rectangle with one irregular side." },
    category: "evidence",
    purpose:
      "A single photograph with one edge torn like paper, optionally over a offset colour block. The collage, zine and hand-made register — good when a clean rectangle would feel corporate.",
    roles: ["evidence"],
    minSize: { w: 320, h: 320 },
    maxSize: { w: 1180, h: 1200 },
    topologies: "any",
    assetSlots: 1,
    motion: "tear reveals",
  },
  props: z.object({
    edge: z.enum(["top", "bottom", "left", "right"]).default("bottom"),
    /** Offset colour block behind the photo, the way a cut-out is pasted down. */
    backing: z.boolean().default(true),
  }),
  intrinsicHeight: (_p, _t, width) => width * 1.08,
  render: ({ id, box, theme, props, assets, rng }) => {
    const { edge, backing } = props as {
      edge: "top" | "bottom" | "left" | "right";
      backing: boolean;
    };
    const asset = assets[0];
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
    const inset = backing ? box.w * 0.035 : 0;
    const photoBox = { x: box.x, y: box.y, w: box.w - inset, h: box.h - inset };
    const d = tornEdgePath(photoBox, edge, rng);

    return (
      <Group name={id}>
        {backing ? (
          <rect
            x={box.x + inset}
            y={box.y + inset}
            width={photoBox.w}
            height={photoBox.h}
            fill={withAlpha(accent, 0.35)}
          />
        ) : null}
        <clipPath id={`clip-${id}`}>
          <path d={d} />
        </clipPath>
        {asset ? (
          <g clipPath={`url(#clip-${id})`}>{coverImage(id, photoBox, asset)}</g>
        ) : (
          <path d={d} fill={placeholder(theme)} />
        )}
      </Group>
    );
  },
};

// ── motif-collage ───────────────────────────────────────────────────────────

/**
 * No photograph at all.
 *
 * Not every brief has an image worth showing, and a stock photo of nothing is
 * worse than an honest drawing. This composes drawn marks — a blob field, a
 * motif, an arc, a sparkle — into a small arrangement that carries the idea.
 * It is the only evidence component that needs no asset, which makes it the
 * fallback that keeps the cover test reachable for abstract offers.
 */
const motifCollage: ComponentModule = {
  manifest: {
    id: "motif-collage",
    visual: { shape: "freeform", aspect: 1.1, density: "sparse", carriesTone: false, reads: "A drawn symbol on a soft tinted shape with a few sparkles; light, open, and lets the page colour show through." },
    category: "evidence",
    purpose:
      "A composed arrangement of drawn shapes and a subject motif — no photograph required. For services, ideas and offers where there is nothing literal to photograph, and a stock image would say less than a drawing.",
    roles: ["evidence"],
    minSize: { w: 320, h: 300 },
    maxSize: { w: 1100, h: 1000 },
    topologies: "any",
    assetSlots: 0,
    motion: "marks assemble",
  },
  props: z.object({
    subject: z
      .enum([
        "plane",
        "pin",
        "suitcase",
        "camera",
        "mountain",
        "sun",
        "cloud",
        "leaf",
        "arrow",
        "ticket",
        "compass",
      ])
      .default("sun"),
    /** How the supporting marks are arranged around the subject. */
    arrangement: z.enum(["halo", "stack", "scatter"]).default("halo"),
  }),
  intrinsicHeight: (_p, _t, width) => width * 0.9,
  render: ({ id, box, theme, props, rng }) => {
    const { subject, arrangement } = props as {
      subject: MotifName;
      arrangement: "halo" | "stack" | "scatter";
    };
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
    const ink = inkFor(theme, box);
    const soft = withAlpha(accent, 0.22);

    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const r = Math.min(box.w, box.h) * 0.34;
    const size = r * 1.5;

    return (
      <Group name={id}>
        <Group name={`${id}-field`}>
          {arrangement === "halo" ? (
            <>
              <path d={blobPath(cx, cy, r * 1.5, r * 1.35, rng, { wobble: 0.24 })} fill={soft} />
              <path d={ellipsePath(cx, cy, r * 1.08, r * 1.08)} fill="none" stroke={accent} strokeWidth={Math.max(2, box.w * 0.005)} />
            </>
          ) : null}
          {arrangement === "stack" ? (
            <>
              {arcBands(cx, cy + r * 1.1, r * 1.5, 3).map((band, i) => (
                <path
                  key={i}
                  d={band.d}
                  fill="none"
                  stroke={i % 2 ? accent : soft}
                  strokeWidth={Math.max(8, r * 0.16)}
                />
              ))}
            </>
          ) : null}
          {arrangement === "scatter" ? (
            <>
              <path d={blobPath(cx - r * 0.7, cy - r * 0.5, r * 0.8, r * 0.7, rng)} fill={soft} />
              <path
                d={squigglePath(box.x + box.w * 0.12, cy + r * 1.15, box.w * 0.76, r * 0.14)}
                fill="none"
                stroke={accent}
                strokeWidth={Math.max(3, box.w * 0.008)}
                strokeLinecap="round"
              />
            </>
          ) : null}
        </Group>

        <g transform={motifTransform(cx - size / 2, cy - size / 2, size, 0)}>
          <path d={MOTIFS[subject].d} fill={ink} fillRule={MOTIFS[subject].fillRule} />
        </g>

        <Group name={`${id}-accents`}>
          <path d={sparklePath(box.x + box.w * 0.86, box.y + box.h * 0.16, r * 0.22)} fill={accent} />
          <path d={starPath(box.x + box.w * 0.12, box.y + box.h * 0.82, r * 0.14, r * 0.06, 4)} fill={accent} />
        </Group>
      </Group>
    );
  },
};



// ── detail-cluster ──────────────────────────────────────────────────────────

/**
 * Several small labelled facts as one element.
 *
 * The reference posters carry 12–30 visual objects; ours carry seven, because
 * Gate G3 caps elements at 4–7 and counts them literally. The answer is not to
 * raise G3 — restraint is the product — but to let a single element hold a
 * *cluster* of related facts. "17–18 June", "123 Anywhere St", "6pm" and
 * "free entry" are one idea (when and where), not four.
 *
 * This is where the missing density actually comes from.
 */
const detailCluster: ComponentModule = {
  manifest: {
    id: "detail-cluster",
    visual: { shape: "band", aspect: 5.0, density: "sparse", carriesTone: false, reads: "A thin horizontal strip of small labelled facts separated by hairlines; wants full width and very little height." },
    category: "content",
    purpose:
      "Two to six small labelled facts — date, place, time, price, phone, handle — set as one block in a row, a column or a grid. The practical information a poster needs without spending an element on each line.",
    roles: ["support"],
    minSize: { w: 260, h: 60 },
    maxSize: { w: 1080, h: 420 },
    topologies: "any",
    assetSlots: 0,
    motion: "facts stagger in",
  },
  props: z.object({
    arrangement: z.enum(["row", "column", "grid"]).default("row"),
    /** A hairline between facts, the way a ticket or a listing separates them. */
    dividers: z.boolean().default(true),
    uppercaseLabels: z.boolean().default(true),
  }),
  intrinsicHeight: (p, _t, width) => {
    const { arrangement } = p as { arrangement: "row" | "column" | "grid" };
    if (arrangement === "column") return 190;
    return arrangement === "grid" ? Math.max(120, width * 0.22) : 84;
  },
  render: ({ id, box, theme, copy, props }) => {
    const { arrangement, dividers, uppercaseLabels } = props as {
      arrangement: "row" | "column" | "grid";
      dividers: boolean;
      uppercaseLabels: boolean;
    };
    const facts: { label: string; value: string }[] = (copy.details ?? []).slice(0, 6);
    if (facts.length === 0) return <Group name={id}>{null}</Group>;

    const ink = inkFor(theme, box);
    const quiet = mutedInkFor(theme, box);
    const rule = withAlpha(ink, 0.28);

    // Columns per row: a row lays them all across, a grid wraps at three.
    const perRow = arrangement === "column" ? 1 : arrangement === "grid" ? Math.min(3, facts.length) : facts.length;
    const rows = Math.ceil(facts.length / perRow);
    const cellW = box.w / perRow;
    const cellH = box.h / rows;
    const labelSize = Math.max(10, Math.min(15, cellW * 0.075));
    const valueSize = Math.max(15, Math.min(30, cellW * 0.14));

    return (
      <Group name={id}>
        {facts.map((fact, i) => {
          const col = i % perRow;
          const row = Math.floor(i / perRow);
          const x = box.x + col * cellW;
          const y = box.y + row * cellH;
          return (
            <Group key={i} name={`${id}-fact-${i + 1}`}>
              {dividers && col > 0 ? (
                <line
                  x1={x - cellW * 0.04}
                  y1={y + cellH * 0.1}
                  x2={x - cellW * 0.04}
                  y2={y + cellH * 0.82}
                  stroke={rule}
                  strokeWidth={1}
                />
              ) : null}
              <FittedLine
                name={`${id}-fact-${i + 1}-label`}
                text={fact.label}
                x={x}
                y={y}
                maxWidth={cellW * 0.9}
                maxSize={labelSize}
                minSize={9}
                role={theme.fonts.mono ? "mono" : "body"}
                theme={theme}
                fill={quiet}
                tracking={0.1}
                uppercase={uppercaseLabels}
              />
              <FittedLine
                name={`${id}-fact-${i + 1}-value`}
                text={fact.value}
                x={x}
                y={y + labelSize * 1.9}
                maxWidth={cellW * 0.92}
                maxSize={valueSize}
                minSize={12}
                role="body"
                theme={theme}
                fill={ink}
                weight={theme.fonts.weights.label}
              />
            </Group>
          );
        })}
      </Group>
    );
  },
};


// ── scene-illustration ──────────────────────────────────────────────────────

/**
 * A drawn scene, not a photograph and not an icon.
 *
 * Nearly every reference save-the-trees and save-water poster is an illustrated
 * landscape — sky, hills, a treeline, sometimes figures — and the library had
 * no way to make one. `motif-collage` draws a single mark on an abstract field;
 * that is a badge, not a scene. Without this the engine could only answer every
 * campaign brief with stock photography, which is why the output kept coming
 * back as "photo with a caption".
 *
 * Built from flat forms in layered bands, because that is the register the
 * references actually use — flat vector, not rendering.
 */
const sceneIllustration: ComponentModule = {
  manifest: {
    id: "scene-illustration",
    visual: { shape: "rectangle", aspect: 1.45, density: "medium", carriesTone: true, reads: "A flat drawn landscape in layered bands — sky, hills, treeline — filling its box completely in the palette colours." },
    category: "evidence",
    purpose:
      "A drawn landscape — sky, hills, treeline, water, optional figures — composed in flat colour. No photograph needed. The default evidence for environmental, community and campaign briefs, where an illustrated scene says more than stock photography.",
    roles: ["evidence"],
    minSize: { w: 320, h: 240 },
    maxSize: { w: 1180, h: 1000 },
    topologies: "any",
    assetSlots: 0,
    motion: "layers rise in depth order",
  },
  props: z.object({
    subject: z.enum(["forest", "meadow", "riverside", "hills"]).default("forest"),
    /** Two silhouetted people, as in a planting-drive poster. */
    figures: z.boolean().default(false),
    sun: z.boolean().default(true),
  }),
  intrinsicHeight: (_p, _t, width) => width * 0.68,
  render: ({ id, box, theme, props, rng }) => {
    const { subject, figures, sun } = props as {
      subject: "forest" | "meadow" | "riverside" | "hills";
      figures: boolean;
      sun: boolean;
    };
    const accent = ensureContrast(theme.palette.accent, theme.palette.bg, true);
    /**
     * The depth ramp is anchored on white and black, not on the page colour.
     *
     * Deriving it from `bg` collapsed the whole scene: on a dark navy page the
     * sky, the hills and the trees all mixed toward the same navy and the
     * illustration read as one flat blue rectangle. Distance in flat vector
     * comes from *tone*, so the ramp has to span a real lightness range on its
     * own terms and let the accent supply only the hue.
     */
    const sky = mix(accent, "#ffffff", 0.72);
    const far = mix(accent, "#ffffff", 0.44);
    const mid = mix(accent, "#ffffff", 0.12);
    const near = mix(accent, "#000000", 0.52);
    const groundY = box.y + box.h;

    const hills = [
      { d: hillPath({ ...box, h: box.h * 0.82 }, 0.32, 0.5), fill: far },
      { d: hillPath({ ...box, y: box.y + box.h * 0.16, h: box.h * 0.84 }, 0.68, 0.42), fill: mid },
    ];

    // Treeline: sizes and spacing vary from the element's seeded stream, so the
    // row reads as trees rather than as a repeated stamp.
    const treeCount = subject === "meadow" ? 3 : subject === "hills" ? 4 : 7;
    const trees = Array.from({ length: treeCount }, (_, i) => {
      const t = (i + 0.5) / treeCount;
      const cx = box.x + box.w * t + (rng.float() - 0.5) * box.w * 0.05;
      // Held low and kept short. A treeline is scenery, not the subject: when
      // the trees grew to a third of the canvas they climbed straight through
      // the detail cluster and the words sat in the branches.
      const height = box.h * (subject === "meadow" ? 0.13 : 0.17) * (0.78 + rng.float() * 0.44);
      const baseY = groundY - box.h * 0.04 * rng.float();
      return subject === "forest" || subject === "hills"
        ? coniferPath(cx, baseY, height, 3)
        : broadleafPath(cx, baseY, height);
    });

    return (
      <Group name={id}>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={sky} />
        {sun ? (
          <circle
            cx={box.x + box.w * 0.76}
            cy={box.y + box.h * 0.2}
            r={Math.min(box.w, box.h) * 0.1}
            fill={mix(accent, "#ffffff", 0.3)}
          />
        ) : null}
        <Group name={`${id}-hills`}>
          {hills.map((hill, i) => (
            <path key={i} d={hill.d} fill={hill.fill} />
          ))}
        </Group>
        {subject === "riverside" ? (
          <path
            d={waterBandPath({ x: box.x, y: groundY - box.h * 0.22, w: box.w, h: box.h * 0.22 }, 3)}
            fill="none"
            stroke={withAlpha(near, 0.55)}
            strokeWidth={Math.max(2, box.h * 0.012)}
            strokeLinecap="round"
          />
        ) : null}
        <Group name={`${id}-trees`}>
          {trees.map((d, i) => (
            <path key={i} d={d} fill={near} fillRule="evenodd" />
          ))}
        </Group>
        {figures ? (
          <Group name={`${id}-figures`}>
            {[0.28, 0.42].map((t, i) => (
              <path
                key={i}
                d={figurePath(box.x + box.w * t, groundY, box.h * 0.26)}
                fill={mix(near, "#000000", 0.35)}
                fillRule="evenodd"
              />
            ))}
          </Group>
        ) : null}
      </Group>
    );
  },
};

export const PHOTO_COMPONENTS: ComponentModule[] = [
  photoCluster,
  polaroidStack,
  photoGrid,
  tornPhoto,
  motifCollage,
  detailCluster,
  sceneIllustration,
];
