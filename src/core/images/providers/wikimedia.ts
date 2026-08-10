import type { MediaAsset, MediaAssetType, MediaProvider } from "./types.js";

function mimeToType(mime: string, title: string): MediaAssetType {
  if (mime === "image/svg+xml") return "svg";
  if (mime === "image/png") return title.toLowerCase().includes("icon") ? "icon" : "png";
  return "photo";
}

// Simple in-memory retry state — back off after a 429.
let backoffUntil = 0;

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export const wikimediaProvider: MediaProvider = {
  name: "wikimedia",

  configured: () => true,

  async search(query, page, perPage) {
    if (Date.now() < backoffUntil) throw new Error("Wikimedia: temporary rate limit backoff");

    const offset = (page - 1) * perPage;
    const url = new URL("https://commons.wikimedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("generator", "search");
    url.searchParams.set("gsrsearch", `${query} filetype:bitmap|svg`);
    url.searchParams.set("gsrnamespace", "6");
    url.searchParams.set("gsrlimit", String(Math.min(perPage, 20)));
    url.searchParams.set("gsroffset", String(offset));
    url.searchParams.set("prop", "imageinfo");
    url.searchParams.set("iiprop", "url|size|mime|extmetadata");
    url.searchParams.set("iiurlwidth", "400");
    url.searchParams.set("format", "json");
    url.searchParams.set("origin", "*");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Flyero/1.0 (+https://github.com; contact@flyero.app)",
        "Api-User-Agent": "Flyero/1.0",
      },
    });

    if (res.status === 429) {
      backoffUntil = Date.now() + 60_000;
      throw new Error(`Wikimedia ${res.status}: rate limited`);
    }
    if (!res.ok) throw new Error(`Wikimedia ${res.status}: ${res.statusText}`);

    const data = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            pageid: number;
            title: string;
            imageinfo?: Array<{
              url: string;
              thumburl?: string;
              width?: number;
              height?: number;
              mime?: string;
              extmetadata?: {
                LicenseShortName?: { value: string };
                Artist?: { value: string };
                ImageDescription?: { value: string };
              };
            }>;
          }
        >;
      };
    };

    const pages = Object.values(data.query?.pages ?? {});
    return pages
      .map((p): MediaAsset | null => {
        const info = p.imageinfo?.[0];
        if (!info?.url) return null;
        const mime = info.mime ?? "image/jpeg";
        const title = p.title.replace(/^File:/, "").replace(/\.\w+$/, "");
        const rawDescription = info.extmetadata?.ImageDescription?.value;
        return {
          id: `wikimedia::${p.pageid}`,
          title,
          description: rawDescription ? stripHtml(rawDescription).slice(0, 400) : undefined,
          provider: "wikimedia",
          assetType: mimeToType(mime, title),
          thumbnailUrl: info.thumburl || info.url,
          downloadUrl: info.url,
          sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
          width: info.width,
          height: info.height,
          license: info.extmetadata?.LicenseShortName?.value ?? "CC",
          author: info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, ""),
        };
      })
      .filter((a): a is MediaAsset => a !== null);
  },
};
