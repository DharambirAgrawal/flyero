import { COLOR_HEX, resolveColorKeyword, type ColorFilterId } from "./colors.js";
import type { MediaAsset, MediaProvider } from "./types.js";

// Self-hosted, procedurally generated shape/line/badge library — the
// "Shapes" element category (Canva's, this repo's decor layer) has no free
// external API equivalent, and unlike undraw/opendoodles (HTML-scraped,
// break on redesigns) these render instantly with zero network dependency
// and never go stale.

type ShapeDef = {
  id: string;
  title: string;
  tags: string[];
  render: (hex: string) => string;
};

const SHAPES: ShapeDef[] = [
  { id: "rectangle", title: "Rectangle", tags: ["rectangle", "box", "block"], render: (c) => `<rect x="8" y="26" width="84" height="48" fill="#${c}"/>` },
  { id: "rounded-rectangle", title: "Rounded rectangle", tags: ["rounded", "rectangle", "box", "card"], render: (c) => `<rect x="8" y="26" width="84" height="48" rx="12" fill="#${c}"/>` },
  { id: "square", title: "Square", tags: ["square", "box"], render: (c) => `<rect x="15" y="15" width="70" height="70" fill="#${c}"/>` },
  { id: "rounded-square", title: "Rounded square", tags: ["rounded", "square", "box"], render: (c) => `<rect x="15" y="15" width="70" height="70" rx="14" fill="#${c}"/>` },
  { id: "circle", title: "Circle", tags: ["circle", "dot", "round", "ball"], render: (c) => `<circle cx="50" cy="50" r="40" fill="#${c}"/>` },
  { id: "ellipse", title: "Ellipse", tags: ["ellipse", "oval"], render: (c) => `<ellipse cx="50" cy="50" rx="45" ry="28" fill="#${c}"/>` },
  { id: "triangle", title: "Triangle", tags: ["triangle"], render: (c) => `<polygon points="50,10 90,85 10,85" fill="#${c}"/>` },
  { id: "right-triangle", title: "Right triangle", tags: ["triangle", "right"], render: (c) => `<polygon points="15,85 85,85 15,15" fill="#${c}"/>` },
  { id: "diamond", title: "Diamond", tags: ["diamond", "rhombus"], render: (c) => `<polygon points="50,8 92,50 50,92 8,50" fill="#${c}"/>` },
  { id: "pentagon", title: "Pentagon", tags: ["pentagon"], render: (c) => `<polygon points="50,6 93,38 76,90 24,90 7,38" fill="#${c}"/>` },
  { id: "hexagon", title: "Hexagon", tags: ["hexagon"], render: (c) => `<polygon points="28,10 72,10 94,50 72,90 28,90 6,50" fill="#${c}"/>` },
  { id: "octagon", title: "Octagon", tags: ["octagon"], render: (c) => `<polygon points="32,8 68,8 92,32 92,68 68,92 32,92 8,68 8,32" fill="#${c}"/>` },
  { id: "star-5", title: "5-point star", tags: ["star", "rating", "favorite"], render: (c) => `<polygon points="50,6 61,38 95,38 68,58 78,92 50,71 22,92 32,58 5,38 39,38" fill="#${c}"/>` },
  { id: "star-6", title: "6-point star", tags: ["star", "sparkle"], render: (c) => `<polygon points="50,4 61,32 92,26 70,50 92,74 61,68 50,96 39,68 8,74 30,50 8,26 39,32" fill="#${c}"/>` },
  { id: "heart", title: "Heart", tags: ["heart", "love", "like"], render: (c) => `<path d="M50 88 12 54a22 22 0 0 1 31-31l7 7 7-7a22 22 0 0 1 31 31Z" fill="#${c}"/>` },
  { id: "line", title: "Straight line", tags: ["line", "divider", "separator", "rule"], render: (c) => `<rect x="4" y="47" width="92" height="6" fill="#${c}"/>` },
  { id: "dashed-line", title: "Dashed line", tags: ["line", "dashed", "divider", "separator"], render: (c) => `<line x1="4" y1="50" x2="96" y2="50" stroke="#${c}" stroke-width="6" stroke-dasharray="12 8"/>` },
  { id: "dotted-line", title: "Dotted line", tags: ["line", "dotted", "divider", "separator"], render: (c) => `<line x1="4" y1="50" x2="96" y2="50" stroke="#${c}" stroke-width="6" stroke-linecap="round" stroke-dasharray="0.5 13"/>` },
  { id: "wavy-line", title: "Wavy line", tags: ["line", "wavy", "wave", "divider", "separator"], render: (c) => `<path d="M2 50q12-20 24 0t24 0 24 0 24 0" fill="none" stroke="#${c}" stroke-width="5"/>` },
  { id: "zigzag-line", title: "Zigzag line", tags: ["line", "zigzag", "divider", "separator"], render: (c) => `<polyline points="2,60 18,40 34,60 50,40 66,60 82,40 98,60" fill="none" stroke="#${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` },
  { id: "arrow-right", title: "Arrow right", tags: ["arrow", "right", "next"], render: (c) => `<path d="M8 40h55V22l30 28-30 28V60H8Z" fill="#${c}"/>` },
  { id: "arrow-left", title: "Arrow left", tags: ["arrow", "left", "back"], render: (c) => `<path d="M92 40H37V22L7 50l30 28V60h55Z" fill="#${c}"/>` },
  { id: "arrow-up", title: "Arrow up", tags: ["arrow", "up"], render: (c) => `<path d="M60 92V37h18L50 7 22 37h18v55Z" fill="#${c}"/>` },
  { id: "arrow-down", title: "Arrow down", tags: ["arrow", "down"], render: (c) => `<path d="M60 8v55h18L50 93 22 63h18V8Z" fill="#${c}"/>` },
  { id: "ribbon-banner", title: "Ribbon banner", tags: ["ribbon", "banner", "flag"], render: (c) => `<path d="M6 30h88v34l-8-8-8 8-8-8-8 8-8-8-8 8-8-8-8 8-8-8-8 8-8-8-8 8Z" fill="#${c}"/>` },
  { id: "badge-seal", title: "Badge / seal", tags: ["badge", "seal", "stamp", "award", "starburst"], render: (c) => `<polygon points="50,2 58,15 72,9 73,24 88,27 82,41 94,50 82,59 88,73 73,76 72,91 58,85 50,98 42,85 28,91 27,76 12,73 18,59 6,50 18,41 12,27 27,24 28,9 42,15" fill="#${c}"/>` },
  { id: "speech-bubble", title: "Speech bubble", tags: ["speech", "bubble", "chat", "callout", "quote"], render: (c) => `<path d="M10 15h80a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H46l-16 16V69H10a6 6 0 0 1-6-6V21a6 6 0 0 1 6-6Z" fill="#${c}"/>` },
  { id: "price-tag", title: "Price tag", tags: ["tag", "price", "label", "sale"], render: (c) => `<path d="M8 46 46 8h42a4 4 0 0 1 4 4v42L54 92a6 6 0 0 1-8 0L8 54a6 6 0 0 1 0-8Z" fill="#${c}"/><circle cx="76" cy="24" r="7" fill="white" fill-opacity="0.85"/>` },
  { id: "frame-border", title: "Frame border", tags: ["frame", "border", "outline", "rectangle"], render: (c) => `<rect x="6" y="6" width="88" height="88" fill="none" stroke="#${c}" stroke-width="6"/>` },
  { id: "circle-frame", title: "Circle frame", tags: ["frame", "circle", "border", "ring"], render: (c) => `<circle cx="50" cy="50" r="42" fill="none" stroke="#${c}" stroke-width="6"/>` },
];

const GENERIC_TERMS = new Set(["shape", "shapes", "basic", "graphic", "graphics", "element", "elements"]);
const DEFAULT_HEX = "18181b";

function normalize(query: string): { terms: string[]; colorHex?: string } {
  let colorHex: string | undefined;
  const terms: string[] = [];
  for (const part of query.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)) {
    const term = part.trim();
    if (!term) continue;
    const colorId = resolveColorKeyword(term);
    if (colorId) {
      colorHex = COLOR_HEX[colorId];
      continue;
    }
    if (GENERIC_TERMS.has(term)) continue;
    terms.push(term);
  }
  return { terms, colorHex };
}

function score(shape: ShapeDef, terms: string[]): number {
  let total = 0;
  for (const term of terms) {
    for (const tag of shape.tags) {
      if (tag === term) total += 100;
      else if (tag.startsWith(term) || term.startsWith(tag)) total += 60;
      else if (tag.includes(term)) total += 30;
    }
  }
  return total;
}

function toAsset(shape: ShapeDef, hex: string): MediaAsset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${shape.render(hex)}</svg>`;
  const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  return {
    id: `shapes::${shape.id}::${hex}`,
    title: shape.title,
    provider: "shapes",
    assetType: "shape",
    thumbnailUrl: dataUri,
    downloadUrl: dataUri,
    sourceUrl: dataUri,
    license: "Generated — free to use",
    author: "Flyero",
    tags: shape.tags,
  };
}

export const shapesProvider: MediaProvider = {
  name: "shapes",

  configured: () => true,

  async search(query, page, perPage, opts) {
    const { terms, colorHex: parsedHex } = normalize(query);
    const hex = (opts?.color && COLOR_HEX[opts.color as ColorFilterId]) ?? parsedHex ?? DEFAULT_HEX;

    // Bare "shapes"/"shape" (or a color word alone, e.g. "blue shapes")
    // browses the full catalog.
    const matches =
      terms.length === 0
        ? SHAPES
        : SHAPES.map((shape) => ({ shape, score: score(shape, terms) }))
            .filter((m) => m.score > 0)
            .sort((a, b) => b.score - a.score)
            .map((m) => m.shape);

    const offset = (page - 1) * perPage;
    return matches.slice(offset, offset + perPage).map((shape) => toAsset(shape, hex));
  },
};
