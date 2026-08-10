/**
 * Stock/asset search, behind a provider interface.
 *
 * Flyero's cover test (G2) asks whether the product is guessable with the logo
 * and headline masked. A flyer for a place, a dish or an object that contains
 * no picture of the thing cannot pass, and no amount of ornament changes that —
 * which is why this exists. It is the difference between a layout and a poster.
 *
 * `ImageProvider` is what the rest of the system talks to; `imageProvider`
 * below fans out to a dozen concrete providers in `./providers/` (photos,
 * SVG icons, brand marks, illustrations, procedural shapes, QR codes — see
 * `./providers/aggregator.ts` for the full roster and query-aware ranking).
 * Most of those providers need no API key at all, so an agent almost never
 * has to fall back to asking the user for an image — only a user's own
 * logo or product photo still has to come from them, via upload_asset.
 * Nothing downstream knows or cares which provider a candidate came from
 * beyond the provenance recorded on the asset.
 */

import { searchAllProviders } from "./providers/aggregator.js";
import type { ColorFilterId } from "./providers/colors.js";
import type { MediaAssetType, ProviderName } from "./providers/types.js";

export type ImageOrientation = "portrait" | "landscape" | "square";

export type { MediaAssetType } from "./providers/types.js";

export type ImageSearchQuery = {
  query: string;
  perPage?: number;
  page?: number;
  orientation?: ImageOrientation;
  /** A colour name (red, blue, ...) or hex value; used to match a palette or recolour an SVG. */
  color?: string;
  /**
   * Narrow to a kind of asset: "photo" for the cover-test shot, "icon" | "svg" | "vector"
   * for a small motif, "shape" for a divider/badge/arrow, "background" for full-bleed
   * texture, "png" for a pre-cut sticker. Omit to search every kind at once.
   */
  type?: MediaAssetType | MediaAssetType[];
  /** Pin the search to one named provider. Omit to search all configured providers, ranked by query. */
  provider?: ProviderName;
};

export type ImageCandidate = {
  /** Provider-scoped id, e.g. "pexels::3573351". */
  id: string;
  provider: string;
  assetType: MediaAssetType;
  width: number;
  height: number;
  /** Description, when the provider supplies one. Feeds the alt text. */
  alt: string;
  /** Page a human should visit — the attribution link. */
  sourceUrl: string;
  author: string;
  authorUrl: string;
  /** Average colour, handy for choosing which candidate suits a palette. Not populated by every provider. */
  averageColor: string | null;
  /** Direct URL to fetch (or a `data:` URI for procedurally generated assets). */
  downloadUrl: string;
  /** Small URL for showing a chooser without pulling full-size files. */
  previewUrl: string;
};

export interface ImageProvider {
  readonly name: string;
  readonly configured: boolean;
  search(query: ImageSearchQuery): Promise<ImageCandidate[]>;
}

class MultiSourceImageProvider implements ImageProvider {
  readonly name = "multi";

  // Several providers (shapes, QR codes, SVG icons via Iconify, Wikimedia,
  // unDraw, Open Doodles, Simple Icons, Openverse) work with zero API keys,
  // so search is always available — configured() on the underlying provider
  // decides per-search which of the keyed ones (Pexels/Unsplash/Pixabay)
  // actually run.
  get configured(): boolean {
    return true;
  }

  async search(query: ImageSearchQuery): Promise<ImageCandidate[]> {
    const result = await searchAllProviders(query.query, {
      provider: query.provider ?? "all",
      assetType: query.type ?? "all",
      // Portrait by default: the canvas is 4:5, and a landscape photograph
      // cropped to it usually loses whatever made it worth choosing. Only
      // photos have a meaningful orientation — the aggregator already lets
      // dimension-less vector/icon/shape assets through regardless.
      orientation: query.orientation ?? "portrait",
      color: (query.color as ColorFilterId) || undefined,
      page: query.page,
      perPage: query.perPage,
    });

    return result.assets.map((asset) => ({
      id: asset.id,
      provider: asset.provider,
      assetType: asset.assetType,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      alt: asset.title,
      sourceUrl: asset.sourceUrl,
      author: asset.author ?? asset.provider,
      authorUrl: asset.sourceUrl,
      averageColor: null,
      downloadUrl: asset.downloadUrl,
      previewUrl: asset.thumbnailUrl,
    }));
  }
}

/** The provider the API surface uses. Swap here, not at the call sites. */
export const imageProvider: ImageProvider = new MultiSourceImageProvider();

/**
 * Hostnames `POST /v1/assets/import` will actually fetch from — the CDNs the
 * providers above are known to return `downloadUrl`s on. Keeps the import
 * endpoint from becoming a general-purpose URL fetcher (SSRF surface) no
 * matter which provider produced the candidate. Exact hostname match only —
 * never a substring/regex test, which is trivially bypassed with a lookalike
 * domain.
 */
const TRUSTED_IMPORT_HOSTS = new Set([
  "images.pexels.com",
  "images.unsplash.com",
  "pixabay.com",
  "cdn.pixabay.com",
  "upload.wikimedia.org",
  "api.iconify.design",
  "undraw.co",
  "opendoodles.s3-us-west-1.amazonaws.com",
  "simpleicons.org",
]);

/** Procedurally generated assets (shapes, QR codes) are small inline SVG `data:` URIs, not fetched. */
const MAX_TRUSTED_DATA_URI_LENGTH = 300_000;

export function isTrustedDownloadUrl(url: string): boolean {
  if (url.startsWith("data:image/svg+xml,")) {
    return url.length <= MAX_TRUSTED_DATA_URI_LENGTH;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && TRUSTED_IMPORT_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function decodeDataUri(uri: string): { buffer: Buffer; mime: string } {
  const match = uri.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!match) {
    throw Object.assign(new Error("Malformed data URI"), { code: "invalid_request" });
  }
  const [, mime, isBase64, payload] = match;
  const buffer = isBase64 ? Buffer.from(payload, "base64") : Buffer.from(decodeURIComponent(payload), "utf8");
  return { buffer, mime: mime || "image/svg+xml" };
}

/**
 * Fetches the bytes for a candidate.
 *
 * Kept separate from `search` so choosing and downloading are distinct steps —
 * an agent can look at a dozen options and pay for one. Handles both a real
 * HTTP(S) download and the `data:` URIs the local shapes/QR-code providers
 * hand back (nothing to fetch — they're generated, not hosted).
 */
export async function fetchCandidate(
  candidate: Pick<ImageCandidate, "downloadUrl">,
): Promise<{ buffer: Buffer; mime: string }> {
  const { downloadUrl } = candidate;
  if (downloadUrl.startsWith("data:")) return decodeDataUri(downloadUrl);

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw Object.assign(new Error(`Could not download image (${response.status})`), {
      code: "upstream_error",
    });
  }
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "image/jpeg";
  return { buffer: Buffer.from(await response.arrayBuffer()), mime };
}
