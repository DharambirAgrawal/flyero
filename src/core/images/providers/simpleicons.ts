import type { MediaAsset, MediaProvider } from "./types.js";

type SimpleIconEntry = { title: string; slug: string };

const GENERIC_TERMS = new Set(["logo", "logos", "brand", "brands", "svg", "svgs", "icon", "icons", "mark", "marks"]);

let slugIndexPromise: Promise<SimpleIconEntry[]> | null = null;

function normalizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !GENERIC_TERMS.has(part));
}

function toTitleCase(text: string): string {
  return text.split(/\s+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

async function loadSlugIndex(): Promise<SimpleIconEntry[]> {
  if (!slugIndexPromise) {
    slugIndexPromise = fetch("https://raw.githubusercontent.com/simple-icons/simple-icons/develop/slugs.md")
      .then(async (res) => {
        if (!res.ok) throw new Error(`Simple Icons index ${res.status}: ${res.statusText}`);
        const text = await res.text();
        const entries: SimpleIconEntry[] = [];
        for (const line of text.split("\n")) {
          const match = line.match(/^\|\s*`(.+?)`\s*\|\s*`(.+?)`\s*\|?$/);
          if (!match) continue;
          entries.push({ title: match[1].trim(), slug: match[2].trim() });
        }
        return entries;
      })
      .catch((error) => {
        slugIndexPromise = null;
        throw error;
      });
  }
  return slugIndexPromise;
}

function scoreEntry(entry: SimpleIconEntry, terms: string[]): number {
  const normalizedTitle = entry.title.toLowerCase();
  const normalizedSlug = entry.slug.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (normalizedSlug === term) score += 100;
    else if (normalizedTitle === term) score += 95;
    else if (normalizedSlug.startsWith(term)) score += 70;
    else if (normalizedTitle.startsWith(term)) score += 60;
    else if (normalizedSlug.includes(term)) score += 45;
    else if (normalizedTitle.includes(term)) score += 35;
  }
  return score;
}

export const simpleIconsProvider: MediaProvider = {
  name: "simpleicons",

  configured: () => true,

  async search(query, page, perPage) {
    const terms = normalizeQuery(query);
    if (terms.length === 0) return [];

    const entries = await loadSlugIndex();
    const matches = entries
      .map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
      .slice((page - 1) * perPage, page * perPage);

    return matches.map(({ entry }): MediaAsset => {
      const downloadUrl = `https://simpleicons.org/icons/${entry.slug}.svg`;
      return {
        id: `simpleicons::${entry.slug}`,
        title: toTitleCase(entry.title.replace(/[_-]+/g, " ")),
        provider: "simpleicons",
        assetType: "icon",
        thumbnailUrl: downloadUrl,
        downloadUrl,
        sourceUrl: downloadUrl,
        license: "CC0-1.0",
        author: "Simple Icons",
      };
    });
  },
};
