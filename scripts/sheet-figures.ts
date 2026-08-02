/**
 * Renders one flyer per composed-figure arrangement, so the thing an agent can
 * assemble is visible without a single model call.
 *
 * The point is not that these particular figures are good — it is that they are
 * *different from each other*, built from the same mechanism, and that none of
 * them exists as a component. If this sheet ever comes back looking like one
 * arrangement in several palettes, relational placement has failed the same way
 * the component library did.
 *
 *   npm run sheet:figures -- [seed]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fixtureLineages, fixtureSpec } from "../test/fixtures.js";
import { renderSpec, rasterize } from "../src/core/render/index.js";
import { parseSpec } from "../src/core/compose/spec.js";

const seed = process.argv[2] ?? "FIG-0001";
const OUT = ".scratch/figures";

/** Each entry is a one-off an agent could have written for a real brief. */
const FIGURES: { name: string; parts: unknown[] }[] = [
  {
    name: "sun-over-hills",
    parts: [
      { id: "sun", draw: { kind: "shape", form: "circle" }, size: "large", at: { at: "center" }, tone: "accent", layer: "behind" },
      { id: "hill", draw: { kind: "shape", form: "arch" }, size: "huge", at: { of: "sun", side: "below", gap: "touching" }, tone: "ink" },
      { id: "bird", draw: { kind: "motif", motif: "plane" }, size: "tiny", at: { of: "sun", side: "top-right-of", gap: "near" }, tone: "ink", layer: "front" },
      { id: "cloud", draw: { kind: "motif", motif: "cloud" }, size: "small", at: { of: "sun", side: "left-of", gap: "far" }, tone: "muted" },
    ],
  },
  {
    name: "stamped-badge",
    parts: [
      { id: "seal", draw: { kind: "shape", form: "seal" }, size: "huge", at: { at: "center" }, tone: "accent" },
      { id: "word", draw: { kind: "word", text: "FREE" }, size: "medium", at: { of: "seal", side: "on" }, tone: "paper", layer: "front" },
      { id: "spark", draw: { kind: "shape", form: "sparkle" }, size: "small", at: { of: "seal", side: "top-right-of", gap: "tight" }, tone: "ink", layer: "front" },
      { id: "spark2", draw: { kind: "shape", form: "sparkle" }, size: "tiny", at: { of: "seal", side: "bottom-left-of", gap: "tight" }, tone: "ink", layer: "front" },
    ],
  },
  {
    name: "drifting-leaves",
    parts: [
      { id: "blob", draw: { kind: "shape", form: "blob" }, size: "huge", at: { at: "center" }, tone: "ground", layer: "behind" },
      { id: "l1", draw: { kind: "motif", motif: "leaf" }, size: "small", at: { at: "top-left" }, tone: "accent", rotate: -18 },
      { id: "l2", draw: { kind: "motif", motif: "leaf" }, size: "medium", at: { of: "l1", side: "bottom-right-of", gap: "far" }, tone: "ink", rotate: 12 },
      { id: "l3", draw: { kind: "motif", motif: "leaf" }, size: "tiny", at: { of: "l2", side: "right-of", gap: "far" }, tone: "muted", rotate: 26 },
      { id: "squig", draw: { kind: "shape", form: "squiggle" }, size: "large", at: { at: "bottom" }, tone: "accent" },
    ],
  },
  {
    name: "ticket-lockup",
    parts: [
      { id: "band", draw: { kind: "shape", form: "ribbon" }, size: "huge", at: { at: "center" }, tone: "accent" },
      { id: "label", draw: { kind: "word", text: "TONIGHT" }, size: "medium", at: { of: "band", side: "on" }, tone: "paper", layer: "front" },
      { id: "tkt", draw: { kind: "motif", motif: "ticket" }, size: "small", at: { of: "band", side: "above", gap: "near" }, tone: "ink", rotate: -8 },
      { id: "tape", draw: { kind: "shape", form: "tape" }, size: "medium", at: { of: "band", side: "top-left-of", gap: "tight" }, tone: "muted", rotate: -22, layer: "front" },
    ],
  },
  {
    name: "route-of-pins",
    parts: [
      { id: "p1", draw: { kind: "motif", motif: "pin" }, size: "medium", at: { at: "top-left" }, tone: "accent" },
      { id: "p2", draw: { kind: "motif", motif: "pin" }, size: "medium", at: { of: "p1", side: "bottom-right-of", gap: "far" }, tone: "ink" },
      { id: "p3", draw: { kind: "motif", motif: "pin" }, size: "medium", at: { of: "p2", side: "bottom-right-of", gap: "far" }, tone: "accent" },
      { id: "comp", draw: { kind: "motif", motif: "compass" }, size: "small", at: { at: "bottom-left" }, tone: "muted" },
    ],
  },
  {
    name: "outlined-burst",
    parts: [
      { id: "ring", draw: { kind: "shape", form: "burst", outline: true }, size: "huge", at: { at: "center" }, tone: "ink" },
      { id: "hex", draw: { kind: "shape", form: "polygon", sides: 6 }, size: "medium", at: { of: "ring", side: "on" }, tone: "accent" },
      { id: "star", draw: { kind: "shape", form: "star" }, size: "tiny", at: { of: "hex", side: "top-right-of", gap: "tight" }, tone: "paper", layer: "front" },
    ],
  },
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const lineages = fixtureLineages(seed, FIGURES.length);

  for (const [i, figure] of FIGURES.entries()) {
    const base = fixtureSpec(lineages[i]!);
    // Swap the evidence element for the composed figure, leaving the rest of
    // the flyer — headline, CTA, brand — exactly as the fixture has it, so what
    // changes between cells is only the figure.
    const spec = parseSpec({
      ...base,
      elements: base.elements.map((el) =>
        el.role === "evidence"
          ? {
              id: el.id,
              component: "composed-figure",
              role: "evidence",
              whyHere: "carries the idea as one drawn object rather than a stock photograph",
              props: { parts: figure.parts },
            }
          : el,
      ),
    });

    const { svg } = renderSpec(spec);
    writeFileSync(`${OUT}/${figure.name}.png`, rasterize(svg, 0.5));
    console.log(`${figure.name}  (${figure.parts.length} parts, lineage ${lineages[i]!.graphics})`);
  }
  console.log(`\n${FIGURES.length} figures → ${OUT}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
