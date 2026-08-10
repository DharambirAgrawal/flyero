import { COLOR_HEX, COLOR_SYNONYMS, type ColorFilterId } from "./colors.js";
import type { MediaAsset, MediaProvider } from "./types.js";

const COLOR_KEYWORDS: Record<string, string> = {
  ...COLOR_HEX,
  ...Object.fromEntries(Object.entries(COLOR_SYNONYMS).map(([word, id]) => [word, COLOR_HEX[id]])),
};

const GENERIC_TERMS = new Set([
  "illustration",
  "illustrations",
  "svg",
  "svgs",
  "vector",
  "vectors",
  "picture",
  "pictures",
  "image",
  "images",
]);

const TOTAL_PAGES = 44;
const PAGE_CACHE = new Map<number, Promise<UndrawPageAsset[]>>();

type UndrawPageAsset = { id: string; title: string; downloadUrl: string };

function normalizeTerms(query: string): { terms: string[]; colorHex?: string } {
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

  return { terms, colorHex };
}

async function fetchUndrawPage(page: number): Promise<UndrawPageAsset[]> {
  if (!PAGE_CACHE.has(page)) {
    // Site quirk: page 1 lives at /illustrations (no number); /illustrations/1
    // 404s. Pages 2+ live at /illustrations/{page}.
    const path = page === 1 ? "/illustrations" : `/illustrations/${page}`;

    PAGE_CACHE.set(
      page,
      fetch(`https://undraw.co${path}`, { headers: { "User-Agent": "Flyero/1.0" } })
        .then(async (res) => {
          if (!res.ok) throw new Error(`unDraw ${res.status}: ${res.statusText}`);
          const html = await res.text();
          // The illustration list is embedded as Next.js page data.
          const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
          if (!match) return [];

          const data = JSON.parse(match[1]) as {
            props?: { pageProps?: { illustrations?: Array<{ title: string; media: string; newSlug: string }> } };
          };
          const illustrations = data.props?.pageProps?.illustrations ?? [];
          return illustrations.map(
            (item): UndrawPageAsset => ({ id: `undraw::${item.newSlug}`, title: item.title, downloadUrl: item.media }),
          );
        })
        .catch((error) => {
          PAGE_CACHE.delete(page);
          throw error;
        }),
    );
  }
  return PAGE_CACHE.get(page)!;
}

function score(title: string, terms: string[]): number {
  const normalizedTitle = title.toLowerCase();
  let total = 0;
  for (const term of terms) {
    if (normalizedTitle === term) total += 100;
    else if (normalizedTitle.startsWith(term)) total += 70;
    else if (normalizedTitle.includes(term)) total += 40;
  }
  return total;
}

export const undrawProvider: MediaProvider = {
  name: "undraw",

  configured: () => true,

  async search(query, page, perPage, opts) {
    const { terms, colorHex: parsedColorHex } = normalizeTerms(query);
    if (terms.length === 0) return [];
    const colorHex = (opts?.color && COLOR_HEX[opts.color as ColorFilterId]) ?? parsedColorHex;

    const pagesToScan = Array.from({ length: TOTAL_PAGES }, (_, index) => index + 1);
    const pageResults = await Promise.all(pagesToScan.map((n) => fetchUndrawPage(n)));

    const matches = pageResults
      .flat()
      .map((asset) => ({ asset, score: score(asset.title, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.asset.title.localeCompare(b.asset.title));

    const offset = (page - 1) * perPage;
    return matches.slice(offset, offset + perPage).map(({ asset }): MediaAsset => ({
      id: asset.id,
      title: asset.title,
      provider: "undraw",
      assetType: "vector",
      thumbnailUrl: colorHex ? `${asset.downloadUrl}?color=%23${colorHex}` : asset.downloadUrl,
      downloadUrl: colorHex ? `${asset.downloadUrl}?color=%23${colorHex}` : asset.downloadUrl,
      sourceUrl: asset.downloadUrl,
      license: "unDraw license",
      author: "unDraw",
      tags: terms,
    }));
  },
};
