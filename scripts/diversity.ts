/**
 * Live rendered DR-1 harness.
 *
 * Starts ten genuinely independent jobs through POST /v1/batches, waits for
 * completion, downloads the shipped pixels/specs, writes a blind contact sheet,
 * and performs structural + perceptual duplicate checks. It does not replace
 * the required three-person grouping panel; it prepares that panel and catches
 * obvious failures before humans spend time on it.
 *
 *   npm run diversity -- "flyer prompt" [runs]
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";

const prompt = process.argv[2];
const runs = Number(process.argv[3] ?? 10);
const apiUrl = (process.env.FLYERO_API_URL ?? "http://localhost:8080").replace(/\/$/, "");
const apiKey = process.env.FLYERO_API_KEY ?? "dev_key_change_me";
const TERMINAL = new Set(["done", "below_bar", "failed"]);

if (!prompt || prompt.trim().length < 3) {
  throw new Error('Usage: npm run diversity -- "your flyer prompt" [runs]');
}
if (!Number.isInteger(runs) || runs < 8 || runs > 20) {
  throw new Error("runs must be an integer from 8 to 20");
}

type BatchResult = {
  jobId: string;
  status: string;
  idea: string | null;
  lineage: null | {
    artDirection: string;
    metaphor: string;
    topology: string;
    readingPath: string;
  };
  gates: null | { passed: boolean };
  cost: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function binary(path: string): Promise<Buffer> {
  const response = await fetch(`${apiUrl}${path}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) throw new Error(`GET ${path} failed (${response.status}): ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
}

async function wait(ms: number): Promise<void> {
  await new Promise((accept) => setTimeout(accept, ms));
}

async function differenceHash(image: Buffer): Promise<bigint> {
  const pixels = await sharp(image).resize(9, 8, { fit: "fill" }).grayscale().raw().toBuffer();
  let hash = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      hash = (hash << 1n) | (pixels[y * 9 + x]! > pixels[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return hash;
}

function hamming(a: bigint, b: bigint): number {
  let value = a ^ b;
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

function colorFamily(hex: string | undefined): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return "unknown";
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r!, g!, b!);
  const min = Math.min(r!, g!, b!);
  if (max - min < 0.08) return "neutral";
  let hue = 0;
  if (max === r) hue = ((g! - b!) / (max - min)) % 6;
  else if (max === g) hue = (b! - r!) / (max - min) + 2;
  else hue = (r! - g!) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue < 30 || hue >= 330) return "red";
  if (hue < 75) return "orange-yellow";
  if (hue < 165) return "green";
  if (hue < 210) return "cyan";
  if (hue < 270) return "blue";
  return "purple-magenta";
}

function xml(value: string): string {
  return value.replace(/[<>&"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

async function contactSheet(
  entries: Array<{ result: BatchResult; png: Buffer; index: number }>,
  outPath: string,
): Promise<void> {
  const cols = 5;
  const cellW = 300;
  const cellH = 375;
  const labelH = 62;
  const gap = 18;
  const rows = Math.ceil(entries.length / cols);
  const width = gap + cols * (cellW + gap);
  const height = gap + rows * (cellH + labelH + gap);
  const composites: OverlayOptions[] = [];
  for (const entry of entries) {
    const col = entry.index % cols;
    const row = Math.floor(entry.index / cols);
    const left = gap + col * (cellW + gap);
    const top = gap + row * (cellH + labelH + gap);
    composites.push({
      input: await sharp(entry.png).resize(cellW, cellH, { fit: "fill" }).png().toBuffer(),
      left,
      top,
    });
    const lineage = entry.result.lineage;
    const label = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${cellW}" height="${labelH}">
        <rect width="100%" height="100%" fill="#f5f3ef"/>
        <text x="4" y="18" font-family="Arial" font-size="13" font-weight="700" fill="#171717">Flyer ${entry.index + 1} · ${xml(entry.result.status)}</text>
        <text x="4" y="36" font-family="Arial" font-size="10" fill="#444">${xml(lineage ? `${lineage.metaphor} · ${lineage.topology}` : "no lineage")}</text>
        <text x="4" y="51" font-family="Arial" font-size="10" fill="#666">${xml(lineage ? `${lineage.artDirection} · ${lineage.readingPath}` : "")}</text>
      </svg>`,
    );
    composites.push({ input: label, left, top: top + cellH });
  }
  await sharp({
    create: { width, height, channels: 3, background: "#dedbd4" },
  })
    .composite(composites)
    .png()
    .toFile(outPath);
}

async function main(): Promise<void> {
  const created = await api<{ batchId: string; jobIds: string[] }>("/v1/batches", {
    method: "POST",
    body: JSON.stringify({ prompt, runs }),
  });
  console.log(`Started ${created.batchId} with ${created.jobIds.length} independent jobs`);

  let results: BatchResult[] = [];
  for (;;) {
    const batch = await api<{ complete: number; results: BatchResult[] }>(`/v1/batches/${created.batchId}`);
    results = batch.results;
    console.log(`${batch.complete}/${runs} complete`);
    if (results.length === runs && results.every((result) => TERMINAL.has(result.status))) break;
    await wait(5000);
  }

  const outDir = resolve(".scratch", "diversity", created.batchId);
  mkdirSync(outDir, { recursive: true });
  const rendered: Array<{
    result: BatchResult;
    png: Buffer;
    spec: any;
    hash: bigint;
    index: number;
  }> = [];
  for (const [index, result] of results.entries()) {
    if (result.status === "failed") continue;
    const [png, spec] = await Promise.all([
      binary(`/v1/flyers/${result.jobId}/export?format=png`),
      api<any>(`/v1/flyers/${result.jobId}/spec`),
    ]);
    writeFileSync(resolve(outDir, `${index + 1}-${result.jobId}.png`), png);
    rendered.push({ result, png, spec, hash: await differenceHash(png), index });
  }
  await contactSheet(rendered, resolve(outDir, "review-sheet.png"));

  const passing = rendered.filter((entry) => entry.result.status === "done" && entry.result.gates?.passed);
  const structuralSignatures = passing.map((entry) =>
    [
      entry.result.lineage?.artDirection,
      entry.result.lineage?.metaphor,
      entry.result.lineage?.topology,
      entry.result.lineage?.readingPath,
      entry.spec.elements?.find((element: any) => element.role === "evidence")?.component,
    ].join("|"),
  );
  const families = passing.map((entry) => colorFamily(entry.spec.brand?.colors?.accent));
  const familyCounts = Object.fromEntries(
    [...new Set(families)].map((family) => [family, families.filter((value) => value === family).length]),
  );
  const nearDuplicatePairs: Array<{ a: number; b: number; hamming: number }> = [];
  for (let a = 0; a < passing.length; a++) {
    for (let b = a + 1; b < passing.length; b++) {
      const distance = hamming(passing[a]!.hash, passing[b]!.hash);
      if (distance <= 8) {
        nearDuplicatePairs.push({
          a: passing[a]!.index + 1,
          b: passing[b]!.index + 1,
          hamming: distance,
        });
      }
    }
  }
  const maxColorFamily = Math.max(0, ...Object.values(familyCounts));
  const report = {
    batchId: created.batchId,
    prompt,
    runs,
    done: passing.length,
    belowBar: results.filter((result) => result.status === "below_bar").length,
    failed: results.filter((result) => result.status === "failed").length,
    distinctStructuralSignatures: new Set(structuralSignatures).size,
    colorFamilies: familyCounts,
    nearDuplicatePairs,
    automatedPrecheck: {
      everyFlyerPassed: passing.length === runs,
      atLeastEightStructures: new Set(structuralSignatures).size >= 8,
      noColorFamilyAboveTwo: maxColorFamily <= 2,
      noObviousPixelDuplicates: nearDuplicatePairs.length === 0,
    },
    humanPanelStillRequired:
      "Three outsiders independently group review-sheet.png by similarity. DR-1 passes only with at least 8 groups and every flyer done.",
    results: rendered.map((entry) => ({
      number: entry.index + 1,
      jobId: entry.result.jobId,
      status: entry.result.status,
      idea: entry.result.idea,
      lineage: entry.result.lineage,
      structuralSignature: [
        entry.result.lineage?.artDirection,
        entry.result.lineage?.metaphor,
        entry.result.lineage?.topology,
        entry.result.lineage?.readingPath,
        entry.spec.elements?.find((element: any) => element.role === "evidence")?.component,
      ].join("|"),
      colorFamily: colorFamily(entry.spec.brand?.colors?.accent),
      differenceHash: entry.hash.toString(16).padStart(16, "0"),
    })),
  };
  writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2));
  writeFileSync(
    resolve(outDir, "panel-form.md"),
    `# DR-1 blind grouping — ${created.batchId}\n\nOpen \`review-sheet.png\`. Without discussing first, each reviewer writes groups of flyer numbers that feel like the same design family.\n\n- Reviewer 1 groups:\n- Reviewer 2 groups:\n- Reviewer 3 groups:\n\nPass: consensus has at least 8 distinct groups, and report.json says all ${runs} flyers shipped as done.\n`,
  );
  console.log(`Wrote ${outDir}/review-sheet.png, report.json and panel-form.md`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
