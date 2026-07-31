# Changelog

All notable changes to Flyero. Format follows [Keep a Changelog](https://keepachangelog.com/); this project is pre-release, so entries are dated, not versioned, until v0.1 ships.

Rule (from `AGENTS.md`): every milestone completion, requirement change, or architectural decision gets an entry here. Agents and humans alike — if you changed direction, write it down.

---

## 2026-07-31 — Closing the gaps the decoration work opened

Four items were identified while building the decoration layer and left open.
All four are now closed, and two of them were gate-correctness holes.

**The contrast gate was checking the wrong colour.** It compared type against
`spec.brand.colors.bg` — the flat page colour. Once a flyer can carry a gradient
wash or a diagonal colour split, that flat colour may be painted over across
most of the canvas, so the gate would happily pass a flyer whose CTA was
unreadable. It now checks every text element against the fill actually beneath
it (`effectiveGroundUnder`) and against the ink it will actually be drawn in —
which for a box the solver marked `onDark` is a light ink, not the brand
foreground. The palette is still checked against the base wash as well, so a
flyer cannot pass merely because each element happens to sit on a region that
rescues it.

**The banned list could be evaded by a gradient.** Signal 1 (navy + cyan glow)
only ever inspected `brand.colors.bg`, so a ground running navy to cyan slipped
past entirely — reopening the exact hole the banned list exists to close.
`detectBanned` now takes the ground and tests every fill that actually gets
painted: the base, every region, and both gradient stops. Two tests demonstrate
the hole was real by asserting the same spec passes without the ground and fails
with it.

**Material x graphics vetoes.** The two dimensions both describe surface, so
unconstrained they contradict each other — a sticker sheet printed on drafting
paper is not bold, it is two briefs fighting. Seven material x graphics and two
topology x graphics vetoes added. The sampler's "every dimension value is
reachable" test still passes, so the sample space has not collapsed.

**A global boldness budget.** G5 insists on exactly one signature gesture, but
counts only the gesture: nothing stopped a flyer taking a gesture *and* a
saturated split ground *and* an arched headline *and* two solid ornaments —
four competing bids for attention. `MAX_BOLD_MOVES = 3` now counts ground,
gesture and type treatment first, and ornament spends whatever survives.
Ornament yields because it is the least meaningful of the four, and a solid mark
is demoted to a tint rather than dropped, so the graphic language still reads.
This is the "spend your boldness in one place" rule made mechanical — taken from
Anthropic's `frontend-design` skill, not invented here.

Also: the Composer and the agent assignment now both state the graphic language
and that the engine applies it, so a cold session does not spend one of its 4-7
elements on decoration that is going to be drawn anyway.

Tests 150 -> 154.

## 2026-07-31 — Bleed fix attempted and reverted; imported design expertise

**Attempted and reverted: non-photographic components giving up the bleed.**
A card in a full-bleed slot is shrunk to its natural height and centred, which
leaves the rest of the declared rect empty. The apparent fix — make the bleed a
property of the component rather than the slot, and clamp anything
non-photographic into the safe rectangle — was implemented, measured, rendered,
and **reverted**: it regressed `split-editorial` from a 16% to a 28% empty band
and pushed every element into the top half of the page, leaving the bottom 55%
bare. That is a worse fault than the one it set out to fix. The centring
behaviour and the reason it exists are now documented in place so the next
attempt starts from the measurement rather than repeating it.

The recipe-level fix from earlier stands and is verified visually. Every
topology sits at or below a 16% largest empty band.

**Banned list: three imported signals.** Anthropic's official `frontend-design`
skill names the three palettes current AI design keeps landing on "regardless of
subject":

- warm cream ground (~#F4F1EA) + high-contrast serif + terracotta accent
- near-black ground + a single acid-green or vermilion accent
- broadsheet pastiche — hairline rules, zero radius, dense columns

`src/creative/banned.ts` previously detected only navy+cyan glow. All three are
now detected, as `cream-serif-terracotta`, `black-acid-accent` and
`broadsheet-default`. They are deliberately imported rather than invented: a
taxonomy we reasoned our way to would just re-encode our own habits, which is
the exact failure being detected.

Calibration measured across 120 sampled flyers: the three fire 9 times in total
and cause **zero** failures on their own, because each is legitimate for some
brief and two hits are required to fail. A test asserts that stays true, so the
thresholds cannot quietly become punitive.

Tests 146 -> 150.

## 2026-07-31 — Dead-band fix in off-center-hero

The save-trees run shipped with a quarter of the page empty between a lone
eyebrow and the headline. Rather than eyeball it, every topology was measured
for its largest contiguous empty horizontal band:

    off-center-hero        30%  at y=0%     <- outlier
    split-editorial        16%  at y=75%
    everything else       <=13%

`off-center-hero` started its message slot at y=0.30 while the eyebrow ended at
0.05. Moved the message to 0.09 and redistributed support (0.47) and cta (0.72).
Result: 30% -> 14%, and the remaining air moved from the top of the page to just
above the brand mark, where it reads as deliberate because something anchors it.
A void under a lone eyebrow reads as a missing element; air above a signature
does not.

`test/unit/layout.test.ts` now asserts no topology leaves a contiguous empty
band over 20% of the canvas, so this class of fault cannot return unnoticed.

Tests 145 -> 146. Output of the run is checked in at `output/save-trees/`.

## 2026-07-31 — Type treatments, new faces, and a real end-to-end run

**Fonts.** The set had no script, no condensed poster face and no slab — the
exact registers every travel, event and hand-made reference depends on. Added
Caveat, Great Vibes, Anton, Archivo Narrow and Roboto Slab (41 → 52 faces) with
five new pairings. Anton and Great Vibes ship a single weight, so their pairs
request 400 rather than silently falling back.

**Type treatments.** `headline-block` gains
`treatment: plain | outline | shadow | arch`. Arched type uses `<textPath>`, so
it stays real `<text>` and the SVG editability guarantee survives.

`arcGuideId()` exists because of a trap worth recording: `checkEditability`
(`src/core/export/index.ts:54`) rejects any `<path>` whose id mentions
headline/copy/text/label, and the guide path an arched headline is set along
belongs to an element usually called exactly `headline`. The obvious
`${id}-guide` would have failed every export. The substitution uses `_`, which
`specElementSchema` forbids in an element id, making the encoding injective —
a first attempt using plain abbreviations collided (`headline` and `hl` both
became `hl`), which its own new test caught.

**End-to-end run — a "save trees" brief, entirely through the agent API.**
Studio assignment → Pexels search → import three canopy photographs with
provenance → compose with `photo-cluster` → render → review → `done`, all six
gates passed. This was the first run to exercise search, import, the photo
components and the decoration layer together.

It found two real bugs, neither visible to any existing test:

1. **`photo-cluster` sized its circles independently of their spacing**, so two
   cutouts overlapped into a single blob, and the route motif drew on top of a
   cutout instead of clear of it.
2. **The `connector-to-cta` gesture drew off the canvas.** `startY` came from
   the evidence element's bottom edge — and when the evidence is a full-bleed
   plate, that bottom is the bottom of the page, putting the path's start at
   y=1384 on a 1350px canvas. The line then ran off three sides. The margin
   pass could not catch it because margins only ever inspect *boxes*, and the
   connector's box was legal; it was the drawn path that escaped. Fixed by
   holding the start above the CTA and clamping every waypoint into the safe
   rect. `test/unit/layout.test.ts` now asserts connector waypoints stay inside
   their own box across six fixture lineages.

Two earlier hypotheses about that bug were wrong and produced byte-identical
output, which is what forced actually dumping the solved geometry rather than
reasoning about it further.

Tests 143 → 145.

## 2026-07-31 — Stock photography, and a vocabulary for how images land

Two halves of one problem. Flyero could only put a photograph in a rectangle,
and it could only use photographs the user happened to supply — so a flyer for
a place, a dish or an object with nothing to show could never pass the cover
test (G2), whatever the styling.

**Retrieval.** `src/core/images/search.ts` (new) puts Pexels behind an
`ImageProvider` interface, so adding or swapping a source touches one file.
`POST /v1/assets/search` returns candidates without downloading anything —
an agent can look at a dozen options and pay for one — and
`POST /v1/assets/import` pulls the chosen image into the asset store, where it
rides the existing normalise → analyse → transform → compose path. Import only
accepts Pexels image URLs, so the endpoint cannot be used as a general URL
fetcher. Provenance (`source`, `source_url`, `author`) is recorded via the same
idempotent `PRAGMA table_info` + `ALTER TABLE` pattern as `parent_id`, and is
inherited by derived assets — a crop of a stock photograph is still that
photographer's photograph, and Pexels asks for credit. Two new error codes,
`not_configured` and `upstream_error`, keep "we lack a key" and "someone else
failed" distinct from our own failures. An absent key is a valid state.

**Composition.** `src/components/photo.tsx` (new) — five ways an image can land
on a page, all Composer-selectable and therefore counting against the 4–7
budget, because choosing between them is a real design decision:

- `photo-cluster` — 2–4 circular cutouts on a bowed line joined by a dashed
  route with a plane or pin riding it. Turns several photographs into a journey.
- `polaroid-stack` — tilted prints with white borders, overlapping.
- `photo-grid` — 2–4 images on a tight gutter, optionally one running larger.
- `torn-photo` — a torn paper edge over an offset colour block.
- `motif-collage` — **no photograph at all**: drawn marks composed around a
  subject. Not every brief has something worth photographing, and an honest
  drawing beats a stock photo of nothing.

Per-element `assets` raised `.max(3)` → `.max(6)`; the new photo components
join `PHOTO_COMPONENTS` in the solver so they are treated as photographic
plates for the `onDark` pass.

Verified against the live Pexels API and inspected by eye, which caught two
real bugs: `photo-cluster` sized its circles independently of their spacing, so
two large cutouts overlapped into a blob, and the route motif was drawn on top
of a cutout instead of clear of it. Both fixed — radius now accounts for the
gaps, the run is re-centred against the bow, and the motif rides the route's
normal on the outside of the curve.

Guide updated: the image loop now reads search → import → transform → compose,
and states plainly that how an image enters a composition is itself a claim —
three cutouts on a dashed line say "we go to these places", the same three in a
grid say "we offer range".

Tests still 143 green.

## 2026-07-31 — Vector vocabulary and the decoration layer

Shown eight sampled flyers, the user judged the output "not even 5 percent" as
attractive as ordinary Canva templates and asked for the architecture to be
examined rather than the surface tuned. The diagnosis: **Flyero had no graphic
vocabulary.** `primitives.tsx` exported only `Group`, `TextBlock`, `FittedLine`,
`Panel` and `Rule`; there was one gradient repo-wide, no `<pattern>`, no
illustrative form of any kind, and `Background()` could draw a flat rect plus
one of four monochrome textures. Ornament was also *architecturally excluded* —
`spec.elements` is capped 4–7 and G3 counts every element, while the reference
flyers carry 15–30 visual objects.

**Decision: ornament is engine-generated, never authored.** It is a pure
function of (graphic language, seed, palette, solved boxes, canvas) and never
enters `spec.elements`. So the 4–7 budget and G3 are untouched, and AGENTS.md
law 1 extends — the LLM does not choose ornament either. Diversity comes from
the sampler, as law 2 requires.

- **`src/components/shapes.ts`** (new) — pure path geometry: blob, wave,
  squiggle, star, sparkle, burst, arc, polygon, ribbon, torn edge, dashed
  route, arch, rounded rect, arc bands, plus `<pattern>` tiles (checker,
  stripe, halftone, grid, grain) and 11 hand-authored motifs. Directional
  motifs all point along +x so rotating to a bearing composes correctly.
- **`src/core/decor/`** (new) — `ground.ts` plans the coloured field,
  `decorations.ts` places ornament by deterministic rejection sampling,
  `budget.ts` holds the caps, `ink.ts` chooses ornament colour and works out
  what a box actually sits on, `ids.ts` guarantees safe ids.
- **`src/creative/graphics.ts`** (new) — the seventh dimension, ten graphic
  languages. Profile space 460,800 → 4,608,000.
- **`src/core/render/ground.tsx`** (new) — replaces `Background()`; textures are
  now `<pattern>` rather than 900 individual `<circle>` elements.

**Architectural correction made during the work:** the ground is planned inside
`solveLayout` (pass 8.4), *before* the pass that sets `box.onDark`. `onDark` is
the only mechanism that switches type to a light ink and it lives in the solver,
so a ground decided in the renderer would arrive after every ink decision had
already been made. `Box` gained `ground?`, and `inkFor` now holds contrast
against the real fill instead of guessing at a photographic plate.

**Measured, not assumed:** `docs/RESVG-SUPPORT.md` records what the installed
renderer actually draws, verified by pixel sampling in
`test/unit/resvg-capabilities.test.ts`. Two findings matter — `mix-blend-mode`
is *silently ignored* as a presentation attribute and only works via `style`,
and `feTurbulence` is barred despite working, because its output is an
implementation detail of resvg's noise and a version bump would silently change
every flyer without failing the self-comparing golden test.

Tests 76 → 143. New: `shapes.test.ts` (43), `resvg-capabilities.test.ts` (12),
`decorate.test.ts` (12, run across all 100 graphic-language × topology
pairings — keep-out invariant, every budget cap, id safety, determinism).
`PROFILE_SPACE` updated in `sampler.test.ts`. `lineageSchema.graphics` is
defaulted so the ~11 stored `spec.json` files still parse.

Still open from the plan: type treatments and script/condensed/slab faces,
photo-composition components, and Pexels search/import.

## 2026-07-31 — Structural diversity: the ten topologies were one layout

A user looking at eight sampled flyers said they all looked the same. They were
right, and the cause was measurable: **nine of the ten topology recipes put the
message at y=0.05, the CTA at 0.84 and the brand at 0.95.** Metaphor, palette,
type and material varied; the composition did not. The Diversity Requirement is
a claim about structure, so the system was failing it at the geometry layer while
passing every gate.

### Added
- **All ten recipes rewritten as genuinely distinct structures** — message below
  the image (framed-evidence, oversized-anchor), full-bleed poster grounds
  (layered-depth-stack), right-hand image columns bleeding off the edge
  (split-editorial, off-center-hero), right-aligned type (zigzag-path), centred
  axis (radial-field). A table in the file header states each one's shape.
- **`bleed` on recipes** — slots that may cross the canvas edge. Bleeding
  elements sit behind the flow, are exempt from the margin clamp, and are
  excluded from collision and fill (they are ground, not a beat in the column).
- **`align` on recipes** — text alignment is a property of the composition, not
  of the author's taste.
- **`onDark` ink switching.** The solver marks any text element sitting on a
  photographic plate; components then switch to a light ink, and `photo-hero`
  is asked for a scrim on the side the text actually landed. Type on a full-bleed
  photograph now works, which the guide had been recommending while the renderer
  could not do it.
- **`logo-lockup` component** (28 total) — a logo at controlled optical size,
  locked up with the company name and an optional tagline.
- Tests: topology recipes must be structurally distinct (message y, CTA y, bleed
  count, alignment variety), and recipe slots that share a column may not overlap
  vertically.

### Fixed
- `PATCH /v1/flyers/{id}` **silently dropped `brandColors`**, regenerating the
  palette from nothing — a flyer changed colour between revisions for no reason.
  It now inherits the stored brand.
- Bleed plates were shrunk to their intrinsic height, collapsing a full-height
  column into a band; photographic grounds now fill their rect, and non-photo
  components keep their aspect and centre inside it.
- A relationship promoted a bleed plate *above* its partner, burying the very
  text it existed to place on the image. A ground never climbs over type.
- The crop gesture re-bled an already-bleeding element until it swallowed the page.
- The gates carried their own copy of the margin rule and failed a flyer for
  obeying its own recipe's bleed.
- Evidence could claim slack beyond its natural size, turning a three-item
  checklist into a large empty panel; growth is now capped per component.
- The solver only ever *shrank* an element to its content. When content needed
  more height than the slot, the box stayed short and the text spilled onto
  whatever was below — a paragraph printed across a button. Content now decides
  height; the recipe decides only where an element starts.
- A single gap could absorb all of a column's surplus and open a hole mid-page.
- `framed-evidence` had overlapping support/cta and message/support bands.

### Verified
Two runs in `.scratch/runs/`: `2026-07-31-orchid-v2` (done, six gates) and
`2026-07-31-xayali` (**below_bar on G2** — a tourism brief with a logo but no
photograph of anywhere; the service is named, never shown). The second is a real
failure kept as a failure.

---

## 2026-07-30 — Agent E2E orchid run + patch asset fix

### Fixed
- **`PATCH /v1/flyers/{id}` dropped newly referenced assets.** Patching an
  element's `assets` to a freshly prepared id still rendered from
  `job.asset_ids` only, so the hero drew an empty placeholder. Patch now unions
  element-referenced ids into the job (same rule as compose) and rejects unknown
  ids.

### Verified (API-only agent loop)
- Upload `orchid.png` (downscaled jpeg) → transform (crop/sharpen; `product-hero`
  cutout ruins dark studio photos) → 3 studio assignments → compose with
  `photo-hero` / `masked-image` → export PNG/SVG → review. Outputs in
  `.scratch/e2e-orchid/`. Prior broken runs archived under
  `.scratch/archive/old-flyers/` and `.scratch/e2e-orchid/archive-bad-prep/`.

---

## 2026-07-30 — Photo-first evidence and brand-faithful colour (post-run fixes)

The first end-to-end agent run (a florist brief) exposed that the system was
structurally biased toward pale, chrome-wrapped, document-shaped output — the
exact "AI template" look the product exists to kill. Root causes fixed:

### Added
- **`photo-hero` component.** Full-crop photograph with no chrome and an optional
  top/bottom scrim, so the headline can sit *on* the image (declare the headline
  in front via a relationship). The default evidence for physical products.
- **`masked-image` component.** Photograph clipped to a circle, arch, pill or
  seeded organic blob, with an optional accent ring — the florist/boutique/
  editorial device. Component count 25 → 27.
- Agent guide: new "Choosing evidence — match the component to the product"
  section (software → frames, documents → cards, physical products → the
  photograph IS the evidence), plus the headline-on-scrim pattern for Gate G4.

### Fixed
- **`before-after-stack` ignored its two asset slots** and always drew abstract
  bars. It now renders asset 0 in the before half (under a quiet ground wash)
  and asset 1 in the after half; the abstract bars remain only as the no-asset
  fallback for document/software subjects.
- **Colour logics discarded brand saturation and lightness**, reducing every
  supplied palette to a hue and regenerating near-white grounds (93–98% light) —
  "vibrant" was unreachable by construction. Generators now use saturated brand
  colours literally where the logic allows: the brand colour becomes the accent
  (`single-accent`, `monochrome-with-signal`, `two-accent`), a dark brand colour
  becomes the ground (`inverted-dark-field`), a second brand hue drives the
  duotone, and `tinted-ground` keeps the brand's real chroma in the ground.
  Ground saturation ranges raised across the set so derived palettes carry
  colour too.
- `baseHue`'s green band ran to 172°, which reads as cyan now that grounds carry
  real saturation — trimmed to 158° so no derived ground lands in the banned
  cyan family.
- `asset-image` forced every placement square; it now takes an `aspect` prop
  (square / portrait / landscape).
- Component purposes now steer the Composer: browser/phone frames say "software
  only — never the evidence for a physical product", document-card points
  photographs to the photo components.

---

## 2026-07-30 — Image preparation API for agent blending

### Added
- **Asset transform pipeline (`src/core/images/transform.ts`).** Deterministic image prep with sharp: crop, cropBox, resize, blur, sharpen, grayscale, opacity, roundCorners, circleCrop, feather, vignette, tint, modulate, contrast, rotate, flip, pad, removeBackground (auto/chroma), duotone.
- **Presets** for common flyer jobs: `product-hero`, `logo-clean`, `soft-cutout`, `circle-avatar`, `bg-plate-blur`, `screenshot-frame`, `brand-tint`.
- **REST:** `GET /v1/assets/transforms`, `POST /v1/assets/{id}/transform` (returns new assetId; originals immutable), `GET /v1/assets/{id}/file`.
- **MCP:** `prepare_asset` tool — preset/ops, returns preview image so the agent can verify the cut.
- Agent guide updated: upload → prepare → compose is the required image loop.

### Decisions recorded
- Background removal v1 is corner-sampled chroma knock-out (logos / studio product shots). Full ML subject matting is a later upgrade if real photos need it — not required for the common flyer case.
- Derived assets store `parent_id` + `transforms` JSON; agents can try several preparations without re-uploading.

---

## 2026-07-30 — Milestones 0–2 implemented

### Added
- **Scaffolding.** TypeScript/Node 22, Fastify, zod, React→SVG→resvg, better-sqlite3, vitest. `npm run fonts` installs 41 static TTF faces (12 open-license families) into `assets/fonts/` with a hashed manifest, so rendering is reproducible from a clean clone.
- **Creative libraries (`src/creative/`).** All six dimensions as data: 12 metaphor families, 10 composition topologies, 8 typography behaviours, 6 material languages, 8 colour-logic *generators*, 10 signature gestures, an 11-rule veto matrix, 10 curated font pairings, and the banned-list detector. 460,800 designer profiles.
- **Component Library (`src/components/`).** 25 hand-authored React/SVG components across content / evidence / structure, each with a manifest (roles, min/max size, asset slots, text limits, motion affordance).
- **Studio Sampler (`src/core/studio/`).** Seeded lineage sampling with unique metaphors per job, risk-gated adventurousness, and veto re-rolls. Contains no history lookup by design.
- **Layout Solver (`src/core/layout/`).** 10 topology recipes plus a deterministic solver: slot assignment → intrinsic shrink → headline fit → clamped relationships → gesture → collisions → text safety → fill → margins → masks.
- **Renderer (`src/core/render/`).** Exact text metrics via fontkit, React→SVG, resvg rasterisation. Text stays `<text>`, groups are named, assets embed as data URIs.
- **Pipeline stages 1–10.** Brief builder, idea engine, composer (schema-validated with retry), rule + vision critic, reviser (spec edits only), gatekeeper (Six Gates + mechanical checks), exporter with an editability report.
- **REST API (`src/api/`)** covering every endpoint in `API.md`, an in-process job runner with concurrency and spend guards, and **MCP server (`src/mcp/`)** with the six mapped tools, returning preview images.
- **62 tests** across unit / golden / acceptance, plus `npm run smoke` (live) and `npm run sheet` (offline contact sheet).

### Fixed (bugs the tests caught during the build)
- `fitText` under-measured height with tight leading, so headlines overflowed their own box; it now uses real ink extent (ascent + descent).
- `fitText` accepted sizes that hard-split words mid-character; it now rejects any size where the longest word does not fit.
- `ensureContrast` searched only one lightness direction and could not reach AA against mid-tone grounds.
- Colour-logic palettes did not guarantee their own accent was legible; `finish()` now holds the accent to the large-text threshold.
- Justified overlaps could bury text — capped to a fraction of one line vertically, and forbidden entirely in the horizontal direction, where they slice words.
- A lone evidence element never grew or centred in its column, leaving dead space.
- IBM Plex Mono's space glyph crashes fontkit's outline reader; measurement now falls back to the `hmtx` table per face.

### Decisions recorded
- Model roles default to `claude-opus-5` (planner), `claude-sonnet-5` (vision), `claude-haiku-4-5` (cheap). `effort` is sent only to models that support it, so older ids in `.env` still work.
- Structured outputs (`output_config.format`) replace free-text JSON parsing for every model call, so composer retries are about content quality rather than malformed JSON.
- Gestures that can only be expressed through a specific component now declare `requires`, and the spec schema enforces it — a gesture can no longer silently no-op and leave G5 passing.
- The test suite runs with no API key and its own temp store, so it can never spend money; the live run is the separate `npm run smoke`.

---

## 2026-07-30 — Planning suite complete

### Added
- `docs/IDEA-VALIDATION.md` — market analysis of the original 104-page concept PDF; verdict, gaps, competitive landscape (Lovart, Canva MCP, Figma MCP, Krumzi/Gamma/Recraft).
- `docs/OUTPUT-FIRST.md` — output-first product definition: the "never see a bad flyer" promise, the Six Gates, the banned list, the human design sequence.
- `docs/REQUIREMENTS.md` — testable requirements incl. the Diversity Requirement (DR-1..3: variance by construction, not memory) and the five v1 acceptance tests.
- `docs/ARCHITECTURE.md` — 10-stage pipeline, Studio Sampler (~460k designer profiles from 6 curated creative dimensions), design spec schema, component library plan, tech stack (TypeScript/Fastify/React-SVG/resvg/SQLite), repo layout, risk register.
- `docs/FLOWCHARTS.md` — mermaid diagrams: end-to-end generation, studio sampler, critique loop, API lifecycle, surface architecture, future format compilation.
- `docs/API.md` — REST-first API spec (assets, flyers, revise, batch, process introspection), async job pattern, MCP 1:1 tool mapping, curl smoke test.
- `docs/ROADMAP.md` — milestones 0–6 with hard definitions of done; later phases each gated behind an explicit trigger.
- `docs/SCHEMAS.md` — data contracts (brief, lineage, spec, layout, critic, gates, banned detector, topology recipes, cost rules).
- `docs/VALIDATION.md` — full audit of idea + tech + consistency + build-readiness; lists fixes applied.
- `.env.example`, `README.md`, `AGENTS.md`, this changelog.

### Changed (same-day audit fixes)
- Clarified product promise: only `done` if gates pass; `below_bar` is honest failure.
- Unified Gate G3 to 4–7 elements; Gate G4 applies to every shipped flyer.
- Studio Sampler: one job seed → N lineages (metaphors unique), candidates in parallel.
- Banned-list timing and heuristic detection specified.
- DR-1 reading path derived from topology map.
- Spec examples use generic component IDs only.
- Cost/vision call caps and font/asset env vars added.

### Decisions recorded
- Scope: flyer only (Instagram portrait 1080×1350) until the Side-by-Side test is won.
- API is the core surface; MCP is a logic-free adapter; all dev testing via curl.
- Diversity mechanism is seeded lineage sampling — cross-session memory explicitly rejected as the creativity mechanism (kept as optional later project-level feature, trigger L2).
- No vector DB, graph DB, embeddings, QD search, Python workers, or image-generation models in v1.
- Reference images in v1 = soft hints (palette/roles) only — no full structural imitation pipeline.
- Build contract for agents: OUTPUT-FIRST → REQUIREMENTS → ARCHITECTURE → SCHEMAS → ROADMAP; PDF / IDEA-VALIDATION are background only.
