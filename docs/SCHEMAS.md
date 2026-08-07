# Flyero — Data Contracts

*Typed shapes every stage must speak. Implement these as zod schemas in code (`src/core/compose/spec.ts`, etc.). If a field isn't here, don't invent it in production code without updating this file.*

Status: **v0.1 — pre-code planning.** Companion: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`API.md`](./API.md)

---

## 1. Job statuses

```ts
type JobStatus =
  | "queued"
  | "generating"   // stages 1–9 in progress; include `stage` field
  | "done"         // passed all gates
  | "below_bar"    // finished, nothing passed gates; best candidate attached
  | "failed";      // hard error (timeout, LLM outage, invalid input)

type PipelineStage =
  | "brief" | "sample" | "idea" | "compose" | "layout"
  | "render" | "critique" | "revise" | "gates" | "export";
```

## 2. Brief (Stage 1 output)

```ts
type Brief = {
  /** Communication shape — drives sampler art-direction filtering and story framing. */
  archetype:
    | "product-promotion"
    | "event-invitation"
    | "awareness-education"
    | "editorial-announcement"
    | "offer-promotion";
  product: { name: string; category: string; knownBenefits: string[] };
  campaign: {
    objective: string;
    cta: { label: string; url: string | null };
  };
  audience: { assumed: string; confidence: number }; // 0–1
  statements: Array<{
    text: string;
    source: "user" | "assumption" | "placeholder"; // FR-4: never invent as "user"
  }>;
  assets: Array<{
    assetId: string;
    kind: "logo" | "screenshot" | "reference";
    recommendedRoles: string[];
    cropSafety: { left: number; right: number; top: number; bottom: number };
    palette: string[];
  }>;
  constraints: {
    allTextEditable: true;
    avoidGenericTechAesthetic: true;
    useUploadedAssets: boolean;
  };
};
```

**Reference images (v1):** stored and palettes/roles extracted. They do **not** drive a full structural copy pipeline in v1 (that is later). Composer may use `recommendedRoles` + palette as soft hints only.

## 3. Lineage (Stage 2 output — one per candidate)

```ts
type Lineage = {
  jobSeed: string;          // shared across candidates in one job
  candidateSeed: string;    // unique per candidate
  /** Coherent studio position; dimensions are sampled inside this family. */
  artDirection: ArtDirectionId;
  metaphor: MetaphorId;     // 12 values — see ARCHITECTURE §4
  topology: TopologyId;     // includes composition-grammar topologies
  typography: TypographyId; // 8 values
  material: MaterialId;     // 6 values
  colorLogic: ColorLogicId; // 10 values
  gesture: GestureId;       // 10 values
  graphics: GraphicsId;     // graphic language, 10 values (defaulted on older stored specs)
  risk: "safe" | "studio" | "experimental";
  readingPath: ReadingPath; // DERIVED from topology (not sampled independently)
  fontPair: string;         // curated pair id
};

type ReadingPath =
  | "left-to-right"
  | "top-to-bottom"
  | "diagonal"
  | "zigzag"
  | "radial"
  | "center-out"
  | "edge-in";
```

### Topology → readingPath map (locked)

| Topology | readingPath |
|---|---|
| diagonal-progression | diagonal |
| split-editorial | left-to-right |
| radial-field | radial |
| oversized-anchor | center-out |
| layered-depth-stack | edge-in |
| zigzag-path | zigzag |
| off-center-hero | left-to-right |
| framed-evidence | center-out |
| vertical-narrative | top-to-bottom |
| asymmetric-two-column | left-to-right |
| banded-masthead | top-to-bottom |
| type-poster | top-to-bottom |
| section-stack | top-to-bottom |
| framed-centre | top-to-bottom |

DR-1 "reading path differs" is measured via this derived field.

## 4. Design Spec (Stage 4 output — source of truth)

No coordinates. Geometry lives in LayoutResult (§5).

```ts
type DesignSpec = {
  specVersion: "1.0";
  seed: string;                 // candidateSeed — layout determinism key
  lineage: Lineage;
  productName: string;
  campaignArchetype: Brief["archetype"]; // defaults to product-promotion
  idea: string;                 // one sentence (Gate G1)
  story: [string, string, string, string]; // problem → acting → payoff → CTA
  canvas: { w: number; h: number; safe: number }; // must match a Format in src/creative/formats.ts (portrait-4x5 1080x1350 safe:64 / square-1x1 1080x1080 safe:56 / story-9x16 1080x1920 safe:72)
  brand: {
    colors: { bg: string; fg: string; accent: string; accent2: string; muted: string }; // accent2 added 2026-08-05: a hue-related second accent, for multi-colour clusters — never the only accent anything is required to use
    fonts: { display: string; body: string; mono?: string | null }; // font pairs may also carry an optional accent/accentWeight (script/handwritten register) — see src/creative/fontpairs.ts
  };
  /** Exact user-supplied statements retained so Gate G6 can verify without the Brief. */
  provenance: { userStatements: string[] };
  copy: {
    eyebrow: string | null;
    headline: string;
    body: string | null;
    details?: Array<{ label: string; value: string }>; // event/offer facts
    cta: { label: string; url: string | null; qr: boolean };
  };
  elements: SpecElement[];
  relationships: SpecRelationship[];
  gesture: { type: GestureId; purpose: string };
};

type SpecElement = {
  id: string;
  component: ComponentId;       // must exist in Component Library
  role: "evidence" | "message" | "support" | "cta" | "brand" | "structure";
  whyHere: string;              // Gate G3 delete test
  assets?: string[];            // assetIds
  props?: Record<string, unknown>; // component-specific, schema-validated per component
};

type SpecRelationship = {
  front: string;                // element id
  behind: string;
  overlap?: number;             // 0–1
  purpose: string;              // unjustified → reject as decoration
};
```

**Component IDs are generic** (e.g. `document-before-after-stack`, `browser-frame`, `headline-block`) — never product-specific names like `resume-transform-stack`.

## 5. LayoutResult (Stage 5 output)

```ts
type LayoutResult = {
  seed: string;
  boxes: Record<string, {
    x: number; y: number; w: number; h: number;
    zIndex: number;
    fontSize?: number;
    lines?: string[];           // wrapped text lines
  }>;
  masks?: Array<{ elementId: string; path: string; maxOcclusionRatio: number }>;
};
```

## 6. CriticFix (Stage 7 output)

```ts
type CriticFix = {
  source: "rule" | "vision";
  severity: "high" | "medium" | "low";
  elementId: string | null;
  problem: string;
  action: string;               // concrete: "reduce headline width 12%", not "make better"
};
```

## 7. GateResult (Stage 9)

```ts
type GateResult = {
  passed: boolean;
  detail: Record<"G1"|"G2"|"G3"|"G4"|"G5"|"G6", boolean>;
  mechanical: {
    overflow: boolean; contrast: boolean; margins: boolean;
    ctaPresent: boolean; assetsUsedOrReported: boolean; bannedListClear: boolean;
    coverage: boolean; noCollisions: boolean; componentGeometry: boolean;
  };
  notes: string[];
};
```

### How each gate is evaluated (so agents don't invent)

| Gate | Automated how |
|---|---|
| G1 | Spec has non-empty `idea` ≤ 140 chars; vision critic answers "does this idea read in the image?" = yes |
| G2 | Code builds a masked critique crop (`maskForCoverTest`: sharp overlay over logo + headline boxes); vision asked if product category is still guessable from what remains |
| G3 | `elements.length` in 4–7; every element has non-empty `whyHere` |
| G4 | Spec has a relationship or gesture involving the headline element, OR typography behavior ∈ participating set; vision confirms type isn't a floating label |
| G5 | Exactly one `gesture` present with `purpose`; layout applies exactly one gesture family |
| G6 | Slogan ban-list regex; invented-stat heuristics; every `copy.details` value and every numeric claim must appear in `provenance.userStatements` (copied from Brief `source:user`); vision/copy check for hollow slogans |

### `mechanical.coverage`

Not one of the Six Gates — a floor under all of them. A grid over the canvas
(`src/core/canvas/coverage.ts`, 60px cells) marks a cell covered if any
element box or decoration bbox touches it; `coverage` = covered cells /
total cells, ground excluded (same "ground is exempt" convention as
`decor/budget.ts`'s `MAX_INK_COVERAGE`, which caps decoration ink from
above — this is the floor under everything, not decoration-specific).
Fails below `MIN_COVERAGE` (0.32, calibrated against 40 fixture-sampled
designers — see the constant's own comment for the numbers). Catches a
flyer that clears G3's 4–7 element count and every colour check while
still reading as an empty page with a headline on it.

### `mechanical.noCollisions`

`false` whenever the vision verdict's `collisions` array (§ visionVerdictSchema)
is non-empty. A collision is a defect the reviewer has *seen*, not a
hypothesis a later check might overrule — it must at minimum force a
revision. Previously only reached `notes`, so a verdict listing collisions
could still return `status: done`.

### `mechanical.componentGeometry`

A deterministic, code-only check for defects that live *inside* one
component's own render logic rather than in `spec.elements`/`layout.boxes`
geometry the other checks reason about — invisible to everything except a
vision call. Currently checks `detail-cluster`: its "column"/"grid"
arrangements recompute `detailClusterRowHeight` (`components/photo.tsx`,
the same formula `render` uses) from the real box a spec+layout ended up
with, and fail if a row doesn't have enough height for its label+value
pair — the exact shape of a real bug (rows overlapping once a box held more
facts than it was sized for) that only a vision call had caught before,
and that an agent could — and did, on a live flyer — decide to ship past.

## 8. Banned-list detector (code heuristics)

Score +1 for each hit; ≥2 → fail `bannedListClear`:

| Signal | How detected |
|---|---|
| navy+cyan/purple glow | bg near `#0a1628`–`#0B1B2B` AND accent in cyan/purple hue band AND glow/blur structure component present |
| fully-centered single cluster | all content boxes within center 40% both axes |
| three equal feature cards | ≥3 elements with same component id and equal width ±5% |
| glassmorphism panel | component tag `glass-panel` or blur+translucent fill combo |
| generic 3D orb | component id `orb` / `glow-orb` |
| meaningless grid/noise | structure component with `whyHere` matching /decor|atmospher|fill/i and no relationship |
| pill CTA as only event | CTA is only element with accent color AND no evidence-role element |

## 9. Topology recipe (Milestone 1 artifact)

Each topology file exports:

```ts
type TopologyRecipe = {
  id: TopologyId;
  readingPath: ReadingPath;
  columns?: number[];           // fractional widths, e.g. [0.44, 0.56]
  regions: Record<string, { x: number; y: number; w: number; h: number }>; // normalized 0–1
  allowedRoles: SpecElement["role"][];
  notes: string;
};
```

Layout Solver **fits** content into the recipe (constraint application), it does not invent a new grid.

## 10. Cost budget (realistic v1)

With `LINEAGES_PER_RUN=3` and `MAX_REVISION_LOOPS=3`, worst-case LLM usage is high. Operating rules:

1. Run the 3 candidates **in parallel**.
2. Vision critic only after rule critic passes (skip vision on rule-failing candidates when possible).
3. Cap total vision calls per job at **6** (env `MAX_VISION_CALLS_PER_JOB=6`) — prefer early stop when one candidate already gate-passes.
4. Target ≤ $1.50 is a **shipped-flyer average**, not a worst-case hard fail. Log `cost.usd`; warn at `COST_ALERT_USD_PER_FLYER`. If rolling average over 20 jobs exceeds $1.50, reduce lineages or revision loops before adding features.

Add to `.env.example`: `MAX_VISION_CALLS_PER_JOB=6`.

## 11. Webhook payload (when `callbackUrl` set)

```ts
type WebhookPayload = {
  jobId: string;
  status: "done" | "below_bar" | "failed";
  idea?: string;
  urls?: { png: string; svg: string; spec: string };
  signature: string; // HMAC-SHA256 of body with WEBHOOK_SIGNING_SECRET
};
```
