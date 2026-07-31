/**
 * Intrinsic image dimensions straight from the file header.
 *
 * Deliberately dependency-free: we only ever need width and height, and the
 * pixels themselves are passed through to the SVG as a data: URI without being
 * decoded. Adding a full image library to read two integers would be silly.
 */

export type Dimensions = { width: number; height: number };

export function imageSize(buf: Buffer, mime: string): Dimensions {
  switch (mime) {
    case "image/png":
      return pngSize(buf);
    case "image/jpeg":
      return jpegSize(buf);
    case "image/webp":
      return webpSize(buf);
    case "image/svg+xml":
      return svgSize(buf);
    default:
      throw new Error(`Cannot measure image of type ${mime}`);
  }
}

function pngSize(buf: Buffer): Dimensions {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error("Not a valid PNG");
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): Dimensions {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error("Not a valid JPEG");
  let offset = 2;
  while (offset < buf.length - 9) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buf[offset + 1]!;
    // SOF0..SOF15, excluding the non-frame markers DHT(c4), JPG(c8), DAC(cc).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + buf.readUInt16BE(offset + 2);
  }
  throw new Error("Could not find JPEG frame header");
}

function webpSize(buf: Buffer): Dimensions {
  if (buf.length < 30 || buf.toString("ascii", 0, 4) !== "RIFF") throw new Error("Not a valid WebP");
  const format = buf.toString("ascii", 12, 16);
  if (format === "VP8 ") {
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (format === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (format === "VP8X") {
    const width = 1 + (buf.readUIntLE(24, 3) & 0xffffff);
    const height = 1 + (buf.readUIntLE(27, 3) & 0xffffff);
    return { width, height };
  }
  throw new Error(`Unsupported WebP variant ${format}`);
}

function svgSize(buf: Buffer): Dimensions {
  const head = buf.toString("utf8", 0, Math.min(buf.length, 4096));
  const viewBox = head.match(/viewBox\s*=\s*["']\s*[\d.+-]+\s+[\d.+-]+\s+([\d.]+)\s+([\d.]+)/i);
  if (viewBox) {
    return { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) };
  }
  const w = head.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const h = head.match(/\bheight\s*=\s*["']([\d.]+)/i);
  if (w && h) return { width: Math.round(Number(w[1])), height: Math.round(Number(h[1])) };
  // A viewBox-less SVG is still usable; the renderer scales it into its slot.
  return { width: 512, height: 512 };
}
