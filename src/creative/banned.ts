import { hueFamily, toHsl } from "./color.js";
import { materialById } from "./materials.js";
import type { Box } from "../components/types.js";
import type { DesignSpec } from "../core/compose/spec.js";

/**
 * The banned-list detector (SCHEMAS.md §8) — the 2026 AI look, spelled out so
 * code can kill it. Score +1 per signal; two or more fails.
 *
 * These are heuristics on structure and colour, not a vision pass. Some signals
 * can never fire against the current Component Library (there is no glass panel
 * and no 3D orb to choose) — they stay implemented so that adding such a
 * component later cannot quietly reopen the hole.
 */

export type BannedHit = { signal: string; detail: string };

export type BannedResult = {
  clear: boolean;
  score: number;
  hits: BannedHit[];
};

const GLASS_COMPONENTS = new Set(["glass-panel", "frosted-panel"]);
const ORB_COMPONENTS = new Set(["orb", "glow-orb", "sphere-3d"]);
const DECOR_PATTERN = /\b(decor|decorative|atmospher|ambien|fill(s|ing)? (the )?space|visual interest|adds? depth)\b/i;

export function detectBanned(
  spec: DesignSpec,
  boxes: Record<string, Box>,
  /**
   * The planned ground, when the caller has one. Without it this function sees
   * only `brand.colors.bg` — so a gradient wash running navy to cyan, or a
   * saturated colour block covering most of the page, would evade signal 1
   * completely. That is the exact look the banned list exists to kill, so every
   * fill that actually gets painted is tested, not just the flat page colour.
   */
  ground?: { base: string; regions: { fill: string }[]; gradient: { from: string; to: string } | null },
): BannedResult {
  const hits: BannedHit[] = [];
  const { bg, accent } = spec.brand.colors;

  // 1 — dark navy gradient with a cyan/purple glow.
  const accentFamily = hueFamily(accent);
  const glowish = accentFamily === "cyan" || accentFamily === "purple" || accentFamily === "blue";
  const isNavy = (hex: string): boolean => {
    const h = toHsl(hex);
    return h.h >= 195 && h.h <= 265 && h.l < 0.32 && h.s > 0.18;
  };
  const paintedFills = [
    bg,
    ...(ground ? [ground.base, ...ground.regions.map((r) => r.fill)] : []),
    ...(ground?.gradient ? [ground.gradient.from, ground.gradient.to] : []),
  ];
  const navyFill = paintedFills.find(isNavy);
  if (navyFill && glowish) {
    hits.push({
      signal: "navy-cyan-glow",
      detail: `painted ground ${navyFill} sits in the navy band with a ${accentFamily} accent (${accent})`,
    });
  }
  const bgHsl = toHsl(bg);

  /**
   * 1b–1d — the three palettes current AI design keeps landing on.
   *
   * Not our observation: these are named explicitly in Anthropic's official
   * `frontend-design` skill, which calls them "defaults rather than choices"
   * that "appear regardless of subject". They are imported here rather than
   * invented because the whole point of the banned list is to encode what
   * experienced designers actually recognise as generated-looking, and a
   * detector we reasoned our way to would just re-encode our own habits.
   *
   * Each is legitimate for *some* brief. That is exactly why they are +1
   * signals rather than outright rejections — two hits fail, one does not.
   */
  const accentHsl = toHsl(accent);
  const fgHsl = toHsl(spec.brand.colors.fg);

  // 1b — warm cream ground, high-contrast serif, terracotta accent.
  const creamGround =
    bgHsl.l > 0.9 && bgHsl.s > 0.05 && bgHsl.s < 0.35 && bgHsl.h >= 20 && bgHsl.h <= 60;
  const terracotta =
    accentHsl.h >= 5 && accentHsl.h <= 35 && accentHsl.s > 0.3 && accentHsl.l > 0.25 && accentHsl.l < 0.62;
  if (creamGround && terracotta) {
    hits.push({
      signal: "cream-serif-terracotta",
      detail: `warm cream ground ${bg} with a terracotta accent ${accent} — the most common generated palette`,
    });
  }

  // 1c — near-black ground carrying one acid-green or vermilion accent.
  const nearBlack = bgHsl.l < 0.16;
  const acid =
    (accentHsl.h >= 68 && accentHsl.h <= 160 && accentHsl.s > 0.55 && accentHsl.l > 0.4) ||
    (accentHsl.h >= 0 && accentHsl.h <= 18 && accentHsl.s > 0.65 && accentHsl.l > 0.42);
  if (nearBlack && acid) {
    hits.push({
      signal: "black-acid-accent",
      detail: `near-black ground ${bg} with a single high-chroma accent ${accent}`,
    });
  }

  // 1d — the broadsheet default: hairline rules, zero radius, dense columns.
  const surface = materialById(spec.lineage.material).surface;
  const hairline = surface.strokeWidth <= 1.5 && surface.cornerRadius <= 1;
  const ruleCount = spec.elements.filter((e) => /rule|divider|line/i.test(e.component)).length;
  const monochrome = Math.abs(accentHsl.h - fgHsl.h) < 12 && accentHsl.s < 0.15;
  if (hairline && (ruleCount >= 2 || monochrome)) {
    hits.push({
      signal: "broadsheet-default",
      detail: `hairline rules at zero radius with ${ruleCount} divider(s) — the newspaper-pastiche default`,
    });
  }

  // 2 — everything huddled in the middle.
  const content = spec.elements
    .filter((e) => e.role !== "structure")
    .map((e) => boxes[e.id])
    .filter((b): b is Box => Boolean(b));
  if (content.length > 0) {
    const { w, h } = spec.canvas;
    const inCentre = content.every(
      (b) =>
        b.x >= w * 0.3 && b.x + b.w <= w * 0.7 && b.y >= h * 0.3 && b.y + b.h <= h * 0.7,
    );
    if (inCentre) {
      hits.push({
        signal: "centred-single-cluster",
        detail: "every element sits inside the middle 40% of the canvas",
      });
    }
  }

  // 3 — three equal feature cards.
  const byComponent = new Map<string, Box[]>();
  for (const el of spec.elements) {
    const box = boxes[el.id];
    if (!box) continue;
    const list = byComponent.get(el.component) ?? [];
    list.push(box);
    byComponent.set(el.component, list);
  }
  for (const [component, group] of byComponent) {
    if (group.length < 3) continue;
    const widths = group.map((b) => b.w);
    const min = Math.min(...widths);
    const max = Math.max(...widths);
    if (max - min <= max * 0.05) {
      hits.push({
        signal: "three-equal-cards",
        detail: `${group.length}× ${component} at near-identical width`,
      });
    }
  }

  // 4 / 5 — glassmorphism and 3D orbs.
  for (const el of spec.elements) {
    if (GLASS_COMPONENTS.has(el.component)) {
      hits.push({ signal: "glassmorphism-panel", detail: `element ${el.id} uses ${el.component}` });
    }
    if (ORB_COMPONENTS.has(el.component)) {
      hits.push({ signal: "generic-3d-orb", detail: `element ${el.id} uses ${el.component}` });
    }
  }

  // 6 — structure that means nothing.
  const related = new Set(spec.relationships.flatMap((r) => [r.front, r.behind]));
  for (const el of spec.elements) {
    if (el.role !== "structure") continue;
    if (DECOR_PATTERN.test(el.whyHere) && !related.has(el.id)) {
      hits.push({
        signal: "meaningless-structure",
        detail: `${el.id} (${el.component}) is justified as decoration and nothing registers against it`,
      });
    }
  }

  // 7 — a pill CTA as the only visual event.
  const hasEvidence = spec.elements.some((e) => e.role === "evidence");
  const ctaIsOnlyEvent = !hasEvidence && spec.elements.some((e) => e.role === "cta");
  if (ctaIsOnlyEvent) {
    hits.push({
      signal: "cta-only-event",
      detail: "the call to action is the only thing carrying the accent, with no evidence element",
    });
  }

  return { clear: hits.length < 2, score: hits.length, hits };
}
