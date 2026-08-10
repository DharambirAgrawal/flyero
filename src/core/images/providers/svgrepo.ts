import { COLOR_HEX, type ColorFilterId } from "./colors.js";
import { buildIconifySvgUrl, normalizeIconifyQuery } from "./iconify-utils.js";
import type { MediaAsset, MediaProvider } from "./types.js";

// Iconify is a fully free, open API with 200k+ icons — used as the SVG/icon source.
// Docs: https://api.iconify.design/
export const svgrepoProvider: MediaProvider = {
  name: "svgrepo",

  configured: () => true,

  async search(query, page, perPage, opts) {
    const { query: searchQuery, colorHex: parsedColorHex } = normalizeIconifyQuery(query);
    if (!searchQuery) return [];
    const colorHex = (opts?.color && COLOR_HEX[opts.color as ColorFilterId]) ?? parsedColorHex;

    const url = new URL("https://api.iconify.design/search");
    url.searchParams.set("query", searchQuery);
    // Iconify's own relevance ranking rarely surfaces the "logos" (real
    // multi-color brand marks) set within the first page, so over-fetch a
    // larger pool to boost from — see the sort below.
    url.searchParams.set("limit", String(Math.min(Math.max(page * perPage * 4, 100), 256)));

    const res = await fetch(url.toString(), { headers: { "User-Agent": "Flyero/1.0" } });
    if (!res.ok) throw new Error(`Iconify ${res.status}: ${res.statusText}`);

    const data = (await res.json()) as { icons?: string[]; total?: number };
    const offset = (page - 1) * perPage;

    // Surface real multi-color brand marks ("logos:" prefix) first so a
    // "google logo" search doesn't bury the actual "G" under a flat one.
    const sorted = [...new Set(data.icons ?? [])].sort((a, b) => {
      const aIsLogo = a.startsWith("logos:") ? 0 : 1;
      const bIsLogo = b.startsWith("logos:") ? 0 : 1;
      return aIsLogo - bIsLogo;
    });

    const uniqueIcons = sorted.slice(offset, offset + perPage);

    return uniqueIcons.map((iconId): MediaAsset => {
      const [prefix, name] = iconId.split(":");
      const svgUrl = buildIconifySvgUrl(prefix, name, colorHex);
      return {
        id: `svgrepo::${iconId}`,
        title: name?.replace(/-/g, " ") ?? iconId,
        provider: "svgrepo",
        assetType: "icon",
        thumbnailUrl: svgUrl,
        downloadUrl: svgUrl,
        sourceUrl: `https://icon-sets.iconify.design/${prefix}/?query=${encodeURIComponent(searchQuery)}`,
        license: "Varies (MIT, Apache 2.0, CC0)",
        author: prefix,
      };
    });
  },
};
