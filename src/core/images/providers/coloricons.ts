import { buildIconifySvgUrl, normalizeIconifyQuery } from "./iconify-utils.js";
import type { MediaAsset, MediaProvider } from "./types.js";

const COLORFUL_PREFIXES = new Set([
  "fluent-emoji",
  "fluent-emoji-flat",
  "noto",
  "noto-color-emoji",
  "openmoji",
  "twemoji",
  "fxemoji",
]);

export const colorIconsProvider: MediaProvider = {
  name: "coloricons",

  configured: () => true,

  async search(query, page, perPage) {
    const { query: searchQuery } = normalizeIconifyQuery(query);
    if (!searchQuery) return [];

    const url = new URL("https://api.iconify.design/search");
    url.searchParams.set("query", searchQuery);
    url.searchParams.set("limit", String(Math.min(page * perPage * 4, 256)));

    const res = await fetch(url.toString(), { headers: { "User-Agent": "Flyero/1.0" } });
    if (!res.ok) throw new Error(`Iconify color search ${res.status}: ${res.statusText}`);

    const data = (await res.json()) as { icons?: string[] };
    const uniqueIcons = [...new Set(data.icons ?? [])].filter((iconId) =>
      COLORFUL_PREFIXES.has(iconId.split(":")[0]),
    );

    const offset = (page - 1) * perPage;
    return uniqueIcons.slice(offset, offset + perPage).map((iconId): MediaAsset => {
      const [prefix, name] = iconId.split(":");
      const svgUrl = buildIconifySvgUrl(prefix, name);
      return {
        id: `coloricons::${iconId}`,
        title: name?.replace(/-/g, " ") ?? iconId,
        provider: "coloricons",
        assetType: "icon",
        thumbnailUrl: svgUrl,
        downloadUrl: svgUrl,
        sourceUrl: `https://icon-sets.iconify.design/${prefix}/?query=${encodeURIComponent(searchQuery)}`,
        license: "Varies by icon set",
        author: prefix,
      };
    });
  },
};
