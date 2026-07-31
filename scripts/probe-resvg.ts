/**
 * Throwaway: measures which SVG features the installed resvg build actually
 * renders. The decoration work depends on textPath, patterns, gradients and
 * filters, and @resvg/resvg-js documents none of its coverage — so we look
 * rather than assume. Delete once the answers are folded into the code.
 *
 *   npx tsx scripts/probe-resvg.ts
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { fontFiles } from "../src/core/render/fonts.js";

const OUT = ".scratch/tmp/probe";
mkdirSync(OUT, { recursive: true });

/** Each probe draws in bright green on white; a blank tile means unsupported. */
const PROBES: Record<string, string> = {
  textPath: `
    <defs><path id="arc" d="M 20 170 A 130 130 0 0 1 280 170" fill="none"/></defs>
    <text font-family="Inter" font-size="44" font-weight="700" fill="#12A150">
      <textPath href="#arc" startOffset="50%" text-anchor="middle">ARCHED TEXT</textPath>
    </text>`,

  pattern: `
    <defs>
      <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse">
        <circle cx="12" cy="12" r="5" fill="#12A150"/>
      </pattern>
    </defs>
    <rect x="20" y="20" width="260" height="160" fill="url(#dots)"/>`,

  radialGradient: `
    <defs>
      <radialGradient id="rg"><stop offset="0" stop-color="#12A150"/><stop offset="1" stop-color="#ffffff"/></radialGradient>
    </defs>
    <rect x="20" y="20" width="260" height="160" fill="url(#rg)"/>`,

  linearGradient: `
    <defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#12A150"/><stop offset="1" stop-color="#ffffff"/></linearGradient>
    </defs>
    <rect x="20" y="20" width="260" height="160" fill="url(#lg)"/>`,

  feGaussianBlur: `
    <defs><filter id="blur"><feGaussianBlur stdDeviation="8"/></filter></defs>
    <rect x="60" y="40" width="180" height="120" fill="#12A150" filter="url(#blur)"/>`,

  feTurbulence: `
    <defs>
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="3"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
    </defs>
    <rect x="20" y="20" width="260" height="160" fill="#12A150"/>
    <rect x="20" y="20" width="260" height="160" filter="url(#grain)" opacity="0.6"/>`,

  feDropShadow: `
    <defs><filter id="ds"><feDropShadow dx="6" dy="8" stdDeviation="4" flood-opacity="0.5"/></filter></defs>
    <rect x="60" y="40" width="180" height="120" fill="#12A150" filter="url(#ds)"/>`,

  mixBlendMode: `
    <rect x="40" y="40" width="150" height="120" fill="#12A150"/>
    <rect x="110" y="70" width="150" height="120" fill="#E0409B" style="mix-blend-mode: multiply"/>`,

  mask: `
    <defs>
      <mask id="m">
        <rect x="0" y="0" width="300" height="200" fill="#000"/>
        <circle cx="150" cy="100" r="70" fill="#fff"/>
      </mask>
    </defs>
    <rect x="20" y="20" width="260" height="160" fill="#12A150" mask="url(#m)"/>`,

  strokeDashPath: `
    <path d="M 20 160 C 100 20, 200 200, 280 60" fill="none" stroke="#12A150"
          stroke-width="6" stroke-dasharray="14 12" stroke-linecap="round"/>`,

  textStroke: `
    <text x="150" y="120" font-family="Inter" font-size="72" font-weight="900"
          text-anchor="middle" fill="none" stroke="#12A150" stroke-width="3">OUTLINE</text>`,

  groupOpacityRotate: `
    <g transform="rotate(-12 150 100)" opacity="0.75">
      <rect x="60" y="50" width="180" height="100" fill="#12A150"/>
    </g>`,
};

/**
 * Deliberately NO automated verdict. An earlier version scored "ink coverage" by
 * counting non-0xff bytes in the compressed PNG and reported every feature as
 * unsupported — compressed bytes say nothing about what was drawn. The only
 * trustworthy check is looking, so this writes a contact sheet and stops.
 */
function render(name: string, body: string): { bytes: number; error?: string } {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="300" height="200" viewBox="0 0 300 200">
  <rect width="300" height="200" fill="#ffffff"/>
  ${body}
</svg>`;
  try {
    const png = Buffer.from(
      new Resvg(svg, {
        font: { fontFiles: fontFiles(), loadSystemFonts: false, defaultFontFamily: "Inter" },
        logLevel: "error",
      })
        .render()
        .asPng(),
    );
    writeFileSync(`${OUT}/${name}.png`, png);
    return { bytes: png.length };
  } catch (error) {
    return { bytes: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

render("_control-blank", "");
for (const [name, body] of Object.entries(PROBES)) {
  const r = render(name, body);
  console.log(`${name.padEnd(20)} ${r.error ? `THREW: ${r.error}` : `${r.bytes} bytes`}`);
}

console.log(`\nPNGs in ${OUT}/. LOOK AT THEM — a feature can throw no error and still draw nothing.`);
