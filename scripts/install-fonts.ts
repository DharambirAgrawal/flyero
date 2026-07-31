/**
 * Downloads the curated open-license font set into FONTS_DIR as static TTFs.
 *
 * Rendering determinism depends on the exact font binaries, so we pin static
 * instances (not variable fonts) and write a manifest with a hash of each file.
 * Run once after clone: `npm run fonts`.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const FONTS_DIR = resolve(process.env.FONTS_DIR ?? "./assets/fonts");

/** family -> weights we need. Kept minimal: every weight here is used by a font pairing. */
const FAMILIES: Record<string, number[]> = {
  Inter: [400, 500, 600, 700, 800, 900],
  Fraunces: [400, 600, 700, 900],
  "Space Grotesk": [400, 500, 700],
  "IBM Plex Sans": [400, 500, 600, 700],
  "IBM Plex Mono": [400, 500, 600],
  Archivo: [400, 600, 700, 800, 900],
  "DM Serif Display": [400],
  "Instrument Serif": [400],
  Sora: [400, 600, 700, 800],
  Newsreader: [400, 600, 700],
  "Libre Franklin": [400, 600, 700, 900],
  "JetBrains Mono": [400, 500, 700],
  // Added for the graphic-language work: the set had no script, no condensed
  // poster face and no slab, which are exactly the registers every travel,
  // event and hand-made reference relies on.
  Caveat: [400, 600, 700],
  "Great Vibes": [400],
  Anton: [400],
  "Archivo Narrow": [400, 600, 700],
  "Roboto Slab": [400, 700, 900],
};

/** Google Fonts serves plain TTF when the UA predates woff2. */
const LEGACY_UA = "Mozilla/4.0";

function axisQuery(family: string, weights: number[]): string {
  // Families with an optical-size axis need every axis listed, in alphabetical order.
  if (family === "Fraunces") {
    return `family=Fraunces:opsz,wght@9..144,${weights.join(";9..144,")}`;
  }
  if (family === "Newsreader") {
    return `family=Newsreader:opsz,wght@6..72,${weights.join(";6..72,")}`;
  }
  return `family=${family.replace(/ /g, "+")}:wght@${weights.join(";")}`;
}

async function fetchCss(family: string, weights: number[]): Promise<string> {
  const url = `https://fonts.googleapis.com/css2?${axisQuery(family, weights)}`;
  const res = await fetch(url, { headers: { "User-Agent": LEGACY_UA } });
  if (!res.ok) throw new Error(`CSS fetch failed for ${family}: ${res.status} ${url}`);
  return res.text();
}

type FaceRef = { weight: number; url: string };

function parseFaces(css: string): FaceRef[] {
  const faces: FaceRef[] = [];
  const blocks = css.split("@font-face").slice(1);
  for (const block of blocks) {
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1];
    const url = block.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
    const style = block.match(/font-style:\s*(\w+)/)?.[1] ?? "normal";
    if (weight && url && style === "normal") {
      faces.push({ weight: Number(weight), url });
    }
  }
  return faces;
}

function fileNameFor(family: string, weight: number): string {
  return `${family.replace(/ /g, "")}-${weight}.ttf`;
}

async function main(): Promise<void> {
  await mkdir(FONTS_DIR, { recursive: true });
  const manifest: Record<string, { family: string; weight: number; sha256: string; bytes: number }> = {};
  let downloaded = 0;
  let cached = 0;

  for (const [family, weights] of Object.entries(FAMILIES)) {
    const missing = weights.filter((w) => !existsSync(resolve(FONTS_DIR, fileNameFor(family, w))));

    if (missing.length > 0) {
      const css = await fetchCss(family, weights);
      const faces = parseFaces(css);
      for (const weight of missing) {
        const face = faces.find((f) => f.weight === weight);
        if (!face) throw new Error(`Google Fonts returned no ${weight} face for ${family}`);
        const res = await fetch(face.url, { headers: { "User-Agent": LEGACY_UA } });
        if (!res.ok) throw new Error(`TTF fetch failed for ${family} ${weight}: ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(resolve(FONTS_DIR, fileNameFor(family, weight)), buf);
        downloaded++;
      }
    }

    for (const weight of weights) {
      const name = fileNameFor(family, weight);
      const buf = await readFile(resolve(FONTS_DIR, name));
      manifest[name] = {
        family,
        weight,
        sha256: createHash("sha256").update(buf).digest("hex").slice(0, 16),
        bytes: buf.length,
      };
      if (!missing.includes(weight)) cached++;
    }
  }

  await writeFile(resolve(FONTS_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(
    `fonts: ${Object.keys(manifest).length} faces in ${FONTS_DIR} (${downloaded} downloaded, ${cached} cached)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
