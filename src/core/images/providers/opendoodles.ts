import type { MediaAsset, MediaProvider } from "./types.js";

type DoodleItem = { title: string; alt: string; svgUrl: string; pngUrl: string };

const PAGE_URL = "https://www.opendoodles.com/";
let doodlesPromise: Promise<DoodleItem[]> | null = null;

function normalizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function titleScore(item: DoodleItem, terms: string[]): number {
  const normalizedTitle = item.title.toLowerCase();
  const normalizedAlt = item.alt.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (normalizedTitle === term) score += 100;
    else if (normalizedTitle.startsWith(term)) score += 70;
    else if (normalizedTitle.includes(term)) score += 45;
    else if (normalizedAlt.includes(term)) score += 20;
  }
  return score;
}

function toTitle(text: string): string {
  return text.split(/[-_\s]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

async function loadDoodles(): Promise<DoodleItem[]> {
  if (!doodlesPromise) {
    doodlesPromise = fetch(PAGE_URL, { headers: { "User-Agent": "Flyero/1.0" } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Open Doodles ${res.status}: ${res.statusText}`);
        const html = await res.text();
        const items: DoodleItem[] = [];
        // Site markup (Webflow, 2024+): each doodle is a "collection-item w-dyn-item"
        // div with an <img alt="..."> followed by SVG/PNG download links.
        const itemRegex =
          /class="collection-item w-dyn-item">[\s\S]*?<img[^>]*alt="([^"]*)"[^>]*\/>[\s\S]*?<a[^>]*href="(https:\/\/opendoodles\.s3-us-west-1\.amazonaws\.com\/[^"]+\.svg)"[^>]*>SVG<\/a><a[^>]*href="(https:\/\/opendoodles\.s3-us-west-1\.amazonaws\.com\/[^"]+\.png)"/g;

        for (const match of html.matchAll(itemRegex)) {
          const svgUrl = match[2];
          const slugMatch = svgUrl.match(/\/([a-zA-Z0-9_-]+)\.svg$/);
          const slug = slugMatch ? slugMatch[1] : svgUrl;
          items.push({ title: toTitle(slug), alt: match[1], svgUrl, pngUrl: match[3] });
        }
        return items;
      })
      .catch((error) => {
        doodlesPromise = null;
        throw error;
      });
  }
  return doodlesPromise;
}

export const openDoodlesProvider: MediaProvider = {
  name: "opendoodles",

  configured: () => true,

  async search(query, page, perPage) {
    const terms = normalizeQuery(query);
    if (terms.length === 0) return [];

    const doodles = await loadDoodles();
    const matches = doodles
      .map((item) => ({ item, score: titleScore(item, terms) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title));

    const offset = (page - 1) * perPage;
    return matches.slice(offset, offset + perPage).map(({ item }): MediaAsset => ({
      id: `opendoodles::${item.svgUrl.split("/").pop()?.replace(/\.svg$/i, "") ?? item.title.toLowerCase().replace(/\s+/g, "-")}`,
      title: item.title,
      description: item.alt || undefined,
      provider: "opendoodles",
      assetType: "vector",
      thumbnailUrl: item.pngUrl,
      downloadUrl: item.svgUrl,
      sourceUrl: PAGE_URL,
      license: "CC0",
      author: "Open Doodles",
      tags: terms,
    }));
  },
};
