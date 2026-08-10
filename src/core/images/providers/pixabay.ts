import { config } from "../../../config.js";
import type { MediaAsset, MediaAssetType, MediaProvider } from "./types.js";

function inferPixabayType(type: string, tags: string[]): MediaAssetType {
  const normalizedType = type.toLowerCase();
  if (normalizedType === "vector" || normalizedType === "illustration") return "vector";
  const tagText = tags.join(" ").toLowerCase();
  if (tagText.includes("background") || tagText.includes("pattern")) return "background";
  return "photo";
}

const ORIENTATION_MAP: Record<string, string> = {
  portrait: "vertical",
  landscape: "horizontal",
};

const COLOR_MAP: Record<string, string> = {
  red: "red",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  blue: "blue",
  purple: "lilac",
  pink: "pink",
  brown: "brown",
  black: "black",
  white: "white",
  gray: "gray",
};

export const pixabayProvider: MediaProvider = {
  name: "pixabay",

  configured: () => config.pixabayApiKey.length > 0,

  async search(query, page, perPage, opts) {
    const key = config.pixabayApiKey;
    if (!key) throw new Error("PIXABAY_API_KEY not set");

    const url = new URL("https://pixabay.com/api/");
    url.searchParams.set("key", key);
    url.searchParams.set("q", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("image_type", "all");
    url.searchParams.set("safesearch", "true");
    const orientation = opts?.orientation && ORIENTATION_MAP[opts.orientation];
    if (orientation) url.searchParams.set("orientation", orientation);
    const color = opts?.color && COLOR_MAP[opts.color];
    if (color) url.searchParams.set("colors", color);

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Pixabay ${res.status}: ${res.statusText}`);

    const data = (await res.json()) as {
      hits: Array<{
        id: number;
        pageURL: string;
        type: string;
        tags?: string;
        previewURL?: string;
        webformatURL?: string;
        largeImageURL?: string;
        imageURL?: string;
        vectorURL?: string;
        imageWidth?: number;
        imageHeight?: number;
        user?: string;
      }>;
    };

    return data.hits.map((hit): MediaAsset => {
      const tags = hit.tags?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
      const downloadUrl =
        hit.vectorURL ?? hit.largeImageURL ?? hit.imageURL ?? hit.webformatURL ?? hit.previewURL ?? hit.pageURL;

      return {
        id: `pixabay::${hit.id}`,
        title: tags[0] ? `${tags[0][0].toUpperCase()}${tags[0].slice(1)}` : "Pixabay asset",
        provider: "pixabay",
        assetType: inferPixabayType(hit.type, tags),
        thumbnailUrl: hit.previewURL ?? hit.webformatURL ?? hit.largeImageURL ?? downloadUrl,
        downloadUrl,
        sourceUrl: hit.pageURL,
        width: hit.imageWidth,
        height: hit.imageHeight,
        license: "Pixabay Content License",
        author: hit.user,
        tags,
      };
    });
  },
};
