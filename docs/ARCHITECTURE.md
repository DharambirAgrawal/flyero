# Flyero — Architecture

*How the system produces human-like, always-different flyers. The user never sees any of this — see `OUTPUT-FIRST.md` for why that's the point.*

Status: **v0.1 — pre-code planning.** Diagrams for every flow are in [`FLOWCHARTS.md`](./FLOWCHARTS.md).

---

## 1. Principles (non-negotiable)

1. **Output-first.** Every architectural choice is justified by its effect on the flyer. No subsystem exists because it's interesting.
2. **The LLM never places pixels.** The LLM decides *meaning* — idea, story, hierarchy, copy, relationships. A deterministic engine computes *geometry* — coordinates, wrapping, font sizes, collision, contrast. LLMs are unreliable at spatial math; code is perfect at it. This split is the reason output is professional.
3. **Diversity by construction, not memory.** Each run samples a random "designer" from curated creative dimensions (§4). Ten runs = ten designers. No history lookup.
4. **Deterministic rendering.** `spec.json` is the single source of truth. Same spec → identical pixels, forever. Everything downstream (revision, export, future formats) depends on this.
5. **API-first.** The core is a service with a REST API. MCP, CLI, and any future web app are thin adapters. Nothing may exist only in an adapter.
6. **Never ship below the bar.** Gates (see `REQUIREMENTS.md` §4) are enforced in code at the end of the pipeline. A failing flyer is discarded or honestly flagged — never silently shipped.

## 2. System overview

```
                        ┌─────────────────────────────────────────────┐
   Surfaces             │              FLYERO CORE (one service)      │
                        │                                             │
  REST API ───────────▶ │  1. Brief Builder      (LLM)                │
  MCP server ─────────▶ │  2. Studio Sampler     (seeded, no LLM)     │
  (thin adapters,       │  3. Idea Engine        (LLM, lineage-bound) │
   same core calls)     │  4. Composer           (LLM → spec JSON)    │
                        │  5. Layout Solver      (pure code)          │
                        │  6. Renderer           (React→SVG→PNG)      │
                        │  7. Critic             (rules + vision LLM) │
                        │  8. Reviser            (LLM edits spec)     │
                        │  9. Gatekeeper         (pure code + vision) │
                        │ 10. Exporter           (SVG/PNG; PDF later) │
                        │                                             │
                        │  Component Library ─ Creative Libraries     │
                        │  Job store (SQLite→Postgres) ─ Object store │
                        └─────────────────────────────────────────────┘
```

One process in v1 (a Node.js service). Stages are internal modules with typed interfaces so they can become separate workers later without redesign.

## 3. Pipeline stages

### Stage 1 — Brief Builder (LLM)
Turns the raw prompt + assets into a structured campaign brief: product, audience, objective, CTA, facts vs. assumptions vs. placeholders. Enforces FR-4 (no invented claims) by labeling every statement's source. Inspects uploaded assets (dimensions, type, recommended roles, crop-safety, extracted palette).

### Stage 2 — Studio Sampler (seeded randomness, zero LLM) — *the diversity mechanism*
See §4. From one job seed, samples **`LINEAGES_PER_RUN` lineages** (default 3), each forced into a **different metaphor family**, so the internal competition compares ideas — not recolors. Each lineage constrains that candidate's downstream stages.

### Stage 3 — Idea Engine (LLM, bound by lineage)
Produces the **one-sentence creative idea** (Gate G1) *within* the sampled lineage. Given metaphor family "transformation" it might produce "a weak bullet point visibly rewritten into a strong one, mid-flyer." Given "signal-detection" for the same brief: "one glowing line of the résumé stands out from grayed-out noise." The idea must make the product's benefit *visible*, not stated. It also names the **story** the viewer should read: problem → product acting → payoff → CTA. Marketing is narrative; the idea stage is where the narrative is chosen.

### Stage 4 — Composer (LLM → validated spec)
Translates the idea into a **Design Spec** (§5): which components, in which roles, with which relationships (in front of / behind / annotates / points-to / crops-at-edge), plus final copy. Output is validated against the zod schema; invalid specs are rejected and retried. The composer chooses only from the Component Library — it cannot invent raw shapes.

### Stage 5 — Layout Solver (pure TypeScript, no LLM)
Converts semantic relationships into exact geometry: grid, coordinates, font sizes, line wrapping, overlap masks (with readable-character preservation), collision resolution, safe margins, contrast-aware color assignment. This is where "headline passes behind the résumé" becomes actual numbers. Deterministic given a spec + seed.

### Stage 6 — Renderer (React → SVG → PNG)
React components render the spec to SVG server-side; `resvg`/Playwright rasterizes to PNG for critique and delivery. Text stays `<text>`, groups are named. Deterministic.

### Stage 7 — Critic (two-layer)
- **Rule critic (code):** overflow, contrast (WCAG-AA), margins, CTA presence, element count, banned-list detection, asset usage. Cheap, exact, runs first.
- **Vision critic (multimodal LLM on the rendered PNG):** judges only what code can't — hierarchy clarity, whether the idea reads, collisions the rules missed, "does this look like a title slide?" Returns *specific structured fixes* (element, problem, action), never vague scores.

### Stage 8 — Reviser (LLM edits spec)
Applies the critic's fixes as **spec edits** (never re-generation), then loops back to Stage 5. Hard cap: `MAX_REVISION_LOOPS` (default 3). Also serves user-facing revision requests (FR-3).

### Stage 9 — Gatekeeper (final judgment)
Runs the Six Gates + mechanical checks on the finished candidate. The run produces `LINEAGES_PER_RUN` (default 3) candidates in parallel. Among passers, a comparative jury (`src/core/select/`) picks the most authored candidate rather than the safest score; if vision budget is exhausted, a deterministic least-revised fallback is used. Losers stay in the process log. If none pass: optionally sample a fresh lineage set once (`MAX_OUTER_RESTARTS`, default 1) and retry stages 3–8 on the restart set; if still nothing passes, return honestly with `below_bar: true`.

### Stage 10 — Exporter
PNG (delivery), SVG (editable), `spec.json` + `idea` sentence. PDF is post-v1 (`501` on the API until then). Future formats (story, A4, deck, motion) are new compile targets for the **same spec** — this is the entire scalability story.

## 4. The Studio Sampler — human variance by construction

**The problem:** 10 sessions, same prompt, no shared memory → outputs must differ like 10 human designers' work differs.

**The insight:** humans differ *before they start* — each designer arrives with their own instincts. So Flyero re-rolls its instincts per run. At job start, a cryptographically random **job seed** is generated. From that seed the sampler produces `LINEAGES_PER_RUN` (default 3) lineages for internal competition — each lineage samples one value from every curated **creative dimension**, with metaphor families forced unique across the three:

| Dimension | Size (v1) | Examples |
|---|---|---|
| Metaphor family | 12 | transformation, signal-from-noise, before/after fold, annotation/editorial, cartography, magnification, assembly/compile, conversation, constellation, lens, threshold/door, growth |
| Composition topology | 10 | diagonal progression, split editorial, radial field, oversized-anchor, layered depth stack, zigzag path, off-center hero, framed evidence, vertical narrative, asymmetric two-column |
| Typography behavior | 8 | compressed-monumental, editorial-annotated, woven-through-image, technical-mono-accents, quiet-with-one-loud-word, stacked-contrast, masked-by-subject, baseline-broken |
| Material language | 6 | technical-paper, optical-diagnostic, printed-halftone, soft-industrial, ink-on-cream, chromatic-glass *(used sparingly)* |
| Color logic | 8 generators | not fixed palettes — rules like "one saturated accent on actionable elements only, everything else near-neutral" |
| Signature gesture family | 10 | element-escapes-canvas, path-becomes-CTA-underline, headline-behind-subject, one-rotated-element, intentional-crop-of-hero, oversized-letterform-as-structure, … |

That is **12 × 10 × 8 × 6 × 8 × 10 ≈ 460,000 structurally distinct designer profiles** — before the Idea Engine adds its own variation *inside* the lineage. Collision probability across 10 independent *jobs* (each shipping one winner) is near zero **by math, not by memory**. Every individual dimension value is hand-curated and professional, so any combination is viable — this is why structured sampling beats temperature noise (DR-3).

A compatibility matrix (small, hand-written) vetoes the few genuinely bad pairings (e.g., `radial-field` × `editorial-annotated`) and re-rolls that lineage.

`risk` level (`safe`/`studio`/`experimental`) controls how far from the most conventional value each dimension may sample. Sampling happens **inside an art direction** (`src/creative/artdirections.ts`): a coherent family of metaphor/topology/type/material/colour/gesture/graphics values filtered by brief archetype. Independent dimension rolls that produce contradictory "designers" are out of v1.

**Within one job:** 3 lineages run **in parallel** through stages 3–8. Gatekeeper (stage 9) picks among passers comparatively. Independent sessions (DR-1) each get a fresh job seed — that is how ten same-prompt sessions diverge. Live precheck: `npm run diversity`.

**Optional later (not v1):** project-level memory that stores lineage fingerprints so a *returning* user's flyers stay fresh across a campaign. This is an enhancement for a paying feature — never the creativity mechanism.

## 5. The Design Spec (source of truth)

Versioned JSON, zod-validated, stored per candidate. Shape (abbreviated):

```jsonc
{
  "specVersion": "1.0",
  "seed": "01JX…",                        // makes layout deterministic
  "lineage": { "metaphor": "assembly", "topology": "diagonal-progression", "...": "..." },
  "idea": "Scattered experience fragments visibly compile into one strong résumé.",
  "story": ["scattered fragments", "Vayami acting", "resolved résumé", "waitlist CTA"],
  "canvas": { "w": 1080, "h": 1350, "safe": 64 },
  "brand": { "colors": {"...": "..."}, "fonts": ["Fraunces", "Inter"] },
  "copy": { "eyebrow": "…", "headline": "…", "body": "…", "cta": {"label": "…", "url": "…", "qr": true} },
  "elements": [
    { "id": "hero", "component": "document-before-after-stack", "role": "evidence",
      "whyHere": "shows the product working (Gate G2/G3)", "assets": ["ast_01JX3…"] },
    { "id": "headline", "component": "headline-block", "role": "message" }
  ],
  "relationships": [
    { "front": "hero", "behind": "headline", "overlap": 0.15, "purpose": "integrate message with product" }
  ],
  "gesture": { "type": "path-becomes-cta-underline", "purpose": "story terminates at the CTA" }
}
```

Notes: every element carries `whyHere` (feeds Gate G3's delete test); relationships carry `purpose` (unjustified overlap = decoration = rejected); **no coordinates** — geometry belongs to the Layout Solver's output artifact, not the spec.

## 6. Component Library (v1 scope)

~25 hand-designed React/SVG components, each with a manifest: what it's for, min/max size, text limits, compatible topologies, asset slots, and its motion affordance (recorded now, used when video comes). Categories: content (headline block, eyebrow, body, benefit list, CTA + QR, footer lockup) · evidence (browser/phone frame, document card, before/after stack, score ring, annotation label, UI fragment) · structure (grid field, path/connector, oversized letterform, mask shapes, edge-crop frames). Quality bar: each component must look professional *alone* on a canvas. This library is hand-authored design work — it is the moat, and it grows deliberately, not automatically.

## 7. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language/runtime | TypeScript + Node.js 22 | Entire rendering ecosystem (React, SVG, Remotion later, MCP SDK) is TS-native |
| API server | Fastify | Fast, typed, minimal |
| Validation | zod | Spec schema is law; shared between API, composer, and renderer |
| Rendering | React 18 `renderToStaticMarkup` → SVG; `@resvg/resvg-js` → PNG | Deterministic, fast, no browser needed for v1 (Playwright as fallback for complex filters) |
| Planning/copy/revision LLM | Claude (Anthropic API) | Best instruction-following for structured creative work |
| Vision critic | Claude (multimodal) on rendered PNG | Same vendor first; abstract behind an interface so it's swappable |
| Job store | SQLite (better-sqlite3) → Postgres when needed | Zero-ops start; schema written to survive the migration |
| Object store | Local filesystem `STORAGE_DIR` → S3-compatible later | Same reason |
| Queue | In-process async job runner (v1) → BullMQ when scaling | One box is fine at prototype volume |
| MCP | `@modelcontextprotocol/sdk`, stdio + streamable HTTP | Thin adapter over the REST core |
| QR codes | `qrcode` (SVG output) | Flyers need scannable CTAs |

**Deliberately NOT in v1:** vector DB, graph DB, embeddings, MAP-Elites/QD search, cross-session memory, Python workers, microservices, image-generation models. Each has a trigger condition in `ROADMAP.md` — none is needed to pass the v1 acceptance tests.

## 8. Repository layout (planned)

```
flyero/
├── docs/                     # this documentation suite
├── src/
│   ├── api/                  # Fastify routes, auth, job endpoints (API.md)
│   ├── mcp/                  # MCP server — adapters only, no logic
│   ├── core/
│   │   ├── brief/            # Stage 1
│   │   ├── studio/           # Stage 2: dimensions data + sampler + compatibility matrix
│   │   ├── idea/             # Stage 3
│   │   ├── compose/          # Stage 4 + spec schema (zod)
│   │   ├── layout/           # Stage 5: the solver (pure functions, heavily unit-tested)
│   │   ├── render/           # Stage 6: React components + SVG/PNG pipeline
│   │   ├── critic/           # Stage 7: rule checks + vision critic
│   │   ├── revise/           # Stage 8
│   │   ├── gates/            # Stage 9: six gates + banned-list detector
│   │   └── export/           # Stage 10
│   ├── components/           # the Component Library (each with manifest.json)
│   ├── creative/             # metaphors.ts, topologies.ts, typebehaviors.ts, materials.ts,
│   │                         # colorlogic.ts, gestures.ts, banned.ts, fontpairs.ts
│   ├── llm/                  # provider abstraction (chat + vision), prompt files, cost logging
│   └── store/                # SQLite job store + filesystem object store
├── test/
│   ├── unit/                 # layout solver, gates, sampler distribution tests
│   ├── golden/               # spec → SVG snapshot tests (determinism guarantee)
│   └── acceptance/           # the 5 acceptance tests from REQUIREMENTS.md §7
├── .env.example
├── CHANGELOG.md
└── AGENTS.md                 # working rules for coding agents
```

## 9. Key risks and their mitigations

| Risk | Mitigation |
|---|---|
| Vision critic rewards generic polish | Rules handle everything objective; vision critic is asked *only* targeted questions ("does the idea read?", "what collides?") and must return element-level fixes, not scores. Banned-list runs in code. |
| Composer produces valid-but-boring specs | It composes *inside* a sampled lineage — the boring option isn't in its choice set. Internal 3-candidate competition picks the strongest idea. |
| Layout solver becomes a research project | v1 solver is constraint *application*, not constraint *solving*: each topology ships with a parameterized grid + placement recipe; the solver fits content into the recipe. General optimization comes only if recipes prove insufficient. |
| Cost blowup | Per-job cost logging from day one; caps on candidates and revision loops; cheap model for the rule-adjacent critique pass. |
| Component library too small → visible repetition | Repetition of *components* is fine (humans reuse buttons too); repetition of *ideas/structure* is what DR-1 measures. Grow the library only when gate/diversity tests point at a concrete hole. |
