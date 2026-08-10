import { config } from "../../../config.js";
import type { MediaAsset, MediaProvider } from "./types.js";

const ORIENTATION_MAP: Record<string, string> = {
  portrait: "portrait",
  landscape: "landscape",
  square: "squarish",
};

const COLOR_MAP: Record<string, string> = {
  red: "red",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  blue: "blue",
  purple: "purple",
  pink: "magenta",
  black: "black",
  white: "white",
  gray: "black_and_white",
};

export const unsplashProvider: MediaProvider = {
  name: "unsplash",

  configured: () => config.unsplashAccessKey.length > 0,

  async search(query, page, perPage, opts) {
    const key = config.unsplashAccessKey;
    if (!key) throw new Error("UNSPLASH_ACCESS_KEY not set");

    const url = new URL("https://api.unsplash.com/search/photos");
    url.searchParams.set("query", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(perPage));
    const orientation = opts?.orientation && ORIENTATION_MAP[opts.orientation];
    if (orientation) url.searchParams.set("orientation", orientation);
    const color = opts?.color && COLOR_MAP[opts.color];
    if (color) url.searchParams.set("color", color);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    });
    if (!res.ok) throw new Error(`Unsplash ${res.status}: ${res.statusText}`);

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        description?: string;
        alt_description?: string;
        urls: { regular: string; thumb: string; full: string };
        links: { html: string; download: string };
        width?: number;
        height?: number;
        user: { name: string };
        tags?: Array<{ title: string }>;
      }>;
    };

    return data.results.map(
      (r): MediaAsset => ({
        id: `unsplash::${r.id}`,
        title: r.alt_description || r.description || `Photo by ${r.user.name}`,
        description: r.description && r.description !== r.alt_description ? r.description : undefined,
        provider: "unsplash",
        assetType: "photo",
        thumbnailUrl: r.urls.thumb,
        downloadUrl: r.urls.full,
        sourceUrl: r.links.html,
        width: r.width,
        height: r.height,
        license: "Unsplash License",
        author: r.user.name,
        tags: r.tags?.map((t) => t.title),
      }),
    );
  },
};
