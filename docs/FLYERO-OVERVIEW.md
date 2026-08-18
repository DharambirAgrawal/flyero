# Flyero — How It Works

*A working reference for brainstorming. Written from the actual code as of 2026-08-18, not just the planning docs — where the two disagree, this follows the code and flags the gap.*

---

## 1. What the product is, in one paragraph

One prompt (+ optional logo/photo) → one 1080×1350 Instagram-portrait marketing flyer that looks
human-designed, not AI-generated. A job returns `status: "done"` **only** if it passes all Six
Gates; otherwise it returns an honest `status: "below_bar"` with the best failing candidate
attached, and it never pretends otherwise. Nothing is "good enough" by default — the system is
built to refuse its own output.

The whole architecture exists to serve one split: **the LLM decides meaning, code decides
geometry.** An LLM chooses the idea, the story, which components, what they mean to each other,
and the copy. It never receives or emits an x/y coordinate. A deterministic TypeScript layout
solver turns those semantic choices into exact pixels. This split is why the output looks designed
rather than "vibes prompted" — LLMs are unreliable at spatial math, code is exact at it.

---

## 2. The two ways a flyer gets made

There are **two entry points into composition**, and they converge on the same downstream engine
(layout solver → renderer → gates → export). This matters for brainstorming because most future
work touches one path, not both.

### Path A — the full LLM pipeline (`POST /v1/flyers`)
Flyero's own server calls Claude at every LLM-shaped stage (brief, idea, compose, revise, vision
critique). Requires `ANTHROPIC_API_KEY` server-side. This is the "hand Flyero a prompt and walk
away" path — `create_flyer` in MCP, or the REST endpoint directly.

### Path B — the agent-native path (`src/api/agent.ts`, `guide.ts`, `skills.ts`)
An external agent (typically Claude running *as* the calling assistant, e.g. via MCP) does the
creative thinking itself: it samples its own lineage, picks components straight out of the visible
Component Library, and submits a fully authored spec. `assembleSpec`
(`src/core/compose/assemble.ts`) turns that into a validated `DesignSpec`, which then hits the
*exact same* layout/render/gate pipeline as Path A. No server-side model key is required for this
path — the calling agent supplies the intelligence, Flyero supplies geometry, taste constraints,
and judgment.

`skills.ts` **deliberately ships no colour/font/measurement advice** on this path — if it did, it
would defeat the Studio Sampler's diversity-by-construction mechanism (law 2, below). The agent is
guided toward *unfamiliar structural choices*, never toward a "correct" palette.

This is why `docs/ROADMAP.md` calls Milestone 6 (MCP surface) "substantially built already, pulled
forward ahead of Milestone 3" — real agent sessions needed this surface to exist before diversity
tuning could even be evaluated against live traffic.

---

## 3. The ten laws (from `AGENTS.md` — violating one means the change is wrong)

1. **The LLM never places pixels.** All geometry lives in `src/core/layout/`.
2. **Diversity comes from the Studio Sampler**, never from history, dedup stores, or temperature
   bumps. Fix diversity problems in `src/creative/` data or the sampler, never by remembering past
   outputs.
3. **Deterministic rendering.** Same `spec.json` + seed → byte-identical SVG, forever. Golden
   snapshot tests (`test/golden/`) guard this; they may not be weakened.
4. **Gates are law.** Never return `done` for a flyer that fails a gate; never soften a gate to
   make a test pass.
5. **No invented facts** — no stats, testimonials, or claims the user didn't supply. Enforced in
   the brief builder, checked again in Gate G6 (and in every component prop, not just `copy`).
6. **API-first.** Every capability is a REST endpoint first; `src/mcp/` is schemas + HTTP calls,
   never business logic.
7. **No scope creep.** Roadmap's "Later phases" each have an explicit trigger; nothing gets built
   before its trigger fires, "just to prepare" included.
8. **Text stays text** in exported SVG. No outlined/rasterized text, groups are named.
9. Every LLM call goes through `src/llm/` so per-job cost logging works.
10. The per-job process log (brief, lineages, specs, critiques, gate results) is a training asset —
    never deleted, never skipped.

---

## 4. The ten pipeline stages

```
prompt + assets
      │
      ▼
┌─────────────────┐   1. Brief Builder (LLM)          — src/core/brief/
│  structured      │   prompt+assets → product/audience/objective/CTA,
│  campaign brief  │   every statement tagged user | assumption | placeholder
└─────────────────┘
      │
      ▼
┌─────────────────┐   2. Studio Sampler (seeded, ZERO LLM)  — src/core/studio/sampler.ts
│  N lineages      │   1 job seed → LINEAGES_PER_RUN (3) "designers", metaphor
│  (parallel)      │   family forced unique across the set — THE diversity mechanism
└─────────────────┘
      │  (fan out — everything below runs 3× in parallel per job)
      ▼
┌─────────────────┐   3. Idea Engine (LLM, bound by lineage)  — src/core/idea/
│  one-sentence    │   "the résumé's weakest bullet is visibly rewritten stronger,
│  idea + 4-beat   │   mid-flyer" — the idea must make the benefit VISIBLE, plus the
│  story           │   4-beat story: problem → product acting → payoff → CTA
└─────────────────┘
      │
      ▼
┌─────────────────┐   4. Composer (LLM → zod-validated DesignSpec)  — src/core/compose/
│  DesignSpec      │   components + roles + relationships + copy, chosen ONLY from
│  (JSON)          │   the Component Library, retried on schema failure
└─────────────────┘
      │
      ▼
┌─────────────────┐   5. Layout Solver (pure TS, deterministic)  — src/core/layout/solver.ts
│  LayoutResult    │   spec + seed → exact geometry: grid, coordinates, font sizes,
│  (boxes, tone)   │   wrap, overlaps, collisions, safe margins, contrast-aware colour
└─────────────────┘
      │
      ▼
┌─────────────────┐   6. Renderer (React → SVG → PNG)  — src/core/render/
│  SVG + PNG       │   renderToStaticMarkup → SVG (text stays <text>) → resvg PNG.
└─────────────────┘   Deterministic given the same spec.
      │
      ▼
┌─────────────────┐   7. Critic (two-layer)  — src/core/critic/
│  CriticFix[]     │   rule critic (code: overflow/contrast/margins/banned-list) first,
│                  │   cheap and exact; vision critic (multimodal LLM on the PNG) only
│                  │   if rules already pass — judges hierarchy/collisions/"does it read"
└─────────────────┘
      │
      ▼
┌─────────────────┐   8. Reviser (LLM edits spec)  — src/core/revise/
│  spec edits,     │   applies fixes as EDITS (never regeneration), loops back to
│  looped          │   stage 5. Capped at MAX_REVISION_LOOPS (3).
└─────────────────┘
      │  (loop 5→6→7→8 until no fixes or cap hit)
      ▼
┌─────────────────┐   9. Gatekeeper (pure code + optional vision verdict) — src/core/gates/
│  GateResult per  │   Six Gates + 9 mechanical checks per candidate. Among candidates
│  candidate;      │   that pass, src/core/select/ (a comparative jury) picks the most
│  1 winner        │   AUTHORED one, not the safest score. If none pass: one bounded
│                  │   restart (fresh lineage set) — never an unbounded search.
└─────────────────┘
      │
      ▼
┌─────────────────┐   10. Exporter — src/core/export/
│  PNG + SVG +     │   PNG for delivery, SVG editable (named groups, real text),
│  spec.json       │   spec.json + idea sentence. PDF is 501 until built.
└─────────────────┘
```

**Concurrency shape** (`src/core/pipeline.ts::runJob`): all 3 lineages' stages 3–8 run via
`Promise.allSettled` in parallel — sequential would blow the 3-minute/cost budget. A shared
`VisionBudget` object caps total vision-model calls across the whole job (revision-loop critique +
final gate verdict + jury selection all draw from the same pool), so cost stays bounded regardless
of how many candidates need extra passes.

---

## 5. The Studio Sampler — the actual diversity mechanism (`src/core/studio/sampler.ts`)

**The problem it solves:** ten sessions, same prompt, no shared memory between them — yet outputs
must differ the way ten different human designers' work differs, not the way one designer's
outputs differ when you ask for "another version."

**The mechanism:** humans differ *before they start work* — each arrives with instincts, a taste,
a habitual move. So Flyero re-rolls its instincts once per job, from a cryptographically random
**job seed** (`ulid()`), rather than trying to remember what it made last time.

Seven curated creative dimensions live in `src/creative/`, each hand-authored data, not generated:

| Dimension | File | What it controls |
|---|---|---|
| Metaphor family | `metaphors.ts` | The idea's shape: transformation, signal-from-noise, before/after, annotation, cartography, magnification, assembly, conversation, constellation, lens, threshold, growth |
| Composition topology | `topologies.ts` | The grid/placement recipe: diagonal progression, split editorial, radial field, oversized-anchor, layered-depth-stack, zigzag, off-center-hero, framed-evidence, vertical-narrative, asymmetric-two-column, banded-masthead, type-poster, section-stack, framed-centre |
| Typography behaviour | `typebehaviors.ts` | compressed-monumental, editorial-annotated, woven-through-image, technical-mono-accents, quiet-with-one-loud-word, stacked-contrast, masked-by-subject, baseline-broken |
| Material language | `materials.ts` | technical-paper, optical-diagnostic, printed-halftone, soft-industrial, ink-on-cream, chromatic-glass |
| Colour logic | `colorlogic.ts` | *rules*, not fixed palettes — e.g. "one saturated accent on actionable elements only, everything else near-neutral" |
| Signature gesture | `gestures.ts` | element-escapes-canvas, path-becomes-CTA-underline, headline-behind-subject, one-rotated-element, intentional-crop, oversized-letterform-as-structure, … |
| Graphic language | `graphics.ts` | editorial-restraint, swiss-grid, organic-blobs, retro-stripes, halftone-pop, paper-collage, dashed-cartography, botanical-frame, sticker-sheet, geometric-memphis |

Sampling is **not** a free Cartesian product across all seven. It happens *inside* one of ~10
**art directions** (`src/creative/artdirections.ts`) — a coherent, hand-curated bundle of
metaphor/topology/type/material/colour/gesture/graphics values, filtered by the brief's campaign
archetype. This is what stops the sampler from combining seven individually-reasonable dimensions
into one contradictory "designer" (e.g. `radial-field` topology with `editorial-annotated`
typography). `PROFILE_SPACE` — the count of structurally distinct designer profiles reachable this
way — is computed live from the art-direction data (currently on the order of tens of thousands;
the CHANGELOG's headline figures have moved as the dimension sets grew, so read
`test/unit/sampler.test.ts` for the exact live number rather than trusting any single historical
figure).

A small hand-written **compatibility veto matrix** (`compatibility.ts`) additionally re-rolls the
few genuinely bad pairings that slip through art-direction gating. `risk` (`safe` / `studio` /
`experimental`) controls how far from the most conventional value each dimension is allowed to
sample.

**Per job:** one call to `sampleLineages()` draws `LINEAGES_PER_RUN` (3) lineages, with **metaphor
family forced unique** across the set — so the 3-candidate internal competition compares *ideas*,
not recolours of the same idea. **Per independent session:** a fresh job seed → this is the entire
mechanism behind DR-1 (the diversity requirement — 10 independent runs of the same prompt should
visibly read as different designers' work).

`evidence: "photographic"` is a hint the sampler accepts (set automatically in
`pipeline.ts` when assets exist, or passed explicitly by an agent) that steers topology sampling
toward layouts where a real photograph *is* the page — see §9, this was a direct fix for the
"looks like a document, not a poster" gap.

**What this explicitly is not, and never becomes:** a history lookup, a dedup store, a
temperature knob. Law 2. If diversity ever looks wrong, the fix is new dimension *data* or sampler
*logic*, never a memory of prior jobs.

---

## 6. The Design Spec — the one source of truth (`src/core/compose/spec.ts`)

A versioned, zod-validated JSON object. **Contains no coordinates.** Every element must justify
itself and every relationship must justify its overlap — these aren't advisory, they're schema
fields the composer/agent is required to fill, and the gates read them back:

```jsonc
{
  "specVersion": "1.0",
  "seed": "...",
  "lineage": { "metaphor": "assembly", "topology": "diagonal-progression", "artDirection": "...",
               "typography": "...", "material": "...", "colorLogic": "...", "gesture": "...",
               "graphics": "...", "risk": "studio", "readingPath": "diagonal", "fontPair": "..." },
  "idea": "Scattered experience fragments visibly compile into one strong résumé.",   // Gate G1
  "story": ["scattered fragments", "product acting", "resolved result", "CTA"],       // 4 beats
  "canvas": { "w": 1080, "h": 1350, "safe": 64 },
  "brand": { "colors": {...}, "fonts": {...} },
  "provenance": { "userStatements": [...] },   // exact facts the user actually gave — Gate G6 checks against this, not the copy itself
  "copy": { "eyebrow": "...", "headline": "...", "body": "...", "cta": {...}, "details": [...] },
  "elements": [ { "id": "hero", "component": "before-after-stack", "role": "evidence",
                  "whyHere": "shows the product working (Gate G2/G3)", "assets": [...] }, ... ],  // 4–7, schema-enforced
  "relationships": [ { "front": "hero", "behind": "headline", "overlap": 0.15,
                        "purpose": "integrate message with product" } ],  // unjustified overlap = rejected
  "gesture": { "type": "path-becomes-cta-underline", "purpose": "story terminates at the CTA" }
}
```

Schema-enforced invariants worth knowing (all in `designSpecSchema`, `src/core/compose/spec.ts`):
exactly one `role: "evidence"`, one `role: "message"`, one `role: "cta"` element; 4–7 elements
total (Gate G3, hard-enforced, not just critiqued); every relationship's `front`/`behind` must be
real element ids and can't self-reference; `spec.gesture.type` must equal `spec.lineage.gesture`
(the composer can't quietly drop the sampled gesture); and if a gesture `requires` a specific
component (`gestureById(...).requires`), the spec must actually include an element using it — this
closes a real bug class where a gesture silently no-opped and G5 passed anyway.

---

## 7. Layout Solver & the canvas/light/tone model

### Layout Solver (`src/core/layout/solver.ts`, `recipes.ts`, `anchors.ts`)
Not a general constraint solver — deliberately **constraint *application*, not constraint
*solving***. Each of the ~14 topologies ships as a parameterized grid + placement recipe
(`recipes.ts`); the solver fits the spec's elements into that recipe: slot assignment → intrinsic
content-driven sizing → headline fit → clamped relationship overlaps → gesture application →
collision resolution → text safety → margin fill → image masks. This was a deliberate scope
decision (`ARCHITECTURE.md` §9 risk register) — general layout optimization is only worth building
if hand-authored recipes prove insufficient, which as of the last audit they haven't.

Same `spec + seed → identical LayoutResult`, always — this is what makes stage 6 (render)
byte-deterministic and what the golden tests in `test/golden/` guard.

### The depth/light/tone model (`src/core/canvas/{depth,light,tone}.ts`)
This is newer machinery than `ARCHITECTURE.md` §8's tree documents, and it's central to why later
output stopped looking "pasted." The header comment on `depth.ts` states the actual design
insight directly:

> `zIndex` answers "what covers what" and nothing else... Real scenes give four more cues at once,
> and the reason humans apply them intuitively is that they all follow from one number.

Every element carries a continuous `depth` in `0..1` (0 = far wall, 1 = lens; `FOCAL_DEPTH = 0.62`
is the sharp plane). **Scale, blur, colour-haze, and contrast are all *derived* from that one
number** (`depthEffects()`), never styled independently per element — because per-element styling
is exactly how you get "something blurred but still saturated," which the eye reads as pasted-in
without being able to articulate why.

`tone.ts` (referenced from the gates as `layout.tone`) measures the *actual rendered ground* under
each element — not the flat `brand.colors.bg` — so contrast checks (Gate mechanicals) compare ink
against what's really underneath a box, including gradient washes and busy imagery
(`BUSY_VARIANCE` — legibility isn't just a contrast ratio, fine type over a busy/leafy ground can
fail even at a technically-legal ratio).

### Coverage (`src/core/canvas/coverage.ts`)
Directly answers GAP-ANALYSIS.md's headline finding (§9 below): a flyer can have a technically
valid 4–7 elements and clean contrast and still read as "an empty page with a headline on it" if
most of the canvas carries no ink. `measureCoverage()` computes real ink coverage of the rendered
PNG; Gate mechanical `coverage` fails below `MIN_COVERAGE`.

---

## 8. Decoration — ornament that never touches type (`src/core/decor/`)

Ornament (dots, marks, small shapes drawn by the graphics/material language) is placed **after**
layout is final, specifically so it can never draw over type or evidence. It's deterministic
rejection sampling with a **fixed attempt budget** and a **per-slot RNG stream** — no unbounded
loops, no cross-slot coupling (`ATTEMPTS_PER_SLOT: 24` in `budget.ts`).

Why this file exists and is guarded so tightly: engine-generated ornament is *invisible* to Gate
G3 (which only counts `spec.elements`) and to the banned-list's structure-clutter signal (which
only looks at `role: "structure"` elements). Nothing else in the pipeline would stop a graphic
language from covering the page in sparkles — `budget.ts`'s constants (`MAX_ITEMS: 6`,
`MAX_FORMS: 2`, `MAX_INK_COVERAGE: 0.14`, `MAX_OVER_ITEMS: 2`) **are the entire safety net**, which
is why each one has a dedicated test. Density (`quiet` / richer) is an art-direction decision, not
a random multiplier — quiet systems get a mechanically lower budget, not just fewer rolls.

---

## 9. The Gatekeeper — Six Gates + mechanical checks (`src/core/gates/index.ts`)

Runs on every candidate; the pipeline only ships a candidate where `passed === true`.

**The Six Gates** (`GateId`: G1–G6):

| Gate | What it checks | How it's decided |
|---|---|---|
| **G1** — one idea | `idea` is 10–140 chars *and* reads as one coherent visual idea | code (length) + vision verdict `ideaReads` |
| **G2** — cover test | With logo+headline physically masked in the pixels, is the product still guessable? | code (an `evidence` element exists) + vision verdict `productGuessable`, judged **only** from the masked image (`maskForCoverTest`) |
| **G3** — restraint | 4–7 elements, **every** one has a non-empty `whyHere` (≥8 chars) | pure code, schema + gate both enforce it |
| **G4** — type participates | Headline has a structural role — scaled against, overlapping, masked by, or gesture-target of something; not floating in empty space | code (typography behaviour flag / relationship / gesture) + vision verdict `headlineParticipates` |
| **G5** — one signature gesture | Exactly the sampled gesture, and it was *actually applied* by the solver (not just declared) | code — `layout.appliedGesture !== null` |
| **G6** — real words | No hollow slogan words (`HOLLOW_WORDS` list), no unsupported "proof" numbers/stats (regex + checked against `provenance.userStatements`), body doesn't just restate the headline, copy reads human | code (regex + fact-matching, scanned through **every** component prop, not just `copy`) + vision verdict `copyReadsHuman` |

**Mechanical checks** (hard pass/fail, all pure code): `overflow`, `contrast` (WCAG-AA, checked
against the *actual rendered ground* each element sits on, not the flat bg colour), `margins`
(safe-zone, topology-aware — some topologies deliberately bleed one slot off-canvas and the gate
knows which), `ctaPresent`, `assetsUsedOrReported` (silently dropping an uploaded asset is not
acceptable; *reporting* it unused is), `bannedListClear` (the 2026 AI-look detector,
`src/creative/banned.ts`), `coverage` (§7), `noCollisions` (a vision-observed collision is treated
as a real defect that blocks shipping, not just a note), `componentGeometry` (a deterministic,
code-only recomputation of `detail-cluster`'s internal row geometry — catches an overlap class
inside one element's own render function that no box-level check above can see, closing a real bug
that had previously shipped past a vision reviewer).

**Visual review is a first-class status**, not an optional nicety: `visualReview` is
`"model"` (Flyero's own vision critic looked), `"agent"` (an external caller supplied a `verdict`
it already computed by looking at the render — the agent-native path's normal case), or
`"pending"`. **A flyer with `visualReview: "pending"` can never be `passed`** — this is what stops
the "no reviewer configured" case from silently becoming an honest-looking `done`.

### The banned list — codified "2026 AI look" (`src/creative/banned.ts`)
Heuristic code detectors, not a vibe check. Two or more hits fails `bannedListClear`. Runs against
the *rendered ground* (including gradients), not just `brand.colors.bg`, because a navy→cyan
gradient wash would otherwise evade the cyan-family signal entirely.

---

## 10. Component Library & creative libraries (`src/components/`, `src/creative/`)

**Component Library** (`src/components/registry.ts` + category files: `content.tsx`,
`evidence.tsx`, `photo.tsx`, `figure.tsx`, `structure.tsx`, `primitives.tsx`, `shapes.ts`,
`assets.ts`). Hand-designed React/SVG components, grown from ~25 to 210+ motifs / dozens of
components as gate and diversity work found concrete holes — this library **is the moat**: it
grows deliberately from evidence, not automatically or speculatively. Each component ships a
manifest: valid roles, min/max size, text limits, compatible topologies, asset slots, motion
affordance (recorded now for the future motion compiler). `npm run sheet:figures` renders every
one in isolation for review — the quality bar is "looks professional alone on a canvas."

**Creative libraries** (`src/creative/`) — the seven sampler dimensions from §5, plus:
- `banned.ts` — AI-look detector rules
- `fontpairs.ts` — 10 curated open-license font pairings
- `color.ts` — contrast math, luminance, `mix()`
- `formats.ts` — canvas sizes (portrait 1080×1350 default; Story/Square added 2026-08-05 as L1
  pulled forward by direct user request; A4 still open)
- `motifs/` — hand-drawn or explicitly-licensed-for-redistribution vector art, organized by
  subject (celebration, nature, food, travel, animals, …), theme-recolourable via
  `data-tone="ink|accent|accent2|muted|paper|ground"` on individual paths, never a baked-in colour
  — see `shapes.ts` for the loading/recolour mechanism
- `library/` — the curated full-colour raster asset library the user drops in permanently,
  searchable via `search_images` with `provider: "library"`

Three distinct image/mark systems exist side by side and are deliberately **not** conflated
(different lifecycles): motifs (checked-in, theme-recoloured), curated library (checked-in,
full-colour, searchable), per-job assets (`POST /v1/assets`, ephemeral, filesystem object store,
not theme-recoloured, not searchable later).

---

## 11. Image sourcing (`src/core/images/`)

`ImageProvider` interface (`search.ts`) fans out to a dozen providers
(`src/core/images/providers/`): Pexels/Unsplash/Pixabay for photos, Openverse/Wikimedia for
open-license imagery, SVGRepo/Color Icons/Simple Icons/unDraw/Open Doodles for icons and
illustrations, plus local Shapes and QR-code generators — all behind one `aggregator.ts`. This is
what lets Gate G2 pass for physical products: a real photograph of the actual thing, sourced live,
not a generic stock stand-in. `transform.ts` provides deterministic sharp-based prep (crop, resize,
duotone, background removal, etc.) with named presets (`product-hero`, `logo-clean`,
`circle-avatar`, …) exposed to agents via `prepare_asset`.

---

## 12. Comparative selection (`src/core/select/index.ts`)

Runs *after* the gatekeeper, among candidates that already passed. Rather than mechanically
picking "the highest score," an LLM jury looks at all passing candidates' renders and picks the
**most authored** one — falling back to a deterministic least-revised pick if the job's vision
budget is already exhausted. This is a deliberate rejection of "safest wins": among several
gate-passing designs, the one that took the fewest revision loops to get there is a weaker signal
of quality than "which one actually looks intentional," so a real judgment call is spent here when
budget allows.

---

## 13. REST API & MCP surfaces

### REST (`src/api/server.ts`, `agent.ts`) — the only place logic lives (law 6)
Path A: `POST /v1/flyers` (create), `GET /v1/flyers`, `GET/PATCH /v1/flyers/{id}`,
`POST /v1/flyers/{id}/revise`, `.../export`, `.../spec`, `POST /v1/batches` (the DR-1 diversity
test harness), `POST /v1/assets` + `/v1/assets/transforms` + `/v1/assets/{id}/transform` +
`/v1/assets/{id}/file`, `GET /v1/formats`, `GET /v1/storage`, `GET/v1/health`, `GET /v1/skills`.

Path B (agent-native, `agent.ts`): `GET /v1/guide`, `POST /v1/studio/assignments` (get a
lineage assignment without running the whole pipeline), `GET /v1/schema/composition`,
`POST /v1/flyers/compose` (submit an authored spec).

### MCP (`src/mcp/server.ts`) — 17 tools over stdio + streamable HTTP (`POST /mcp`)
Split cleanly along the two paths:

- **Agent-native (10 tools, always registered, no server model key needed):**
  `upload_asset`, `prepare_asset`, `get_flyer`, `export_flyer`, `read_design_guide`,
  `read_design_skill`, `request_designers`, `search_images`, `import_image`,
  `get_composition_example`, `search_motifs`, `compose_flyer`, `revise_composition`,
  `review_flyer`, `export_composed_flyer`
  *(guide.md/skills.ts deliberately carry no taste advice — see §2)*
- **Server-authored (registered only when `ANTHROPIC_API_KEY` is set):**
  `create_flyer`, `revise_flyer`, `create_flyer_batch`

Every MCP tool is a thin wrapper calling the REST API (`api()` helper) — law 6 in code, not just
policy. Preview images returned by tools are sized to survive chat transports.

---

## 14. Storage (`src/store/`)

- **Job store:** SQLite via `better-sqlite3` (`db.ts`, `jobs.ts`) — status, stage, seed, brief,
  lineage, gates, revision pointer. Planned migration to Postgres is gated behind sustained
  concurrent load (Roadmap L6), not built preemptively.
- **Object store:** local filesystem under `STORAGE_DIR` (`objects.ts`, `assets.ts`) for uploaded
  and derived per-job assets. `npm run prune` garbage-collects old job/object data.
- **Process log:** every job (win or loss) writes a full record — brief, every lineage sampled,
  every candidate's spec/critiques/gates/score, the selection decision, editability report. Never
  deleted (law 10) — this is explicitly framed as a future training asset, not just a debug log.

---

## 15. Tech stack

| Concern | Choice |
|---|---|
| Language/runtime | TypeScript, Node ≥20 |
| API server | Fastify |
| Validation | zod (spec schema is law — shared by API, composer, renderer) |
| Rendering | React 18 `renderToStaticMarkup` → SVG; `@resvg/resvg-js` → PNG |
| Image processing | `sharp` |
| Planning/copy/revision/vision LLM | Claude (Anthropic API, via `@anthropic-ai/sdk`), all calls routed through `src/llm/` |
| Job store | SQLite (`better-sqlite3`); `pg` present as the future Postgres path |
| MCP | `@modelcontextprotocol/sdk`, stdio + streamable HTTP |
| QR codes | `qrcode` |
| Fonts | 41 static TTF faces / 12 open-license families, installed once via `npm run fonts`, hashed manifest for reproducibility |
| Tests | vitest (`test/unit`, `test/golden`, `test/acceptance`) — full suite runs with **no API key** and spends no money; `npm run smoke` is the one command that costs money |

**Deliberately not in v1** (each has a named trigger in `docs/ROADMAP.md`): vector DB, graph DB,
embeddings/retrieval, MAP-Elites/QD search, cross-session memory, Python workers, microservices,
image-generation models, Postgres, a queue.

---

## 16. Where the project actually stands (2026-08-18)

Per `docs/ROADMAP.md` + `CHANGELOG.md`:

- **Milestones 0–2**: done — skeleton, libraries, full 10-stage pipeline wired.
- **Milestone 6 (MCP + agent surface)**: pulled forward and substantially built (17 tools) ahead
  of Milestone 3, because real agent sessions were the fastest way to generate live signal for
  diversity/quality tuning.
- **Milestone 3 (the Diversity test, DR-1)**: **the actual gate for the whole product** — "if this
  fails, everything stops until it passes." Status: in active tuning, not yet formally passed via
  the 3-outside-people blind-grouping test described in the roadmap.
- **L1 (multi-format)**: Story + Square shipped 2026-08-05, pulled forward by direct user request;
  A4 still open.
- **Milestones 4, 5** (revision/editability hardening, the public Side-by-Side proof): not started.

### The live working document: `docs/GAP-ANALYSIS.md`
This is the document to read before touching layout, decor, or canvas/light/tone — it's the
running comparison against real human-designed references (currently Canva travel/save-the-trees
templates) and it's brutally specific. As of its last update, the three biggest measured gaps,
ranked by how much of the visual distance each accounts for:

1. **The image should *be* the poster, not an inset.** References run a full-bleed photograph as
   the ground with type sitting *on* it; early Flyero output floated small photos in a sea of
   near-white. This is what `evidence: "photographic"` sampling bias (§5) and the
   depth/light/tone model (§7) exist to fix.
2. **Coverage.** References run 55–80% ink coverage; measured Flyero output was ~25.6% mean across
   topologies, and the two topologies that came closest were exactly the two where a photo bleeds
   the full canvas — direct evidence that "coverage comes from the image being the ground, not
   from adding more ornament." `measureCoverage()` + the `coverage` mechanical gate (§7, §9) are
   the enforcement mechanism; the underlying design fix is imagery-as-ground, not decoration.
3. **Palette commitment.** References commit to a saturated colour edge-to-edge; early output
   stayed near-white with a small accent. Colour-logic generators were reworked (2026-07-30 fixes,
   see CHANGELOG) to use supplied brand saturation/lightness literally rather than discarding it
   toward pale, "safe" grounds.

There's also a named **architectural tension** worth knowing for any brainstorm: references carry
12–30 visual objects; Gate G3 caps `spec.elements` at 4–7. The resolution the codebase has
committed to is *not* raising G3 (that would gut the restraint the product is built on) — it's
`copy.details` (small labelled facts — date/place/time/price/handle) and `detail-cluster`-style
components that let *one* element carry a dense cluster of related small facts, so density comes
from richer elements, not more elements.

---

## 17. Key files, if you want to go read code next

| Concern | File |
|---|---|
| Orchestration / the whole job lifecycle | `src/core/pipeline.ts` |
| Spec schema (the law) | `src/core/compose/spec.ts` |
| Diversity mechanism | `src/core/studio/sampler.ts`, `src/creative/artdirections.ts` |
| Layout | `src/core/layout/solver.ts`, `recipes.ts` |
| Depth/light/tone model | `src/core/canvas/depth.ts`, `light.ts`, `tone.ts`, `coverage.ts` |
| Decoration budget | `src/core/decor/budget.ts` |
| Gates | `src/core/gates/index.ts` |
| Banned-list detector | `src/creative/banned.ts` |
| Agent-native composition | `src/core/compose/assemble.ts`, `src/api/agent.ts`, `src/api/skills.ts` |
| REST routes | `src/api/server.ts`, `src/api/agent.ts` |
| MCP tools | `src/mcp/server.ts` |
| Live quality gap tracker | `docs/GAP-ANALYSIS.md` |
| Full requirements/architecture docs | `docs/OUTPUT-FIRST.md` → `REQUIREMENTS.md` → `ARCHITECTURE.md` → `SCHEMAS.md` → `ROADMAP.md` → `VALIDATION.md` |
