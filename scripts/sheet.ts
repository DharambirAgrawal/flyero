/**
 * Renders a contact sheet of fixture flyers — one per sampled lineage — so the
 * output quality across the creative space can be eyeballed without spending a
 * single model call. Deterministic: the same seed always produces this sheet.
 *
 *   npm run sheet -- [seed] [count]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { fixtureLineages, fixtureSpec } from "../test/fixtures.js";
import { renderSpec, rasterize } from "../src/core/render/index.js";
import { solveLayout } from "../src/core/layout/solver.js";
import { themeFromSpec } from "../src/core/render/theme.js";
import { runGates } from "../src/core/gates/index.js";
import { describeLineage } from "../src/core/studio/sampler.js";
import { fontFiles } from "../src/core/render/fonts.js";

const seed = process.argv[2] ?? "SHEET-0001";
const count = Number(process.argv[3] ?? 8);
const OUT = ".scratch/sheet";

const COLS = 4;
const CELL_W = 460;
const CELL_H = 575;
const GAP = 28;
const LABEL = 34;

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const lineages = fixtureLineages(seed, count);
  const cells: string[] = [];

  for (const [i, lineage] of lineages.entries()) {
    const spec = fixtureSpec(lineage);
    const { svg } = renderSpec(spec);
    const png = rasterize(svg, 0.5);
    writeFileSync(`${OUT}/flyer-${i}.png`, png);

    const gates = await runGates(
      { spec, layout: solveLayout(spec, themeFromSpec(spec)), requestedAssetIds: [] },
      { jobId: null, apiKey: "sheet", stage: "gates" },
    );
    const marks = Object.entries(gates.detail)
      .map(([g, ok]) => `${g}${ok ? "+" : "-"}`)
      .join(" ");

    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = GAP + col * (CELL_W + GAP);
    const y = GAP + row * (CELL_H + LABEL + GAP);

    cells.push(`
    <g>
      <image x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}"
             href="data:image/png;base64,${png.toString("base64")}" />
      <rect x="${x}" y="${y}" width="${CELL_W}" height="${CELL_H}" fill="none" stroke="#d6d1c8" stroke-width="1"/>
      <text x="${x}" y="${y + CELL_H + 15}" font-family="Inter" font-size="11" fill="#3b3a36">${escapeXml(
        `${lineage.metaphor} · ${lineage.topology}`,
      )}</text>
      <text x="${x}" y="${y + CELL_H + 29}" font-family="Inter" font-size="10" fill="#8a857c">${escapeXml(
        `${lineage.typography} · ${lineage.material} · ${marks}`,
      )}</text>
    </g>`);

    console.log(`${i}. ${describeLineage(lineage)}  ${marks}`);
  }

  const rows = Math.ceil(count / COLS);
  const width = GAP + COLS * (CELL_W + GAP);
  const height = GAP + rows * (CELL_H + LABEL + GAP) + 40;

  const sheet = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#f2efe9"/>
  <text x="${GAP}" y="${height - 16}" font-family="Inter" font-size="12" fill="#8a857c">Flyero — ${count} sampled designers, one brief, seed ${escapeXml(seed)}</text>
  ${cells.join("\n")}
</svg>`;

  const out = new Resvg(sheet, {
    font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Inter" },
  })
    .render()
    .asPng();
  writeFileSync(`${OUT}/sheet.png`, out);
  console.log(`\nwrote ${OUT}/sheet.png (${out.length} bytes)`);
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
