/**
 * Stock photography search, behind a provider interface.
 *
 * Flyero's cover test (G2) asks whether the product is guessable with the logo
 * and headline masked. A flyer for a place, a dish or an object that contains
 * no picture of the thing cannot pass, and no amount of ornament changes that —
 * which is why this exists. It is the difference between a layout and a poster.
 *
 * The interface is deliberately wider than Pexels: `ImageProvider` is what the
 * rest of the system talks to, so swapping or adding a source later touches
 * this file only. Nothing downstream knows where a photograph came from beyond
 * the provenance recorded on the asset.
 */

import { config } from "../../config.js";

export type ImageOrientation = "portrait" | "landscape" | "square";

export type ImageSearchQuery = {
  query: string;
  perPage?: number;
  page?: number;
  orientation?: ImageOrientation;
  /** Pexels understands a colour name or a hex value; used to match a palette. */
  color?: string;
};

export type ImageCandidate = {
  /** Provider-scoped id, e.g. "pexels:3573351". */
  id: string;
  provider: string;
  width: number;
  height: number;
  /** Description, when the provider supplies one. Feeds the alt text. */
  alt: string;
  /** Page a human should visit — the attribution link. */
  sourceUrl: string;
  author: string;
  authorUrl: string;
  /** Average colour, handy for choosing which candidate suits a palette. */
  averageColor: string | null;
  /** Direct URL to fetch. Already size-capped for our canvas. */
  downloadUrl: string;
  /** Small URL for showing a chooser without pulling full-size files. */
  previewUrl: string;
};

export interface ImageProvider {
  readonly name: string;
  readonly configured: boolean;
  search(query: ImageSearchQuery): Promise<ImageCandidate[]>;
}

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  avg_color?: string | null;
  alt?: string | null;
  src: Record<string, string>;
};

/**
 * The canvas is 1080×1350, so `large` (~1880px on its long edge) is already
 * more than enough. Pulling `original` would mean multi-megabyte downloads that
 * `createAsset` immediately throws away in `downscale`.
 */
const PREFERRED_SIZES = ["large", "large2x", "portrait", "original"];

export class PexelsProvider implements ImageProvider {
  readonly name = "pexels";

  constructor(private readonly apiKey: string = config.pexelsApiKey) {}

  get configured(): boolean {
    return this.apiKey.length > 0;
  }

  async search(query: ImageSearchQuery): Promise<ImageCandidate[]> {
    if (!this.configured) {
      throw Object.assign(
        new Error("Image search is not configured — set PEXELS_API_KEY in .env"),
        { code: "not_configured" },
      );
    }

    const url = new URL("https://api.pexels.com/v1/search");
    url.searchParams.set("query", query.query);
    url.searchParams.set("per_page", String(Math.min(Math.max(query.perPage ?? 12, 1), 40)));
    url.searchParams.set("page", String(Math.max(query.page ?? 1, 1)));
    // Portrait by default: the canvas is 4:5, and a landscape photograph cropped
    // to it usually loses whatever made it worth choosing.
    url.searchParams.set("orientation", query.orientation ?? "portrait");
    if (query.color) url.searchParams.set("color", query.color);

    const response = await fetch(url, { headers: { Authorization: this.apiKey } });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw Object.assign(
        new Error(`Pexels search failed (${response.status}): ${detail.slice(0, 200)}`),
        { code: response.status === 401 ? "not_configured" : "upstream_error" },
      );
    }

    const body = (await response.json()) as { photos?: PexelsPhoto[] };
    return (body.photos ?? []).map((photo) => ({
      id: `pexels:${photo.id}`,
      provider: this.name,
      width: photo.width,
      height: photo.height,
      alt: photo.alt?.trim() || "",
      sourceUrl: photo.url,
      author: photo.photographer,
      authorUrl: photo.photographer_url,
      averageColor: photo.avg_color ?? null,
      downloadUrl: PREFERRED_SIZES.map((s) => photo.src[s]).find(Boolean) ?? photo.src.original!,
      previewUrl: photo.src.medium ?? photo.src.tiny ?? photo.src.original!,
    }));
  }
}

/** The provider the API surface uses. Swap here, not at the call sites. */
export const imageProvider: ImageProvider = new PexelsProvider();

/**
 * Fetches the bytes for a candidate.
 *
 * Kept separate from `search` so choosing and downloading are distinct steps —
 * an agent can look at twelve options and pay for one.
 */
export async function fetchCandidate(
  candidate: Pick<ImageCandidate, "downloadUrl">,
): Promise<{ buffer: Buffer; mime: string }> {
  const response = await fetch(candidate.downloadUrl);
  if (!response.ok) {
    throw Object.assign(new Error(`Could not download image (${response.status})`), {
      code: "upstream_error",
    });
  }
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
  return { buffer: Buffer.from(await response.arrayBuffer()), mime };
}
