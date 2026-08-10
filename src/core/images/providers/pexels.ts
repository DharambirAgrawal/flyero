import { config } from "../../../config.js";
import { COLOR_HEX, type ColorFilterId } from "./colors.js";
import type { MediaAsset, MediaProvider } from "./types.js";

const ORIENTATION_MAP: Record<string, string> = {
  portrait: "portrait",
  landscape: "landscape",
  square: "square",
};

export const pexelsProvider: MediaProvider = {
  name: "pexels",

  configured: () => config.pexelsApiKey.length > 0,

  async search(query, page, perPage, opts) {
    const key = config.pexelsApiKey;
    if (!key) throw new Error("PEXELS_API_KEY not set");

    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    const orientation = opts?.orientation && ORIENTATION_MAP[opts.orientation];
    if (orientation) url.searchParams.set("orientation", orientation);
    if (opts?.color) url.searchParams.set("color", `#${COLOR_HEX[opts.color as ColorFilterId] ?? opts.color}`);

    const res = await fetch(url.toString(), { headers: { Authorization: key } });
    if (!res.ok) throw new Error(`Pexels ${res.status}: ${res.statusText}`);

    const data = (await res.json()) as {
      photos: Array<{
        id: number;
        alt?: string;
        url: string;
        photographer: string;
        src: { original: string; large2x: string; medium: string; small: string };
        width?: number;
        height?: number;
      }>;
    };

    return data.photos.map(
      (p): MediaAsset => ({
        id: `pexels::${p.id}`,
        title: p.alt || `Photo by ${p.photographer}`,
        provider: "pexels",
        assetType: "photo",
        thumbnailUrl: p.src.medium,
        downloadUrl: p.src.original,
        sourceUrl: p.url,
        width: p.width,
        height: p.height,
        license: "Pexels License",
        author: p.photographer,
      }),
    );
  },
};
