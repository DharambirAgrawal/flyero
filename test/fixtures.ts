import { sampleLineages } from "../src/core/studio/sampler.js";
import { paletteFor } from "../src/core/render/theme.js";
import { parseSpec, type DesignSpec, type Lineage } from "../src/core/compose/spec.js";
import { fontPairById } from "../src/creative/fontpairs.js";
import { gestureById } from "../src/creative/gestures.js";
import { CANVAS } from "../src/config.js";
import { manifestsFor } from "../src/components/registry.js";
import { artDirectionById } from "../src/creative/artdirections.js";
import { Rng } from "../src/lib/rng.js";

/**
 * Hand-written specs for tests that must not depend on a model being reachable.
 * Everything below Stage 4 is pure, so this is the whole seam we need.
 */

/** The component each gesture needs, so a fixture always satisfies the schema. */
const GESTURE_COMPONENTS: Record<string, Record<string, unknown>> = {
  "path-connector": {
    id: "path",
    component: "path-connector",
    role: "structure",
    whyHere: "carries the eye from the proof down to the action",
    props: { points: [{ x: 0.1, y: 0 }, { x: 0.6, y: 0.6 }, { x: 0.95, y: 1 }] },
  },
  "oversized-letterform": {
    id: "letter",
    component: "oversized-letterform",
    role: "structure",
    whyHere: "gives the composition an architectural spine to sit against",
    props: { character: "V" },
  },
  "annotation-label": {
    id: "note",
    component: "annotation-label",
    role: "support",
    whyHere: "names what the product changed about the line",
    props: { text: "rewritten to lead with the outcome" },
  },
  "rule-line": {
    id: "rule",
    component: "rule-line",
    role: "structure",
    whyHere: "divides the claim from the proof",
    props: { weight: "medium" },
  },
  "big-numeral": {
    id: "num",
    component: "big-numeral",
    role: "support",
    whyHere: "anchors the one figure the brief supplied",
    props: { value: "3x", caption: "callbacks reported by early users" },
  },
  "eyebrow-label": {
    id: "eyebrow",
    component: "eyebrow-label",
    role: "support",
    whyHere: "names who this is for before the headline lands",
  },
};

export function fixtureLineages(seed = "TESTSEED0001", count = 3): Lineage[] {
  return sampleLineages({ jobSeed: seed, count, risk: "studio" }).lineages;
}

export function fixtureSpec(lineage: Lineage): DesignSpec {
  const palette = paletteFor(lineage, []);
  const fonts = fontPairById(lineage.fontPair);
  const required = gestureById(lineage.gesture).requires;

  const elements: Record<string, unknown>[] = [
    {
      id: "eyebrow",
      component: "eyebrow-label",
      role: "support",
      whyHere: "names who this is for before the headline lands",
    },
    {
      id: "headline",
      component: "headline-block",
      role: "message",
      whyHere: "carries the single promise the flyer is making",
    },
    {
      id: "hero",
      component: (() => {
        // Pick a deterministic evidence component for this lineage so the
        // sheet reflects the available component diversity rather than one
        // hard-coded example. Prefer components listed by the art direction
        // when available.
        try {
          const rng = new Rng(lineage.candidateSeed);
          const art = artDirectionById(lineage.artDirection);
          const prefs = art.preferredComponents ?? [];
          const catalog = manifestsFor(lineage.topology)
            .filter((m: any) => m.roles.includes("evidence"))
            // Prefer components that accept image assets so the fixture can
            // display photos without needing extra props.
            .filter((m: any) => (m.assetSlots ?? 0) > 0)
            .map((m: any) => m.id);
          // Whitelist safe evidence components that work well in fixtures
          const SAFE_EVIDENCE = [
            "photo-hero",
            "polaroid-stack",
            "photo-cluster",
            "photo-grid",
            "torn-photo",
            "motif-collage",
            "browser-frame",
            "phone-frame",
            "document-card",
            "masked-image",
          ];
          const preferredPool = prefs.length ? prefs.filter((p) => catalog.includes(p)) : [];
          const poolSource = preferredPool.length ? preferredPool : catalog;
          const pool = poolSource.filter((id) => SAFE_EVIDENCE.includes(id));
          if (pool.length === 0) {
            // fallback: use any catalog item if whitelist missed; parser will
            // then validate and the sheet run may throw, but this is rare.
            pool.push(...poolSource);
          }
          return pool[rng.int(0, pool.length - 1)];
        } catch (e) {
          return "before-after-stack";
        }
      })(),
      role: "evidence",
      whyHere: "shows the résumé actually changing — without it the flyer only claims",
    },
    {
      id: "cta",
      component: "cta-button",
      role: "cta",
      whyHere: "the flyer has no purpose without the waitlist action",
    },
    {
      id: "brand",
      component: "footer-lockup",
      role: "brand",
      whyHere: "identifies who is speaking",
    },
  ];

  if (required && required !== "eyebrow-label") {
    elements.push(GESTURE_COMPONENTS[required]!);
  }

  return parseSpec({
    specVersion: "1.0",
    seed: lineage.candidateSeed,
    lineage,
    productName: "Vayami",
    idea: "A weak résumé bullet is visibly rewritten into a strong one, mid-flyer.",
    story: [
      "experience scattered across a page",
      "Vayami rewrites it line by line",
      "a résumé a recruiter can read",
      "join the waitlist",
    ],
    canvas: { ...CANVAS },
    brand: {
      colors: palette,
      fonts: { display: fonts.display, body: fonts.body, mono: fonts.mono ?? null },
    },
    copy: {
      eyebrow: "Résumés, read like recruiters read",
      headline: "Turn experience into opportunity",
      body: "Vayami rewrites your résumé the way recruiters actually read it, line by line.",
      cta: { label: "Join the waitlist", url: "https://vayami.ai/waitlist", qr: true },
    },
    elements,
    relationships: [
      {
        front: "hero",
        behind: "headline",
        overlap: 0.12,
        purpose: "message and proof share one space, so reading one shows the other",
      },
    ],
    gesture: {
      type: lineage.gesture,
      purpose: "marks the composition as a decision rather than a template",
    },
  });
}

export function fixtureSpecs(seed = "TESTSEED0001", count = 3): DesignSpec[] {
  return fixtureLineages(seed, count).map(fixtureSpec);
}
