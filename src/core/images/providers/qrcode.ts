import QRCode from "qrcode";
import { COLOR_HEX, type ColorFilterId } from "./colors.js";
import type { MediaAsset, MediaProvider } from "./types.js";

// Flyers routinely need a scannable link (event page, RSVP form, menu).
// Type "qr:<text or url>" to encode custom content; a bare "qr code" query
// returns one sample so the feature is discoverable via search.
export const qrcodeProvider: MediaProvider = {
  name: "qrcode",

  configured: () => true,

  async search(query, page, perPage, opts) {
    if (page > 1) return []; // always exactly one result
    const normalized = query.toLowerCase();
    if (!normalized.includes("qr")) return [];

    const explicit = query.match(/qr:\s*(.+)/i);
    const payload = explicit ? explicit[1].trim() : "https://example.com";
    if (!payload) return [];

    const dark = opts?.color ? `#${COLOR_HEX[opts.color as ColorFilterId] ?? "000000"}` : "#000000";
    const svg = await QRCode.toString(payload, { type: "svg", margin: 1, color: { dark, light: "#0000" } });
    const dataUri = `data:image/svg+xml,${encodeURIComponent(svg)}`;

    const asset: MediaAsset = {
      id: `qrcode::${encodeURIComponent(payload)}`,
      title: explicit ? `QR code — ${payload}` : "QR code (type qr:yoururl.com for custom)",
      provider: "qrcode",
      assetType: "shape",
      thumbnailUrl: dataUri,
      downloadUrl: dataUri,
      sourceUrl: dataUri,
      license: "Generated — free to use",
      author: "Flyero",
      tags: ["qr", "qr code", "scan", "link"],
    };

    return [asset];
  },
};
