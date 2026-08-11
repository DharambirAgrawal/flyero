import type { ColorFilterId } from "./colors.js";
import { cacheKey, getCached, setCached } from "./cache.js";
import { colorIconsProvider } from "./coloricons.js";
import { openDoodlesProvider } from "./opendoodles.js";
import { openverseProvider } from "./openverse.js";
import { pexelsProvider } from "./pexels.js";
import { pixabayProvider } from "./pixabay.js";
import { qrcodeProvider } from "./qrcode.js";
import { shapesProvider } from "./shapes.js";
import { simpleIconsProvider } from "./simpleicons.js";
import { svgrepoProvider } from "./svgrepo.js";
import type { MediaAsset, MediaAssetType, MediaOrientation, MediaProvider, MediaSearchResult, ProviderName } from "./types.js";
import { undrawProvider } from "./undraw.js";
import { unsplashProvider } from "./unsplash.js";
import { wikimediaProvider } from "./wikimedia.js";

// Order matters: fast no-auth providers first so they always respond in time.
const ALL_PROVIDERS: MediaProvider[] = [
  shapesProvider, // fully local — always instant, never fails
  qrcodeProvider, // fully local — self-filters to "qr" queries only
  wikimediaProvider,
  svgrepoProvider,
  unsplashProvider,
  pexelsProvider,
  pixabayProvider,
  colorIconsProvider,
  undrawProvider,
  openDoodlesProvider,
  simpleIconsProvider,
  openverseProvider, // last — requires async registration/token fetch
];

export const PROVIDERS_BY_NAME: Record<ProviderName, MediaProvider> = Object.fromEntries(
  ALL_PROVIDERS.map((p) => [p.name, p]),
) as Record<ProviderName, MediaProvider>;

/** Providers that work with zero configuration — always at least this many results are possible. */
export const ZERO_KEY_PROVIDERS: ProviderName[] = ALL_PROVIDERS.filter((p) => {
  // pexels/unsplash/pixabay need a key; everything else works unauthenticated.
  return !["pexels", "unsplash", "pixabay"].includes(p.name);
}).map((p) => p.name);

const ILLUSTRATION_PROVIDER_ORDER: ProviderName[] = [
  "undraw",
  "opendoodles",
  "coloricons",
  "svgrepo",
  "simpleicons",
  "shapes",
  "pixabay",
  "openverse",
  "wikimedia",
  "unsplash",
  "pexels",
  "qrcode",
];

const PHOTO_PROVIDER_ORDER: ProviderName[] = [
  "unsplash",
  "pexels",
  "pixabay",
  "openverse",
  "wikimedia",
  "svgrepo",
  "coloricons",
  "undraw",
  "opendoodles",
  "simpleicons",
  "shapes",
  "qrcode",
];

function normalizeQuery(query: string): string[] {
  return query.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).map((p) => p.trim()).filter(Boolean);
}

function providerOrderForQuery(query: string): ProviderName[] {
  const terms = new Set(normalizeQuery(query));
  const has = (...words: string[]) => words.some((w) => terms.has(w));

  if (
    has(
      "shape", "shapes", "circle", "circles", "square", "squares", "rectangle", "rectangles",
      "triangle", "triangles", "polygon", "hexagon", "pentagon", "octagon", "diamond", "rhombus",
      "star", "stars", "heart", "divider", "dividers", "arrow", "arrows", "frame", "frames",
      "speech", "bubble", "tag", "tags", "seal", "stamp", "ribbon", "qr", "qrcode",
    )
  ) {
    return ["shapes", "qrcode", ...ILLUSTRATION_PROVIDER_ORDER.filter((p) => p !== "shapes" && p !== "qrcode")];
  }

  if (has("logo", "logos", "brand", "branding", "badge")) {
    // svgrepo surfaces real multi-color brand marks (Iconify's "logos" set)
    // first; simpleicons' brand set is single-color and reads as "wrong" for
    // an actual logo search, so it's demoted below the real thing.
    return [
      "svgrepo",
      "wikimedia",
      "simpleicons",
      ...ILLUSTRATION_PROVIDER_ORDER.filter((p) => p !== "svgrepo" && p !== "wikimedia" && p !== "simpleicons"),
    ];
  }

  if (has("icon", "icons")) {
    return ["svgrepo", "simpleicons", ...ILLUSTRATION_PROVIDER_ORDER.filter((p) => p !== "svgrepo" && p !== "simpleicons")];
  }

  if (
    has(
      "illustration", "illustrations", "vector", "vectors", "sticker", "stickers", "decor",
      "decorative", "party", "birthday", "cake", "balloon", "balloons", "gift", "box", "boxes",
      "background", "backgrounds", "banner", "banners", "poster", "posters", "holiday", "event", "events",
    )
  ) {
    return ILLUSTRATION_PROVIDER_ORDER;
  }

  if (has("photo", "photos", "photography", "image", "images", "portrait", "landscape")) {
    return PHOTO_PROVIDER_ORDER;
  }

  return [
    "svgrepo", "undraw", "opendoodles", "coloricons", "simpleicons", "shapes",
    "pixabay", "openverse", "wikimedia", "unsplash", "pexels", "qrcode",
  ];
}

const MIN_PRINT_DIMENSION = 2000; // ~A4 long edge @ 150dpi

function assetOrientation(a: MediaAsset): Exclude<MediaOrientation, "all"> | undefined {
  if (!a.width || !a.height) return undefined;
  const ratio = a.width / a.height;
  if (ratio < 0.95) return "portrait";
  if (ratio > 1.05) return "landscape";
  return "square";
}

function orderProvidersByQuery(query: string): MediaProvider[] {
  const priority = providerOrderForQuery(query);
  return [...ALL_PROVIDERS].sort((a, b) => priority.indexOf(a.name) - priority.indexOf(b.name));
}

function shuffleFairly(assets: MediaAsset[], providerOrder: ProviderName[]): MediaAsset[] {
  const byProvider = new Map<string, MediaAsset[]>();
  for (const a of assets) {
    const arr = byProvider.get(a.provider) ?? [];
    arr.push(a);
    byProvider.set(a.provider, arr);
  }
  const groups = providerOrder.map((name) => byProvider.get(name)).filter((g): g is MediaAsset[] => Boolean(g));
  const result: MediaAsset[] = [];
  const maxLen = groups.length ? Math.max(...groups.map((g) => g.length)) : 0;
  for (let i = 0; i < maxLen; i++) {
    for (const g of groups) if (i < g.length) result.push(g[i]);
  }
  return result;
}

export type SearchAllOptions = {
  provider?: ProviderName | "all";
  assetType?: MediaAssetType | MediaAssetType[] | "all";
  orientation?: MediaOrientation;
  color?: ColorFilterId | "all";
  highResOnly?: boolean;
  page?: number;
  perPage?: number;
};

/**
 * Fans out to every configured provider in parallel, deduplicates, filters,
 * and interleaves results in query-aware provider order. This is the single
 * entrypoint the `ImageProvider` in `../search.ts` calls.
 */
export async function searchAllProviders(
  query: string,
  {
    provider = "all",
    assetType = "all",
    orientation = "all",
    color = "all",
    highResOnly = false,
    page = 1,
    perPage = 20,
  }: SearchAllOptions = {},
): Promise<MediaSearchResult> {
  const typeKey = Array.isArray(assetType) ? assetType.join(",") : assetType;
  const key = cacheKey("search", query, provider, typeKey, orientation, color, highResOnly ? "hires" : "any", page, perPage);
  const cached = getCached<MediaSearchResult>(key);
  if (cached) return cached;

  const candidates =
    provider === "all" ? orderProvidersByQuery(query) : ALL_PROVIDERS.filter((p) => p.name === provider);
  const providers = candidates.filter((p) => p.configured());

  const errors: Partial<Record<ProviderName, string>> = {};
  const opts = { color: color !== "all" ? color : undefined, orientation };

  // Cleared in `finally` regardless of which side of the race wins — leaving
  // it running would hold a live timer (and its closure) for up to 15s past
  // the point the provider already resolved, once per provider per search.
  function withTimeout<T>(p: Promise<T>, ms = 15000): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Provider timeout")), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  const settled = await Promise.allSettled(providers.map((p) => withTimeout(p.search(query, page, perPage, opts))));

  let assets: MediaAsset[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") assets.push(...result.value);
    else errors[providers[i].name] = result.reason?.message ?? "Unknown error";
  });

  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  assets = assets.filter((a) => {
    if (seenIds.has(a.id) || seenUrls.has(a.downloadUrl)) return false;
    seenIds.add(a.id);
    seenUrls.add(a.downloadUrl);
    return true;
  });

  if (assetType !== "all") {
    const types = Array.isArray(assetType) ? assetType : [assetType];
    assets = assets.filter((a) => types.includes(a.assetType));
  }

  // Orientation is meaningless for scalable vector/icon art — only assets
  // with known pixel dimensions get filtered.
  if (orientation !== "all") {
    assets = assets.filter((a) => {
      const o = assetOrientation(a);
      return o === undefined || o === orientation;
    });
  }

  if (highResOnly) {
    assets = assets.filter((a) => {
      if (!a.width || !a.height) return true;
      return Math.max(a.width, a.height) >= MIN_PRINT_DIMENSION;
    });
  }

  assets = shuffleFairly(assets, providers.map((p) => p.name));

  const result: MediaSearchResult = {
    assets,
    total: assets.length,
    page,
    hasMore: assets.length >= perPage,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };

  if (assets.length > 0) setCached(key, result);
  return result;
}
