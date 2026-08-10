import { config } from "../../../config.js";
import type { MediaAsset, MediaAssetType, MediaProvider } from "./types.js";

function inferType(tags: string[]): MediaAssetType {
  const tagStr = tags.join(" ").toLowerCase();
  if (tagStr.includes("icon")) return "icon";
  if (tagStr.includes("background") || tagStr.includes("pattern")) return "background";
  return "photo";
}

// Module-level credential + token cache — singletons prevent concurrent requests
// from each re-registering/re-authenticating with Openverse.
let clientId: string | null = null;
let clientSecret: string | null = null;
let registerPromise: Promise<void> | null = null;

let token: string | null = null;
let tokenExpiry = 0;
let tokenPromise: Promise<string | null> | null = null;

/** Self-registers with Openverse for a client_id/secret (free, instant, no human step). */
async function ensureRegistered(): Promise<void> {
  if (config.openverseClientId && config.openverseClientSecret) {
    clientId = config.openverseClientId;
    clientSecret = config.openverseClientSecret;
    return;
  }
  if (clientId && clientSecret) return;

  try {
    const res = await fetch("https://api.openverse.org/v1/auth_tokens/register/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Flyero",
        description: "Marketing flyer generator — stock asset search",
        email: "noreply@flyero.app",
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { client_id: string; client_secret: string };
      clientId = data.client_id;
      clientSecret = data.client_secret;
    }
  } catch {
    // fall through — attempt unauthenticated
  }
}

async function fetchToken(): Promise<string | null> {
  if (!registerPromise) registerPromise = ensureRegistered();
  await registerPromise;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://api.openverse.org/v1/auth_tokens/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { access_token: string; expires_in: number };
      token = data.access_token;
      tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      return token;
    }
  } catch {
    // fall through
  }
  return null;
}

async function getOpenverseToken(): Promise<string | null> {
  if (token && Date.now() < tokenExpiry) return token;
  if (!tokenPromise) tokenPromise = fetchToken().finally(() => { tokenPromise = null; });
  return tokenPromise;
}

export const openverseProvider: MediaProvider = {
  name: "openverse",

  // Works unauthenticated (lower rate limit); self-registration only improves it.
  configured: () => true,

  async search(query, page, perPage) {
    const bearer = await getOpenverseToken();

    const url = new URL("https://api.openverse.org/v1/images/");
    url.searchParams.set("q", query);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(perPage));

    const headers: Record<string, string> = { "User-Agent": "Flyero/1.0 (https://github.com)" };
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) throw new Error(`Openverse ${res.status}: ${res.statusText}`);

    const data = (await res.json()) as {
      results: Array<{
        id: string;
        title: string;
        url: string;
        thumbnail: string;
        foreign_landing_url: string;
        license: string;
        creator?: string;
        width?: number;
        height?: number;
        tags?: Array<{ name: string }>;
        attribution?: string;
      }>;
    };

    return data.results.map(
      (r): MediaAsset => ({
        id: `openverse::${r.id}`,
        title: r.title || "Untitled",
        description: r.attribution,
        provider: "openverse",
        assetType: inferType(r.tags?.map((t) => t.name) ?? []),
        thumbnailUrl: r.thumbnail || r.url,
        downloadUrl: r.url,
        sourceUrl: r.foreign_landing_url,
        width: r.width,
        height: r.height,
        license: r.license?.toUpperCase(),
        author: r.creator,
        tags: r.tags?.map((t) => t.name),
      }),
    );
  },
};
