# Changelog

All notable changes to Flyero. Format follows [Keep a Changelog](https://keepachangelog.com/); this project is pre-release, so entries are dated, not versioned, until v0.1 ships.

Rule (from `AGENTS.md`): every milestone completion, requirement change, or architectural decision gets an entry here. Agents and humans alike — if you changed direction, write it down.

---

## 2026-08-05 — Checked two free sticker sources, kept neither; added line-art motifs instead

### Decisions recorded
- **Checked OpenMoji (CC BY-SA 4.0, official bulk download, ~4,500 icons
  including a recolourable single-tone variant) and unDraw (excellent
  license, but explicitly forbids automated/bulk downloading) as sources for
  richer decorative stickers.** Decided against bulk-importing either:
  OpenMoji's attribution+share-alike requirement has no display mechanism
  anywhere in the product today (the same gap already exists silently for
  Pexels photo attribution), and unDraw can't be automated without violating
  its terms. The library keeps growing by hand-authored `MOTIF_DATA` entries
  instead — same convention as everything already there. Full reasoning in
  `docs/GAP-ANALYSIS.md`.

### Added
- **`Motif.stroke`** (`src/components/shapes.ts`) — a motif can now be
  line art (outline, no fill) instead of a filled silhouette, wired into
  both render paths that draw motifs (`src/core/render/ground.tsx` for
  decoration, `src/components/figure.tsx` for composed-figure parts).
  Filled motifs are unaffected; a `shaded` composed-figure part is ignored
  for a stroke motif, since a gradient sheen has nothing to fill.
- **Three new motifs** using it: `cake` (two-tier, three lit candles),
  `bow` (two loops, a knot, notched tails), `sparkle-doodle` (a scattered
  three-sparkle cluster) — the hand-drawn sketch register the doodle/
  scrapbook references use, which a filled silhouette can't reach.

### Fixed
- `test/unit/shapes.test.ts`'s "every motif is a well-formed path" check
  required every motif's `d` to end in `Z` (closed) — true for a filled
  shape, wrong for line art with legitimately open subpaths (an open candle
  stroke, a bow's tail). Exempted `stroke` motifs from that specific check.

---

## 2026-08-05 — Shaded motifs, and a live agent run that found four real gaps

Drove a real MCP session end to end (external agent, real brief) against
today's earlier motif/frame/format work to see how it actually held up, not
just how it rendered in isolation. Full trace in `docs/GAP-ANALYSIS.md`
2026-08-05 — summary here per AGENTS.md.

### Added
- **`shaded: boolean` on `composed-figure`'s `motif` and `shape` parts**
  (`src/components/figure.tsx`), default `false` so nothing existing changes.
  When set, renders a highlight-to-shadow radial gradient keyed off the
  flyer's one light (`src/core/canvas/light.ts`, already used by photos and
  panels, just never wired into motifs/shapes) plus a matching contact
  shadow, instead of a flat single-colour fill. Turns a flat balloon/gift
  silhouette into something that reads as a rendered object sitting in the
  same lit scene as everything else — and because the gradient is derived
  from the part's own `fill` at render time, recolouring it is still one
  prop, not a new asset.

### Decisions recorded
- **Considered and rejected raster stickers (licensed packs) and
  AI-generated sticker images** as the fix for "flat-looking decoration,"
  in favour of vector shading. Neither raster option is recolourable, a
  pre-lit raster asset fights the single-light system instead of joining it,
  and a bundled sticker pack is exactly what `shapes.ts`'s own header already
  rejects (licence, house style). Vector shading was the only option that
  actually satisfies "an agent can adjust its colour" and "it blends with
  everything else," which is what was actually asked for. Full reasoning in
  `docs/GAP-ANALYSIS.md`.
- Confirmed and documented the motif/asset distinction for future
  contributions: `MOTIF_DATA` entries are theme-recoloured at render time;
  uploaded assets (logos, images via `POST /v1/assets`) are not and never
  will be by this mechanism.

### Found, not yet fixed (tracked in `docs/GAP-ANALYSIS.md`'s Working order)
- `kawaii-doodle`/`festive-scene` are reachable from only one art direction
  (`botanical-celebration`) — an agent reading "hand-drawn collage" reasonably
  lands on `crafted-collage` instead and never sees them.
- No colour-logic generator produces a genuine multi-hue pastel palette.
- Nothing yet points an agent at the new `shaded` option — it exists but
  isn't surfaced, the same reachability failure the 2026-08-02 `visual`-field
  fix already happened once.
- A `speech-bubble` motif part rendered as bare text with no bubble shape in
  the live run — not yet root-caused.

---

## 2026-08-05 — Multi-format support (L1, pulled forward)

User directly asked for size-awareness — the agent choosing among several
canvas dimensions, not just the one fixed portrait — in the same request that
prompted the motif/frame work above. `docs/ROADMAP.md` had gated this behind
"Milestone 6 users ask for them" (L1); recording here, per AGENTS.md, that the
trigger fired directly instead of through that milestone. `docs/ROADMAP.md`
L1 row updated to point at this entry.

### Added
- **`src/creative/formats.ts`** — a `Format` dimension (`{id, w, h, safe, label}`),
  not a Studio Sampler dimension (format is chosen by the caller, not sampled
  per lineage). Three to start: `portrait-4x5` (1080×1350, the original,
  still the default everywhere), `square-1x1` (1080×1080), `story-9x16`
  (1080×1920).
- **`format` threaded end to end**: `POST /v1/flyers`, `POST /v1/batches`,
  `POST /v1/flyers/compose` (agent-native path), the `create_flyer` /
  `create_flyer_batch` / `request_designers` MCP tools, and a new
  `GET /v1/formats` for discovery. Every entry point defaults to
  `portrait-4x5` when omitted, so no existing caller's behavior changes.
  `jobs`/`batches` gained a `format` column (additive `ALTER TABLE`
  migration in `src/store/db.ts`, same pattern as the existing asset-transform
  columns — an existing local `data/flyero.db` upgrades in place).
- `src/core/compose/spec.ts`'s canvas schema now validates `w`/`h` against
  `isKnownCanvasSize` instead of a hardcoded `z.literal(1080)/z.literal(1350)`.

### Fixed
- **`type-poster`'s headline could overflow the canvas on a shorter format.**
  The recipe's `headlineCeiling: 0.24` sizes off canvas *width*, which is
  1080 in every format here, but the solver lets the headline box grow past
  its nominal slot height to fit the text (`solver.ts` §3, by design — the
  box grows rather than the text always shrinking to a fixed slot). That
  read fine against the tall portrait canvas it was tuned against and
  visibly clipped on `square-1x1`'s shorter one at 4 lines near ceiling.
  Capped to `0.19`/3 lines — verified against all 14 topologies on all 3
  formats (mechanical gates + a structural off-canvas-box check) after.

### Verification
- Every topology recipe rendered at every format and eyeballed (normalized
  0–1 rects mostly port automatically, as `ARCHITECTURE.md` intended — only
  `type-poster` needed a change). `story-9x16` needed none — extra vertical
  room only helps. The five pre-existing intentional bleed topologies
  (`split-editorial`, `oversized-anchor`, `layered-depth-stack`,
  `off-center-hero`, `asymmetric-two-column`) show the same boxes running
  past the canvas edge in all three formats, confirming that's by design
  (`recipe.bleed`), not new breakage.
- `runGates` mechanical checks (overflow, WCAG-AA contrast, safe margins,
  banned-list) pass across the full 3-format × 14-topology product.
- Full suite green (`npm test`).

### Decisions recorded
- `assembleSpec`'s 4th parameter is the resolved `{w, h, safe}`, not a
  `FormatId` — a revision must reuse the *stored* spec's own canvas exactly,
  and re-deriving a `FormatId` from stored dimensions to look it back up
  would be a lossy round-trip for no reason. Fresh composition resolves a
  `FormatId` to that shape via `formatById` at the call site instead.
- Deferred: auditing every graphic language's `grounds`/`slots` scale ranges
  per format (the new `wobble-frame`/`scallop-frame` insets, decor `scale`
  fractions, etc. are all width-relative and looked fine in this pass's
  renders, but weren't exhaustively swept the way topology recipes were).

---

## 2026-08-05 — A thicker motif/frame vocabulary, and a real onDark bug it exposed

User feedback, with four reference posters (a halftone vintage bazaar flyer, a
Y2K/Memphis grid, a kawaii doodle scrapbook page, a festive birthday card):
the range of decoration was too thin to reach any of them. Investigation
(`docs/GAP-ANALYSIS.md`'s own "Working order") confirmed the gap was real —
11 motif icons, one rectangular frame/plate shape — not imagined.

### Added
- **11 new hand-authored motifs** in `src/components/shapes.ts` (`star`,
  `heart`, `flower`, `lightning`, `balloon`, `gift`, `bunting`, `confetti`,
  `speech-bubble`, `rainbow`, `smiley`), same pattern as the existing 11: pure
  path math, no bundled icon set. `flower`/`rainbow` reuse `ellipsePath`/
  `archPath` rather than inventing new construction.
- **Two new frame ground kinds** (`wobble-frame`, `scallop-frame` in
  `src/core/decor/ground.ts`), modeled directly on the existing `block-frame`:
  a ring region (outer path minus inner path, evenodd), just with the outer
  edge drawn by two new path generators (`wobblyFramePath`,
  `scallopedFramePath` in `shapes.ts`) instead of a rounded rect. Framing the
  whole page turned out to belong with ground, not decor — a ring's bbox is
  nearly the whole canvas, which is structurally incompatible with the
  decor-item keep-out/budget system (tried first; see Fixed).
- **`plateShape` on `headline-block`** (`rect` / `pill` / `ribbon`) — the
  `plate`/`band` treatment can now set type inside an oval or a banner, not
  only a rectangle.
- **Two new graphic languages**, `kawaii-doodle` and `festive-scene`, plus
  extended `halftone-pop` (optional `scallop-frame` ground) and
  `geometric-memphis` (a `star`/`lightning`/`flower`/`smiley` motif slot) —
  wired into `botanical-celebration`'s art direction so the sampler can
  actually reach them, per the 2026-08-02 lesson that an unreachable option
  might as well not exist.

### Fixed
- **The `plate` headline treatment drew one background block per line**, so a
  wrapped headline came back as a staircase of different-width rectangles
  instead of one plate hugging the block. Rewritten to size one plate to the
  widest line and set every line's `text-anchor` against it.
- **A ring ground region's bbox lies about its own coverage, and two separate
  systems believed it.** `GroundRegion.bbox` is a ring's *outer* rect —
  necessary for the `region()`/`markOnDarkFromGround` overlap math generally,
  but for a ring shape that outer rect is nearly the whole canvas even though
  the actual ink is a thin band at the very edge. Two consumers took that bbox
  at face value: `markOnDarkFromGround`'s per-box coverage check, and (the
  real culprit, found only by rendering and looking) the solver's tone field
  (`solver.ts`'s `tone.paintFlat(region.bbox, region.fill, 0.9)`), which
  tinted the *entire* interior at 90% opacity for any ring, flipping ordinary
  headlines to white on a light page. This was latent in the pre-existing
  `block-frame` ground kind too, just apparently never rendered and eyeballed
  closely enough to notice. Fixed with `GroundRegion.excludeFromCoverage`,
  set on ring regions, checked at both call sites.
- Confirmed via first attempt at a fix, which was wrong: capping a decor-item
  "frame" DecorForm's inset at the canvas safe margin does not keep it away
  from content — a *smaller* inset sits closer to the true edge and is safer;
  a larger one moves the line inward, toward content. Abandoned that
  DecorForm approach entirely in favor of the ground-ring approach above,
  which sidesteps the keep-out system rather than fighting it.

### Decisions recorded
- A full-page frame is architecturally a ground concern, not a decoration
  item: ground is drawn first, exempt from the per-item keep-out/budget
  caps, and a ring's true ink can't be expressed as the one `Rect` a
  `Decoration.bbox` requires. `block-frame` had already established this
  pattern; the new kinds extend it rather than inventing a competing one.
- Deferred: multi-size/format support (`docs/ROADMAP.md` L1) — a separate,
  larger change (new `Format` dimension, REST/MCP surface, per-format recipe
  audit) tracked as the next piece of this same request, not folded in here.

---

## 2026-08-02 — Twenty-eight invisible components, and components the agent builds itself

User feedback on real output: the flyers repeat. "It kept that on side that
circular things" — every flyer coming back with the same component, no density,
no creativity, and no way for the agent to make something for a request that has
no component.

The cause was measured, not guessed. **The library had 35 components. Seven had
a `visual` block. The agent picked from the seven it could see** — and of those,
`photo-cluster` was listed first in the guide, described twice, and given the
most vivid prose, so it won nearly every time. Nothing was wrong with the
sampler, the ranking or the model. Twenty-eight components were unreachable
because nobody had written down what they look like.

### Added
- **`visual` on all 35 manifests, and the field is now required** — shape,
  natural aspect, density, `carriesTone`, and one line describing the finished
  thing as a viewer sees it. `test/unit/anchors.test.ts` fails the build if a
  component ships without one. A component nobody can picture is a component
  nobody will ever choose.
- **`composed-figure`** (`src/components/figure.tsx`) — a component the agent
  assembles for one flyer and throws away: up to eight parts (motifs, shapes,
  cut-out photos, short words), each placed *relative to the figure or to
  another part*. Answers two complaints at once. The one-off ("a balloon at the
  top right") will never get its own component because it is wanted exactly
  once. And density: Gate G3 counts elements, not marks, so a page could only
  hold seven things and output stayed sparse — one figure is one element
  carrying eight parts, so the page gets busy while the gate stays as strict.
- **Relational placement resolver** (`src/core/layout/anchors.ts`) — named spots
  (`top-right`), named sides (`top-right-of`, `above`, `on`), named gaps and
  sizes; topological ordering so parts can be declared in any order; cycles
  rejected rather than silently half-applied. `Anchor` has **no numeric escape
  hatch** and a test asserts it never grows one — that is what keeps this inside
  law 1. A relationship survives the figure moving; an `x: 812` was true once.
- `npm run sheet:figures` — one flyer per arrangement, no model calls.

### Fixed
- **Depth-of-field blurred flat vector art.** Blur was applied from depth alone,
  so a full-bleed drawn figure came back with every motif smeared. Softness
  reads as distance on a photograph and as a broken export on a drawn shape,
  which has no focal plane to be outside of. Blur is now gated on the element
  actually carrying an image; haze still applies to everything.
- **A new drawing component reintroduced the exact bug the canvas tone field
  exists to prevent.** The field only knew about photographic components, so the
  first composed figure under a line of type put solid accent behind grey text
  and nothing measured it. `figureInk()` resolves the parts and declares its
  rects to the field before rendering. **General rule: anything that puts ink on
  the canvas must tell the tone field, or the canvas model is lying.**
- **Corner anchors did not actually straddle their corner.** The gap is a
  fraction of the figure, so on a small part it exceeded the part's half-width
  and pushed it fully outside — turning "badge on the corner" into "badge
  floating beside it". Caught by a test, not by eye. Backoff is now capped
  against the part's own extent so some overlap always survives.
- **Guide anchoring.** `photo-cluster` was listed first and described twice; the
  section is now neutral and states the repetition failure explicitly.

### Also — the example was teaching the wrong flyer

`get_composition_example` is the highest-leverage text in the system: the
instructions tell agents to fetch it and copy it, and an agent copies structure
far more faithfully than it follows prose. There was **one** example — a
photograph, a paragraph and a button, four elements, lots of paper — and it had
**no test at all**. That shape is precisely what real output kept coming back
as.

- **Two examples now**, `photo-led` and `assembled`, with `useWhen`,
  `elementCount` and `fitsDensity` on each. One example is copied as a
  template; two are compared as a range.
- **`test/acceptance/examples.test.ts`** composes both through the real route.
  It found three bugs immediately, none of which was visible by reading:
  - **No fixed element count is valid for every assignment.** Quiet tops out at
    5, rich starts at 6, so the published example was rejected outright by some
    lineages — the exact "guessed the shape and burned attempts" failure the
    example exists to prevent, caused by the example. The two are now
    deliberately different sizes (5 and 6) and cover all three densities
    between them, and `elementBudgets` is published alongside.
  - **The assembled example failed Gate G6.** It showed a date and a meeting
    point with no `sourceStatements` to back them. The gate was right. A
    published example that quietly fails a gate teaches the shape *and* the
    mistake, so the test now asserts every code-checked gate passes.
  - **G6 matches detail values verbatim**, not by meaning — "Sat 17 June, 10am"
    against a user who said "Saturday the 17th at ten" fails, and should, since
    paraphrasing a date is how wrong dates get printed. Now stated explicitly
    in the notes rather than left to be discovered.

### Known gap
A small text box straddling a hard edge — half over a dark mark, half over pale
paper — still takes one ink for the whole box, so neither half is right. Scrims
solve this for photo plates; a partial-coverage figure has no equivalent yet.

---

## 2026-08-01 — Hard photo edges and a diluted "handmade" register

User feedback on a real run (`output/nepal5/`): the grid layout's photos butted
together with raw rectangular clips, and the overall output read as controlled
rather than human-made next to reference Canva templates (rotated/taped photo
stacks, torn paper, stickers/badges, loud marker type). Investigation found both
were structural, not bad luck — fixed here:

### Fixed
- **`photo-grid` shipped with `radius: 0` and no shadow**, the one evidence
  component with no edge device of its own (every sibling — `masked-image`,
  `photo-hero`, `polaroid-stack`, `torn-photo` — bakes one in). Default radius
  raised to 10 and each cell now casts the same soft drop-shadow `polaroid-stack`
  uses, so grid cells stop reading as a raw clip.
- **`crafted-collage` and `botanical-celebration` art directions had the right
  materials/graphics but no pull toward the components that sell the look.**
  `ArtDirection` gained an optional `preferredComponents` field; the Composer
  prompt now names the preferred evidence component(s) ahead of the full
  catalogue instead of leaving the art-direction brief as the only signal.
- **The font set had no loud handmade register** — only 2 of 15 pairs were
  script, and both competed with 5-6 cleaner alternatives for the same
  material+typography combo. Added `permanentmarker-nunito` and `bungee-inter`
  (new families fetched via `npm run fonts`), scoped to the collage-adjacent
  materials.
- **`paper-collage` and `sticker-sheet` graphic languages drew only generic,
  mostly-faint marks** (a torn edge, a blob, a ribbon, two sparkles) — nothing
  as confident as the tape/badge vocabulary in the reference. Added `tape` and
  `badge` `DecorForm`s (`scallopedCirclePath`, `tapeStripPath` in
  `src/components/shapes.ts`) and wired one `solid`-weight slot of each into
  the two languages.

### Decisions recorded
- Left the asset-transform pipeline (`src/core/images/transform.ts`) opt-in
  only, as designed — the edge-treatment fix belongs in component defaults,
  not in forcing every asset through a transform before it can render.
- Did not pad existing dimension counts (metaphors/topologies/gestures/etc.)
  as a diversity fix — the real gap was coherence between an art direction's
  intent and what actually rendered, not headcount. `AGENTS.md` law #2 ties
  diversity work to fixing the sampler/creative data for a reason.
- Fixed stale doc counts caught while establishing ground truth for this
  change: `docs/ARCHITECTURE.md` §4 claimed ~460,000 designer profiles from
  an unrestricted 6-dimension product and omitted the graphics dimension
  entirely; the actual art-direction-gated 7-dimension `PROFILE_SPACE` is
  ~47,000 (already correctly asserted in `test/unit/sampler.test.ts` — only
  the prose was wrong). Topology count corrected 10 → 14, color-logic 8 → 10.

---

## 2026-07-31 — Milestone-3 gap closure (structure, gates, selection)

The sameness diagnosis was structural: independent dimension sampling, safest-passer
selection, thin gates, and unused canvas awareness. Closed in this change:

**Art directions.** Sampler rolls inside coherent families
(`src/creative/artdirections.ts`), filtered by brief `archetype`. `PROFILE_SPACE`
counts only allowed combinations (~47k), not the old contradictory Cartesian product.

**Comparative selection + outer restart.** Among gate passers, a vision jury
(`src/core/select/`) picks the most authored candidate; vision-budget exhaustion
falls back to least-revised. If the first lineage set produces no passer,
`MAX_OUTER_RESTARTS` (default 1) samples a fresh set.

**Gate correctness.** G2 builds a masked critique crop (`maskForCoverTest`) over
logo + headline. G6 checks `provenance.userStatements` for details and numeric
claims, not only slogan regex.

**Canvas placement.** Solver consults `quietZones` when nudging type; tone-field
scrims are sized to the protected text.

**DR-1 precheck.** `npm run diversity` batches independent jobs, writes a contact
sheet, and flags structural/perceptual duplicates before the human grouping panel.

Docs: `SCHEMAS.md`, `ARCHITECTURE.md`, `GAP-ANALYSIS.md` updated to match.

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
