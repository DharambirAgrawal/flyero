import { COLOR_HEX, COLOR_SYNONYMS } from "./colors.js";

const COLOR_KEYWORDS: Record<string, string> = {
  ...COLOR_HEX,
  ...Object.fromEntries(Object.entries(COLOR_SYNONYMS).map(([word, id]) => [word, COLOR_HEX[id]])),
};

const GENERIC_TERMS = new Set([
  "logo",
  "logos",
  "brand",
  "brands",
  "svg",
  "svgs",
  "icon",
  "icons",
  "mark",
  "marks",
]);

export function normalizeIconifyQuery(query: string): { query: string; colorHex?: string } {
  let colorHex: string | undefined;
  const terms: string[] = [];

  for (const part of query.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)) {
    const term = part.trim();
    if (!term) continue;

    const maybeColor = COLOR_KEYWORDS[term];
    if (maybeColor) {
      colorHex = maybeColor;
      continue;
    }

    if (GENERIC_TERMS.has(term)) continue;
    terms.push(term);
  }

  return { query: terms.join(" "), colorHex };
}

export function buildIconifySvgUrl(prefix: string, name: string, colorHex?: string): string {
  const url = new URL(`https://api.iconify.design/${prefix}/${name}.svg`);
  if (colorHex) url.searchParams.set("color", `#${colorHex}`);
  return url.toString();
}
