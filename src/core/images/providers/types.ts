/**
 * Shared types for the multi-provider media search behind `ImageProvider`
 * (see `../search.ts`). Ported from the sibling `asset-hub` project, which
 * proved these provider adapters out as a standalone aggregator — vendored
 * here rather than called over HTTP so Flyero stays the single Node service
 * CLAUDE.md describes, with no runtime dependency on a second process.
 */

export type MediaAssetType =
  | "photo"
  | "svg"
  | "icon"
  | "vector"
  | "png"
  | "background"
  | "shape";

export interface MediaAsset {
  id: string;
  title: string;
  description?: string;
  provider: ProviderName;
  assetType: MediaAssetType;
  thumbnailUrl: string;
  downloadUrl: string;
  sourceUrl: string;
  width?: number;
  height?: number;
  license?: string;
  author?: string;
  tags?: string[];
}

export type ProviderName =
  | "openverse"
  | "wikimedia"
  | "svgrepo"
  | "unsplash"
  | "pexels"
  | "pixabay"
  | "coloricons"
  | "undraw"
  | "opendoodles"
  | "simpleicons"
  | "shapes"
  | "qrcode"
  | "library";

export type MediaOrientation = "all" | "portrait" | "landscape" | "square";

/** Optional per-request hints; providers that ignore them just don't destructure them. */
export interface ProviderSearchOpts {
  color?: string;
  orientation?: MediaOrientation;
}

export interface MediaProvider {
  name: ProviderName;
  /** True when the provider can run with what's in `config` right now (most need nothing). */
  configured(): boolean;
  search(
    query: string,
    page: number,
    perPage: number,
    opts?: ProviderSearchOpts,
  ): Promise<MediaAsset[]>;
}

export interface MediaSearchResult {
  assets: MediaAsset[];
  total: number;
  page: number;
  hasMore: boolean;
  errors?: Partial<Record<ProviderName, string>>;
}
