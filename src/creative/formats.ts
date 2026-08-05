/**
 * Output formats — the canvas a flyer renders at.
 *
 * Not a Studio Sampler dimension: format is chosen by the caller (a REST
 * request, an agent), not sampled per lineage — two lineages in the same job
 * always share one format, the way two designers pitching the same brief
 * would still both be told "this needs to be a square post." `docs/ROADMAP.md`
 * gated this behind "Milestone 6 users ask for them" (L1); it's built now
 * because that ask arrived directly instead.
 *
 * Every topology recipe (`src/core/layout/recipes.ts`) is normalised 0-1
 * against the safe rectangle, so a format change is a real re-layout, not a
 * stretch: the solver already reads `spec.canvas.w/h` generically rather than
 * assuming 1080×1350.
 */

import { CANVAS } from "../config.js";

export type FormatId = "portrait-4x5" | "square-1x1" | "story-9x16";

export type FormatValue = {
  id: FormatId;
  w: number;
  h: number;
  safe: number;
  label: string;
};

export const FORMATS: readonly FormatValue[] = [
  {
    id: "portrait-4x5",
    ...CANVAS,
    label: "Portrait 4:5 (1080×1350) — the Instagram feed post this product started with",
  },
  {
    id: "square-1x1",
    w: 1080,
    h: 1080,
    safe: 56,
    label: "Square 1:1 (1080×1080) — feed posts, profile-grid consistency",
  },
  {
    id: "story-9x16",
    w: 1080,
    h: 1920,
    safe: 72,
    label: "Story 9:16 (1080×1920) — Instagram/TikTok story and reel cover",
  },
] as const;

export const FORMAT_IDS = FORMATS.map((f) => f.id) as FormatId[];

export const DEFAULT_FORMAT: FormatId = "portrait-4x5";

export function formatById(id: FormatId): FormatValue {
  const found = FORMATS.find((f) => f.id === id);
  if (!found) throw new Error(`Unknown format ${JSON.stringify(id)}`);
  return found;
}

/** Whether `w`/`h` match a known format — used to validate a spec's canvas without trusting its `safe`. */
export function isKnownCanvasSize(w: number, h: number): boolean {
  return FORMATS.some((f) => f.w === w && f.h === h);
}
