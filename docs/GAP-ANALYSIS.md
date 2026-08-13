# Why our posters still read as generated — the 20% mark

Written after comparing our `save-trees` output against ~60 Canva travel and
save-the-trees templates the user supplied. **This is the working document for
the improvement loop. Do not delete it; update it as items are closed.**

The user's verdict: "before I said 5 percent, now I would say you are not just
20% close." And the sharpest line, which is the real brief:

> the message can come from the visual as well — that is important, not just
> from the text for a human to read

Our flyer says its message **only in words**. Every reference says it **in the
picture first**, and the words confirm it.

---

## What the references actually do that we cannot

Ranked by how much of the visual gap each accounts for.

### 1. The image *is* the poster — not an inset

"SAVE OUR FOREST", "TREE", "LET'S PROTECT THE FOREST", "Beach Vacation",
"Discovering Athens", "Book a trip to Marocco": a full-bleed photograph fills
the canvas and enormous type sits **on** it. The photo is the ground, not an
element in a column.

Ours: three small circles floating in a sea of near-white. The photograph is a
guest in the layout instead of being the layout.

### 2. The canvas is *full*

Count the objects in any reference: 12–30. Ours: 7, and roughly 60% of the page
is empty. Our largest-empty-band test passes at 14% because it measures *rows
containing any box* — a metric that a single narrow column satisfies. It does
not measure **coverage**, and coverage is what the eye reads as "designed".

**We have no density floor at all.** This is the single biggest measurable gap.

**Measured 2026-07-31** (ink coverage of the rendered PNG, modal colour = ground):

    oversized-anchor        45.1%   <- photo bleeds full canvas
    layered-depth-stack     43.4%   <- photo bleeds full canvas
    vertical-narrative      30.7%
    framed-evidence         26.1%
    radial-field            23.1%
    diagonal-progression    21.5%
    asymmetric-two-column   18.6%
    zigzag-path             17.8%
    off-center-hero         15.3%
    split-editorial         13.9%
    ------------------------------
    mean                    25.6%   vs references at 55-80%

The two topologies that come closest are precisely the two where a photograph
covers the whole canvas. That is the proof for item 2 below: **coverage comes
from the image being the ground**, not from adding more ornament. Chasing this
number with decoration would produce clutter; chasing it with full-bleed
imagery and committed colour produces posters.

`.scratch/tmp/coverage.ts` is the measuring script. Re-run it after every
change and record the mean here.

### 3. The palette commits

Nearly every save-trees reference is *green* — a saturated field edge to edge,
or large green blocks. Ours is near-white with a green accent. A palette that
commits is what makes a poster feel authored; ours reads as a document.

Grounds exist in the engine but came out `flat` on the real run.

### 4. Small text distributed across the canvas

Dates, locations, times, URLs, phone numbers, "JOIN NOW" badges, bullet lists,
package prices, "@handle". The references place 4–10 small text objects around
the composition. We place five things in one left column.

**This is the architectural tension**: G3 caps `spec.elements` at 4–7, and the
references carry 15–30 visual objects. The resolution is *not* to raise G3 —
it is that one element should be able to carry a **cluster** of related small
text (an event block with date + place + time; a footer with url + phone +
handle). One element, one reason to exist, several lines. G3 stays honest.

### 5. Illustration, not only photography

Half the save-trees references are flat vector illustration — people planting,
children, a globe, a hand holding a seedling. We have `motif-collage`, which is
a single icon plus abstract shapes. It cannot draw a *scene*.

### 6. Type set inside shapes

"SAVE THE EARTH" inside a cloud. Words on coloured bars. Text in a ribbon.
Ours only ever sets type on the open page.

### 7. Frames that wrap the whole composition

Leaf borders, corner ornaments, full-perimeter rules. Our decoration places
marks *near* corners; it never frames the page as a unit.

### 8. Type does the heavy lifting

"TREE" fills the full width. "SAVE OUR FOREST" is enormous, stacked, tight.
Our headline is large but sits in a 46%-wide column with air around it.

---

## What is already right and must not be broken

- Deterministic rendering, golden byte-identical SVG, editability.
- The Six Gates and the honest `below_bar` path.
- Keep-out zones and the clutter budget — density must be *earned*, not bought
  by letting ornament trample type.
- `editorial-restraint` staying quiet: not every brief wants a loud poster.

The failure mode to avoid while fixing this is obvious: turning every flyer into
a cluttered mess and calling it density.

---

## Progress log

### 2026-07-31 — item 2 (photo-as-ground) landed

`TopologyRecipe.photoGround` added and set on four of ten topologies
(diagonal-progression, oversized-anchor, layered-depth-stack, off-center-hero).
When the evidence element is photographic and the topology opts in, the photo
stops being an element in a column and becomes the page.

**The measurement was wrong first.** The original coverage script used the stock
fixture, whose evidence is a document card — so it reported 25.6% while never
exercising the photo path it was meant to judge. Re-measured with a real
photograph in the evidence slot:

    before photoGround, with a photo   : ~40% mean
    after  photoGround, with a photo   : 63.5% mean (photoGround topologies 95-98%)
    after the legibility fix           : 50.4% mean

The drop to 50.4% is a metric artifact, not a regression: the scrim darkens the
photograph toward a single tone, so more pixels cluster near the modal colour
and get counted as "ground". The page is still covered. **Do not chase this
number back up** — see below.

**Coverage bought illegibility, exactly as predicted.** White type over a bright
forest canopy was unreadable while the flyer still passed every gate, because
nothing in the system knows a photograph's luminance. The existing scrim was a
directional gradient over 42% of the plate — fine for a photo *plate*, useless
when the photo is the whole page and type can land anywhere.

Fixed with `scrim: "full"`, an even wash chosen by the solver whenever the plate
covers >=92% of the canvas and carries text on more than one side.

**QR bug found and fixed while looking at the output.** On a photographic
ground `inkFor` returns white, and the QR backing was `theme.palette.bg` — so
the modules were white on a near-white plate. The code was **unscannable**, and
rendered as a blank square. No gate could catch it: contrast is only ever
checked for text, and a QR is not text. Modules and backing are now a fixed
`#111111` on `#ffffff` pair with an explicit quiet zone, independent of theme.
A test asserts the pair.

**Still open from this item:**
- Some CTAs still land dark-on-dark (`off-center-hero`, `diagonal-progression`).
  `onDark` is set per box from *plate* coverage; the CTA button draws its own
  fill and does not consult it.
- The contrast gate cannot see any of this: it compares against ground *fills*,
  and a photograph has no fill. A photo-aware contrast check needs the image's
  mean luminance, which `AssetAnalysis` may already carry.

**Update (2026-08-05):** both superseded by the later tone-field consolidation
(see "the structural gap, named and started", below) — confirmed by reading
current code, not assumed. `cta-button`'s non-solid styles, `eyebrow-label`,
and `footer-lockup` all already call `inkFor`/`mutedInkFor`. The contrast
gate's per-element loop (`gates/index.ts`) already checks
`layout.tone.legibleFor`, which does see photographs (`ToneField.paintPhoto`).
A fresh sweep for the same pattern (any component filling text with a raw
`theme.palette.*` instead of `inkFor`/`mutedInkFor`) found two real remaining
instances, both fixed: `score-ring`'s value and label text
(`components/evidence.tsx`) and `waypoint-marker`'s label
(`components/structure.tsx`) — both roles include `support` or `evidence`,
so both are gate-checked and both drew directly on whatever ground sits
behind them with no self-established background. Left as-is, deliberately:
`ui-fragment`'s secondary line and `chat-exchange`'s bubble text, which both
sit on a `Panel` the same component paints with a known fill, and
`rule-line`'s label, which is `role: "structure"` only and therefore outside
the gate's per-element check entirely — real but lower-stakes, decorative
rather than primary content.

### 2026-07-31 — item 3 (commit the palette) landed

Measured first: **7 of 8 colour logics produced a near-white ground** (84-93%
luminance). Only `inverted-dark-field` departed. That is why output read as a
document — the palette never committed, while every reference poster is a
saturated field.

Two new colour logics:

- `saturated-field` — the ground IS the brand colour, mid-dark and genuinely
  saturated (measured 73%), white type straight on it, one lifted accent.
- `colour-block-duo` — two committed colours on a hard edge.

Palette space is now 10 logics, 4 of which commit. Verified by eye on a
ground-visible topology: `saturated-field` reads as a real poster.

**Note for the next pass:** palette commitment is invisible on `photoGround`
topologies, because the photograph covers the page. The two levers are
complementary, not additive — photo-led briefs get coverage from the image,
non-photo briefs get it from the ground. Test both.

**Three bugs found by looking at the renders:**

1. `photo-hero` grew to its intrinsic height and pushed down through the
   headline. The "content decides height" rule was added for *text* — a
   paragraph must not be squeezed — but a photograph can simply show less of
   itself. Photographic components are now excluded from that growth.
2. Collision resolution compared raw rects, so a rotated element's corner could
   overlap unseen. Added `footprint()`; collisions and their separation
   arithmetic now use it.
3. The text-safety rule allowed an occluder into the bottom 40% of a text box as
   a "deliberate interlock" — but for a two-line headline **the bottom 40% is
   the second line**. Now measured against the last baseline: an occluder may
   enter the descender space, never the line itself.

**Still not right:** on `framed-evidence` the tilted photo still grazes the
headline's final line by a few px. Geometry says it clears the descender by
~18px unrotated and ~4px rotated, so the remaining artefact is marginal and
probably an ink-extent question rather than a box question. Not worth more time
before the larger items.

### 2026-07-31 — item 4 (text clusters) landed

`copy.details` added to the contract (max 6 labelled facts) plus a
`detail-cluster` component rendering them as a row, column or grid with
dividers.

This is the density fix that **keeps G3 honest**. The references carry 12-30
visual objects; our budget is 4-7 elements and G3 counts elements, not words.
Raising G3 would gut the restraint the product is built on. Instead one element
carries a cluster: "Sat 17 June", "Kestrel Park" and "Gloves & water" are one
idea — when and where — not three.

**First end-to-end test with all three levers together** (photo-as-ground +
committed palette + detail cluster), across three unrelated briefs — trees,
travel, a bakery — in `output/posters-v2/three-briefs.png`. These read as
posters rather than documents. Testing one brief would have proved nothing;
three different subjects with different palettes and topologies is the check
that the change generalises.

**Honest remaining gaps at this point:**

1. The eyebrow has gone invisible on photo grounds — drawn, but too dark
   against the scrimmed image. Same root cause as the QR bug: components pick
   ink without knowing what they are sitting on. **Superseded (2026-08-05)**:
   `eyebrow-label` now calls `mutedInkFor` — confirmed by reading current
   code, see the ink-consultation sweep under item 2's "Still open" note,
   above.
2. `detail-cluster` labels are too small and too quiet to read at poster size.
3. `scrim: "full"` dims the *whole* photograph, which reads slightly muddy. The
   references keep the image bright and either place type in a naturally quiet
   region or use a partial gradient. A smarter scrim would sample the image.
4. Ornament is invisible on photo-ground topologies — expected, since the photo
   covers the page, but it means the graphic language does nothing for exactly
   the briefs that look best. Ornament should sit *over* the photo there.
   **Closed (2026-08-05).** Root cause confirmed by reading `keepOutsFrom`
   (`decor/decorations.ts`): every evidence element gets a zero-tolerance
   keep-out, and a `photoGround` evidence element's box *is* the canvas — so
   the keep-out covers 100% of the page and no decoration, at any size or
   position, could ever clear it. A first attempt at a small fixed exemption
   (`overAllowance: 0.12`) still failed every case: `covered` is computed as
   a fraction of the *decoration's own area* overlapped by the keep-out, and
   a decoration entirely inside a full-canvas keep-out is ~100% covered, not
   partially — no small number ever clears that bar. Fixed by exempting
   `layer: "over"` decorations from the evidence keep-out entirely
   (`overAllowance: 1`) specifically when that evidence element fills
   ≥92% of the canvas in both dimensions (the same threshold `solver.ts`
   already uses for `coversPage`), while `under`/`with` stay zero-tolerance —
   a badge or a sparkle sitting on top of a photo is a normal design move,
   ornament crowding it from behind or beside it is what actually costs G2,
   and the global clutter budget (`MAX_OVER_ITEMS`, `MAX_INK_COVERAGE`) still
   caps how much can appear either way. Verified: `festive-scene`'s
   `bunting-string` (an `over` slot) now places on every one of 8 tries on
   `diagonal-progression` (a `photoGround` topology), versus zero before.
   New unit test in `decorate.test.ts` covers the exemption directly; the
   existing "never intrudes on a keep-out" test (which iterates every
   graphics×topology pairing) was blind to this the whole time — its fixture
   defaults to a non-photographic evidence component, so it never actually
   exercised the `photoGround` path despite looking comprehensive. Now
   updated to account for `overAllowance` so it stays a true invariant if
   that fixture ever changes.
5. Type is still smaller than the references, which set headlines enormous.
6. No colour blocks or badges over the image — a common reference device.

### 2026-07-31 — the structural gap, named and started

Every visual bug in this project has been the same bug: **nothing knows what is
already on the canvas**. A component gets a box and a theme and draws blind.
The invisible eyebrow, the unscannable QR, white type on a bright canopy, a
treeline growing through the detail cluster, the contrast gate comparing against
a background that a photograph has covered — one cause, patched five times.

Design doc: `docs/CANVAS-MODEL.md`. The reframing that produced it: *design as
though you cannot see the output — what would you need to be told?* The answer
is a queryable model of the canvas, consulted before drawing rather than a PNG
inspected afterwards.

**Landed: the missing measurement.** `computeToneMap` records an 8x8 grid of
mean relative luminance for every uploaded or imported image, using sRGB luma
weights (a flat channel average calls a green canopy far darker than the eye
does). Deterministic, free, no model call, stored on the asset beside `palette`.

Measured on the forest canopy used in these tests: mean 0.45, range **0.21 to
0.72**. The bright band across the middle is exactly where white type failed —
and a mean would never have revealed it. This is the fact whose absence made
every photo-related bug possible.

**Landed: the tone field.** `src/core/canvas/tone.ts` — a coarse grid (~90px
cells) painted in the renderer's z-order from the ground, its regions and
gradient, and every ground-covering element. Queries: `sample`, `inkOver`,
`legibleFor`, `quietZones`.

Consolidated onto it:

- **Ink** (solver pass 8.55) — one check replacing five patches. Instead of an
  `onDark` boolean inferred from plate *coverage*, ink is chosen against the
  measured luminance beneath each box.
- **The contrast gate** now reads the same field the solver used, so it cannot
  disagree with the picture it is judging. It also weighs *busyness*: fine type
  over leaves is unreadable at 21:1, which a contrast ratio alone cannot see.
- **The old plate-coverage pass** kept only the scrim decision. Left running it
  overwrote the measurement with the guess — a scene at luminance 0.57 was
  still being told it was dark.

**Two distinctions the work forced out:**

1. *Ground-capable* is not the same as *photographic*. A drawn scene can fill a
   bleed slot, but its colours are known; treating it as an unmeasured image
   made the field report "mid grey and busy" across a composition the engine
   had complete knowledge of, and the gate then failed legible elements.
2. An image with **no** tone map is treated as hostile, never optimistically
   legible. Unknown brightness must not be assumed friendly.

Tests 156 -> 167, including a synthetic gradient proving `computeToneMap`
reports real spread rather than a mean.

**Closed since:** the solver now consults `quietZones` when nudging type into
calmer tone regions; scrims are sized to the text they protect via the
tone-field loop. Decoration still do not fully avoid busy areas — that remains
open and lower priority than grammar / sampling / selection.

### 2026-08-01 — the sameness is structural, and half of it is the agent's fault

Five posters side by side (`.scratch/tmp/all.png`) share one skeleton:

    eyebrow (small caps, top) -> headline -> evidence (middle)
    -> detail row of three facts -> CTA + underline -> brand (bottom)

Only the image, font and colour change. Two causes, and the first is not the
engine's:

**1. The agent authored the same spec every time.** Same six elements, same
roles, same order, on every brief. The library has 30+ components and one
composition was used repeatedly. The skills now tell an agent to vary this, but
nothing *checks* it.

**2. The composition grammar itself is fixed.** Every topology maps roles to
slots in the same narrative order — eyebrow, message, evidence, support, cta,
brand, top to bottom. Recipes move slots around; they never reorder the story or
change which roles exist. There is currently no way to express:

- no eyebrow at all
- the headline at the *foot* of the page
- banded structure: a colour band top and bottom holding contact details
- two or three stacked sections, each icon + heading + body
- giant type filling the page with no image whatsoever
- a bordered frame wrapping the whole composition
- a centred symmetric stack

The reference posters vary in **structure** — element count from 3 to 12,
different roles present, different reading orders — not in styling. Our variety
is styling on a fixed skeleton, which is why ten graphic languages still read as
one poster.

**The fix is not another topology.** Ten more recipes with the same role order
produce the same skeleton in ten new positions. What is needed is *composition
grammars*: alternative role-to-slot mappings, optional roles, and structures
(bands, frames, sections) that are not "one column of six things".

### 2026-08-01 — composition grammars, first four

The first ten topologies all told the story in the same order: eyebrow,
message, evidence, support, cta, brand, top to bottom. They moved rectangles;
they never changed *which roles appear* or *where the story starts*. That is why
ten graphic languages still read as one poster.

Four topologies that change the grammar rather than the coordinates:

- `banded-masthead` — bands at head and foot hold the label and the facts; the
  middle belongs to the subject and one large line. The story starts mid-page.
- `type-poster` — the words *are* the poster. Headline ceiling 0.24 against
  0.10-0.135 for every other recipe; the image is a footnote in the corner.
- `section-stack` — three bands of equal weight. The explainer, not the
  announcement: support carries the argument rather than captioning it.
- `framed-centre` — a border wraps the page, everything centres. The invitation
  and the notice.

Verified by rendering them beside `vertical-narrative` and `off-center-hero`
with identical content: the structures genuinely differ.

**Open, and honestly not solved:** on some topologies the headline's last line
still meets the photograph's top edge. Pass 7.5 (protect the last baseline) was
first exempted for any declared relationship — too broad, since a rectangular
photo cutting a word reads as a bug, not weaving — then narrowed to
`SHAPED_COMPONENTS` only, on the principle that the eye completes letters behind
a silhouette but not behind a straight edge. That narrowing did not change the
render, so the remaining artefact has a different cause and I stopped guessing.
Next session: dump the geometry rather than hypothesise, as with the connector.

### 2026-07-31 — audit items closed (structure before more polish)

Landed in code (unit/acceptance covered; live DR-1 still needs the human panel):

1. **Art directions** — sampler rolls inside coherent families
   (`src/creative/artdirections.ts`), filtered by brief `archetype`. Profile
   space is smaller (~47k coherent positions) because contradictory Cartesian
   products are no longer counted as designers.
2. **Comparative winner selection** — `src/core/select/` jury among passers;
   deterministic least-revised fallback when vision budget is gone.
3. **Bounded outer restart** — `MAX_OUTER_RESTARTS` (default 1) when the first
   lineage set produces no passer.
4. **G2 masked cover crop** — `maskForCoverTest` overlays logo + headline
   before the vision ask.
5. **G6 provenance** — `spec.provenance.userStatements` retained from the brief;
   details and numeric claims must appear there.
6. **quietZones placement** — solver nudges type into calm tone regions.
7. **Rendered diversity harness** — `npm run diversity` batches independent jobs,
   builds a contact sheet, and flags structural/perceptual duplicates before the
   three-person DR-1 grouping panel.

**Still open (do not pretend these are solved):**

- Headline/photo edge collision on some topologies (geometry dump, not more
  heuristics).
- Coverage floor as a mechanical check; type-in-shapes / full frames / scene
  illustration from the original working order.
- Decoration avoiding busy tone cells.
- The human DR-1 panel itself — the harness prepares it; it does not replace it.

### 2026-08-01 — first Nepal run through the real API: three defects

Driving the API as an agent (assignment -> skills -> search -> import -> compose
-> render -> review) surfaced three faults the test suite could not.

**1. `LayoutResult.tone` did not survive storage.** `tone` is a class instance
and the job store persists layouts as JSON, so every path that reloads one — the
review endpoint, the reviser — threw `layout.tone.legibleFor is not a function`.
Fixed with `rehydrateTone`. The general rule this exposes: **anything placed on
`LayoutResult` crosses a storage boundary**, so it must be plain data or be
explicitly rebuilt. A class on that type is a latent 500.

**2. G6 cannot see component props.** **Closed (2026-08-05).** The provenance
check inspected `copy` and correctly rejected three invented `details`
("Kathmandu", "Annapurna", "Oct to Apr") — good. But an invented claim placed
in a component prop (`annotation-label.text = "Sunrise is at 5.40am"`) reached
the page untouched. Props are a hole straight through the no-invented-facts
law, and props are exactly where an agent puts short factual text. Fixed by
walking every string nested anywhere inside every element's `props`
(`collectStrings` in `gates/index.ts` — recurses through objects and arrays,
so `composed-figure`'s `parts[].draw.text` is covered too, not just a flat
component) through the same slogan/hollow-word and unsupported-statistic
checks `copy` already gets. `STAT_CLAIM_PATTERN` also extended to catch
time-of-day claims ("5.40am", "10pm") — the exact shape of this bug's own
example, which the existing %/×/thousands-separator pattern would have
missed entirely.

**3. Reported collisions do not block `done`.** **Closed (2026-08-05).** The
review endpoint accepted a verdict listing three collisions and still returned
`status: done`. A collision is a defect the agent has *seen*; it must at
minimum force a revision rather than being recorded and ignored. Fixed:
`gates/index.ts` now derives `mechanical.noCollisions` from
`vision.collisions.length`, so a non-empty collisions array fails `passed`
the same way any other mechanical check does, rather than only reaching
`notes`.

Poster faults worth fixing separately: the `plate` treatment renders one plate
per line, so a three-line headline becomes a ragged staircase (it should be one
plate, or a set of aligned ones); an evidence cutout overlapped that plate; and
the brand lockup drew light-on-light because `footer-lockup` picks ink without
consulting the tone field — the fourth component to do this.

### 2026-08-05 — a real agent run, watched end to end: what actually broke

Drove a full session as an external agent (Claude via the MCP connector) on
a genuinely different brief — "Luma Journal," a kawaii-scrapbook journaling
app — using the new motif/frame/format work from earlier today. The agent's
*process* was good: it read the guide, evaluated all four sampled designers
against the brief instead of grabbing the first one, resampled when none fit,
caught its own "this reads like a mandala, not a doodle" mistake mid-session
and reworked it, and verified with the judge tool before calling it done.
The *output* still fell well short of the four references. Traced each gap
to a specific cause rather than leaving it as a vibe:

**1. The agent could never reach `kawaii-doodle` — the wobbly-frame language
added earlier today.** It picked `crafted-collage` as the closest existing
match for "hand-drawn collage," which is a reasonable read of what it could
see. But `crafted-collage`'s `graphics` list is
`["paper-collage", "sticker-sheet", "organic-blobs"]` — `kawaii-doodle` was
only wired into `botanical-celebration`. Same failure this file has already
named once (`GAP-ANALYSIS.md`, 2026-08-01: "half the agent's fault, half a
reachability problem") — an option nobody can reach might as well not exist.
**Open**: wire `kawaii-doodle`/`festive-scene` into `crafted-collage` too.

**2. No colour-logic generator produces a genuine multi-hue pastel palette.**
Checked all ten in `src/creative/colorlogic.ts` — every one is single-accent,
duotone, or one saturated field. Even a run that *does* reach `kawaii-doodle`
cannot currently land on the soft pink/lavender/mint mix "kawaii" implies.
**Open**: a pastel/multi-accent generator is a real gap, not a sampling miss.

**3. Motifs rendered as flat single-colour silhouettes — a real product gap,
not a taste difference.** The reference posters' balloons and gifts have
visible sheen and shading; ours were flat icon marks. Traced this to
`figure.tsx`: `case "photo"` already used the flyer's one light
(`shadowFor`, `src/core/canvas/light.ts`) for a contact shadow; `case
"motif"`/`case "shape"` did not — pure omission, the mechanism already
existed. **Closed today**: both cases now take an opt-in `shaded: boolean`
(default false, so nothing existing changes) that adds a highlight-to-shadow
radial gradient keyed off the same light plus a contact shadow. Deliberately
*not* raster stickers or AI-generated images — considered both and rejected:
neither is recolourable (this needs to be, since the whole point is an agent
picking a theme accent and the object matching it), a pre-lit raster sticker
fights the single-light system instead of joining it, and a bundled icon/
sticker pack is exactly what `shapes.ts`'s own header already rejects for
licence and house-style reasons. **Open**: nothing currently *chooses*
`shaded: true` — no graphic language or skill guidance points an agent at it
yet, so it's reachable but not yet surfaced any better than the 28 invisible
components were before their `visual` field landed.

**4. The "Dear Diary" speech bubble rendered as bare floating text, no bubble
shape.** Not yet root-caused — didn't have the exact composed-figure JSON the
agent sent, and guessing would be worse than saying so. **Open**: reproduce
with a `speech-bubble` motif part paired with a `word` part and see whether
the gap is in the engine or in how an agent is guided to pair the two.

**On asset realism generally** — the question of whether decorative marks
should ever be raster (licensed sticker packs, or AI-generated PNGs) rather
than vector: decided **no for now**, vector + shading instead, for the three
reasons in point 3. Revisit only if an explicit, scoped need shows up that
shading genuinely cannot reach (e.g. a specific photographic texture no
gradient can fake) — not as a default upgrade path.

**Contributing more motifs**: drop an SVG in `src/creative/motifs/<subject>/`.
Filename is the id; `<title>`, `<desc>` and `data-tags` are how an agent
finds it; `data-tone` on every path is how a mark gets independently
recolourable regions (icing vs cake vs flame) against the flyer's palette.
Never a baked-in hex. That's different from an *asset* (a logo or a
supplied full-colour image via `POST /v1/assets`), which embeds as-is and is
not theme-recoloured. Know which one you're adding before you add it.
See `src/creative/motifs/README.md`.

### 2026-08-05 — checked two free asset sources; decided against both, for now

The user pointed at real templates' illustrated stickers (a sketched
birthday cake, a hand-drawn bow, a smiley/sparkle/thumbs-up sticker set) and
asked whether free, downloadable, keep-able versions of that register exist —
same "download once, check in, reproducible from a clean clone" pattern
`npm run fonts` already uses. Checked two real sources rather than assuming:

- **OpenMoji** — CC BY-SA 4.0, ~4,500 icons, official bulk download via
  GitHub releases (safe to automate), and it ships a single-tone "Black"
  variant that would be as recolourable as a hand-authored motif. The real
  cost: CC BY-SA requires attribution + share-alike, and this codebase
  already tracks attribution data for Pexels photos
  (`author`/`source_url`/`source` on `assets`) but doesn't currently *display*
  it anywhere on an exported flyer — meaning that gap is real today, quietly,
  even before OpenMoji enters the picture.
- **unDraw** — a much better license (no attribution required, explicit
  permission to recolour and modify, commercial use fine) — but their terms
  explicitly prohibit automated/bulk scraping and redistributing packs. A
  fonts-style bulk-downloader script would violate that even though the
  assets themselves are free.

**Decided: skip attribution-required bulk sources entirely.** Not a partial
"track it but don't show it" compromise — that would repeat the same silent
gap the Pexels integration already has. The library keeps growing by
hand-authored `MOTIF_DATA` entries (mine or a delegated AI's, same convention
as everything already there — see the prompt template in this session's
transcript, or ask for it again). If a genuinely illustrated, non-attribution
piece is wanted later, it has to be hand-picked one at a time by a human
browsing (or an agent using an actual browser, not a scraper) — never
automated against a site whose terms forbid it — and it lands as an *asset*
(`POST /v1/assets`, embedded as-is, not theme-recoloured), not a motif.

## Working order

1. **Coverage floor.** **Closed (2026-08-05).** `src/core/canvas/coverage.ts`
   measures the fraction of the canvas actually touched by an element box or
   a decoration bbox (grid membership, ground excluded, same convention as
   the decoration ink cap) and gates on it as `mechanical.coverage`, floor
   0.32 — calibrated against 40 fixture-sampled designers (lowest normal
   sample 0.386) against sparse repros (0.21-0.27). This is exactly the check
   that would catch a flyer like the "Pulse Cycle" real-world test prompt: a
   flat background, a headline, a CTA pill and two small motifs, correctly
   read as visibly empty.
2. **Photo-as-ground.** A photographic evidence element should be able to *be*
   the ground, with type over it and a legibility scrim — the single biggest
   visual change.
3. **Commit the palette.** Make saturated grounds the common case for
   photo-led and campaign briefs, not a rare roll. The pastel-generator gap
   named here is **closed (2026-08-05)** — `soft-pastel-multi` in
   `colorlogic.ts`, wired into `botanical-celebration`.
4. **Text clusters.** One element carrying several small lines, so the canvas
   can hold 12+ text objects inside a 4–7 element budget.
5. **Type in shapes**, **frames**, **scene illustration** — in that order.
6. **Reachability sweep.** **Closed (2026-08-05).** `kawaii-doodle`/
   `festive-scene` wired into `crafted-collage`'s graphics pool alongside
   `botanical-celebration`. `shaded` motifs now documented in the
   composition skill, matching how `word` fragments and `big-numeral`
   already are. The speech-bubble-with-no-shape render from the Luma
   Journal session: root-caused as far as it can be — rendered the motif in
   isolation (flat, shaded, three sizes/tones, now permanent coverage in
   `scripts/sheet-figures.ts`) and it is correct on current code. The static
   path was never the bug; this matches the already-documented class of
   failure where an LLM-authored `composed-figure` part passes a bad
   parameter (see the `sparkle` `waist` bug above) rather than the shape
   data itself being wrong. The exact failing spec from that session wasn't
   preserved, so this can't be pinned further than that.
7. **`runGates` "contrast" mechanical check failed intermittently against a
   `gradient-wash` ground.** **Closed (2026-08-05).** Root cause was exactly
   as suspected: the blanket palette check compared `accent`/`muted`/`fg`
   against `layout.ground.base` (the flat page colour), but `gradient.from`
   — painted across most of the canvas for a wash — is derived from `accent`
   itself (`mix(accent, base, t)`), so it is not guaranteed to be lighter
   than `base`, and an accent-coloured mark drawn on the wash could land on
   almost-identical territory to itself. Fixed in two places: `gates/index.ts`
   now checks against whichever of `base`/`gradient.from` actually renders
   darker, and `ground.ts`'s `gradient-wash` branch now walks its mix ratio
   toward `base` until the wash stays legible for the palette's own
   accent/muted, rather than trusting a fixed 0.62 ratio.
8. **New, found while verifying #7: `layout.tone.legibleFor` "busy ground"
   can fail even when contrast passes.** Investigated repeatedly across this
   file's history — first suspected a `scallop-frame` ring straddle, which a
   fresh geometry dump (`layout.tone.sample` + `layout.decorations` printed
   directly, not inferred from box coordinates) **disproved**: real failing
   runs showed `ground kind: flat` with no ring anywhere near the failing
   box. Wrong theories are worth correcting in place rather than left to
   mislead the next pass. Three real, distinct causes found instead, two
   fixed:
   - *Fixed.* The photo-hero full-wash scrim decision (`solver.ts` pass 8.6)
     computed its `failing` list against a hardcoded `theme.palette.fg`, not
     the ink the box will actually render in. Fixed by checking
     `inkFor(theme, b, theme.palette.fg)` instead.
   - *Fixed.* `ToneField.paintPhoto` (`canvas/tone.ts`) gave every photo cell
     a hardcoded `variance = 0.12` — the fixed 90px-grid cell size means text
     positioned within one cell of a photo's edge, even without truly
     overlapping it, inherited that photo's busy verdict regardless of what
     the photo actually showed there. A flat, calm crop of a photo read as
     busy just as often as its most detailed corner. Replaced with
     `localToneVariance`: real local spread computed from the photo's own
     measured 8×8 tone map (3×3 neighbourhood around each texel), floored at
     0.02 so a photo is never claimed perfectly flat — a photo genuinely is
     busier at full resolution than eight samples can see, just not
     *uniformly* busy the way the old constant implied.
   - *Also fixed, found while re-checking failure notes during this pass:*
     the failure message computed its displayed ratio from
     `contrastRatio(ink, sample.fill)` — `sample.fill` is a representative
     colour (the modal cell, or a hex quantised from a luminance blend) that
     can read several points higher than the raw luminance blend
     `legibleFor` actually decides on. One repro showed a note reading
     "12.12:1" for a box that was in fact failing at 4.47:1 against the real
     4.5 threshold — a near-miss dressed up as a healthy pass, and exactly
     the kind of number that sends debugging in the wrong direction (it did,
     this session, before the geometry dump caught it). Now computed from
     the same raw-luminance formula `legibleFor` uses internally.
   - *Still open, and now correctly understood rather than guessed at.*
     `composed-figure` deliberately does not paint its whole bounding box
     into the tone field — only its individual parts (`solver.ts`,
     `figureInk`), on purpose: a figure of four small marks and a lot of
     paper is not honestly a solid slab, and painting it as one would make
     every downstream scrim/ink decision wrong. But that means a large
     `size: "huge"` decorative part inside a figure (the published
     `assembled` example's own `ground` blob, `src/api/agent.ts`) can leave
     the figure's box internally uneven — some cells inked, some still bare
     page — and a headline placed over that box lands on a mix the tone
     field correctly reports as busy, because it genuinely is uneven there.
     Nothing currently protects text that overlaps a `composed-figure`
     the way `photo-hero`'s scrim protects text over a photograph. This is
     why `test/acceptance/examples.test.ts`'s `assembled` case can still
     occasionally fail `runGates`' contrast check on an unlucky topology
     roll (roughly 1 run in 5–8) — the product correctly catching a real
     defect, not a flaky test to silence. A real fix needs either a
     composed-figure-aware scrim/legibility pass, or the topology solver
     declining to let text overlap a figure box at all unless the figure
     itself reports (via `figureInk`) that the overlapped region is actually
     inked densely enough to carry it.
9. **Found 2026-08-05, while testing real prompts end to end: a real-estate
   flyer's hero photo rendered as an unrecognisable blur.** **Closed.** Root
   cause: the guide's own image-prep table (`guide.ts`) mapped "Photo to sit
   *behind* type" → the `bg-plate-blur` preset (sigma 12, meant for pure
   atmosphere — a bokeh field with no subject), which is exactly how "type
   over a real estate photo" reads on a quick pass — but `photo-hero`
   already has the right tool for that (a built-in scrim that darkens only
   the type's band and leaves the rest of the photo sharp), documented two
   sections later in the same guide and easy to miss in favour of the table
   match above it. Fixed by rewriting the table row and the preset's
   catalogue description (`transform.ts`) to name the actual failure mode —
   the subject becomes unrecognisable and fails Gate G2 — and point at
   `photo-hero`'s scrim as the correct tool whenever the photo *is* the
   evidence, which for a listing, a venue or a product it almost always is.
10. **Found 2026-08-05, same review: `headline-block`'s `plate`/`band`
    treatment — type reversed out of a solid colour block, the single device
    nearly every reference poster uses and the exact "box behind text" gap
    real user feedback named — was fully built (plate hugs each line, band
    runs full width, `plateShape` offers rect/pill/ribbon) and completely
    invisible.** `headline-block`'s own `visual.reads` line, the "LOOKS LIKE"
    text every agent reads from the component catalogue, said only "two or
    three lines of very large type" — no mention that `props.treatment` could
    draw a block at all. Same failure class as the 2026-08-02 fix that made
    28 other components reachable, just for a prop instead of a whole
    component. Closed by rewriting the `visual.reads` line. Still open: how
    often the *deterministic* sampler itself reaches for `treatment: "plate"`
    versus leaving it at the `"plain"` default is not yet measured — this fix
    only guarantees an *agent* composing by hand now knows the option exists.
11. **Found 2026-08-05, from a real rendered flyer a user flagged as broken:
    `detail-cluster`'s "column" arrangement overlapped its own rows —
    "TIME" rendered on top of "Saturday", "WHERE" on top of "9am-3pm".**
    **Closed.** Root cause: `intrinsicHeight` returned a fixed 190px total
    for "column" regardless of how many facts were supplied — a box sized
    for ~3 facts got the identical height for 4 or more, and the extra rows
    had nowhere to go. The deeper cause: `ComponentModule.intrinsicHeight`'s
    signature (`props, theme, width`) never received `copy`, so a component
    whose row count depends on `copy.details.length` structurally could not
    know it. Widened the signature to take an optional `copy` — additive,
    the other 27 `intrinsicHeight` implementations are unaffected — and
    `detail-cluster` now computes real per-row height from the actual fact
    count via a helper (`detailClusterRowHeight`) shared with `render`'s own
    `cellH` math, so the two can't drift apart the way they just had.
    Verified by rendering the exact 4-fact reproduction: clean spacing,
    zero overlap. New tests assert height scales with fact count and that
    it's always large enough for `render`'s own row-content formula.
12. **The bigger question item 11 raised: why didn't a deterministic gate
    catch the overlap, and could it have?** Traced precisely rather than
    answered in the abstract. `layout.boxes` holds exactly one box per
    `spec.element` — every gate (`overflow`, `margins`, `contrast`,
    keep-out/collision machinery) reasons at that granularity. `detail-
    cluster` is *one* element; its row subdivision is private state inside
    its own `render` function, never surfaced anywhere `layout` describes.
    So nothing code-side could see it — only the vision critic, which reads
    actual pixels, ever had a chance, and a vision verdict is a judgment call
    an agent can rationalize past (and in the live transcript that prompted
    this, did: "doesn't really constitute a collision"). **Closed**, for
    this specific component: `runGates` now imports `detailClusterRowHeight`
    directly and independently recomputes whether the box a real spec+layout
    produced is tall enough for its fact count — `mechanical.componentGeometry`,
    a genuinely deterministic, code-only check, not a rendering. The general
    pattern (expose a compound component's internal sub-layout as a
    function, not just JSX, so a gate can consult the same source of truth
    `render` uses) is the answer for any future component with this shape;
    not applied retroactively to every component without a concrete bug
    driving it, per this file's own "measured first, not guessed" discipline.
13. **Found 2026-08-05, from a second live transcript: the `hero-overlaps-
    eyebrow` gesture buried the eyebrow's own text, not just its padding.**
    **Closed.** `applyRelationshipOverlaps` (declared `spec.relationships`
    overlaps) already clamps intrusion into text via `textOcclusionLimit` —
    max 45% of a line's height or 28px, whichever is smaller, vertical only.
    The `overlap-eyebrow` gesture `apply` case never used it: `eb.y = box.y
    - eb.h * 0.35` moves the eyebrow up by 35% of its own height, which
    — worked through — puts *65%* of the eyebrow's box under the hero, not
    35%. For a short single-line label that 65% is the glyphs, not margin.
    Fixed by routing the same `textOcclusionLimit` clamp through this
    gesture, so it gets the identical protection a declared relationship
    already had. Verified: all three `hero-overlaps-eyebrow` cases in
    `npm run sheet -- SEED 8` now render the eyebrow fully legible.
    **Still open, lower confidence, not yet root-caused as precisely**: the
    same transcript also showed a CTA button clipping detail-cluster text
    with no declared relationship between them at all — a genuine, general
    "two unrelated elements' solved boxes overlap" case, which item 12's
    fix does not cover (it's specific to one component's internal geometry).
    Nothing today verifies `layout.boxes` entries for *different* elements
    don't collide unless linked by a `spec.relationships` entry or the
    applied gesture. A general version of item 12's approach — a
    deterministic check across all element pairs, exempting bleed/ground
    elements and declared relationship/gesture pairs — is the likely fix;
    not built today because the specific failing case wasn't reproduced
    from a real spec, only described secondhand in the transcript.
14. **Found 2026-08-05, from a real production error: `GET .../export`
    404'd with "No spec for revision 3" on a job whose spec was durable in
    Postgres the entire time.** **Closed.** The Postgres migration earlier
    today made `revisions.spec` (the DB) the durable copy — `GET .../spec`
    already reads it correctly via `getRevision`. `GET .../export`'s
    fallback, when its render cache is missing (the documented normal case:
    `export/index.ts` only persists the spec by default, renders are
    re-derived on demand), checked a *second*, separate local-disk cache
    file (`spec.json`, written by `exportFlyer` alongside the DB write) —
    and only that file. That file lives on the same ephemeral disk Render
    wipes on every redeploy. Two copies of the same spec existed; the
    endpoint was reading the one that doesn't survive a deploy and never
    tried the one that does, sitting one route away in the same file. Fixed
    by falling back to `getRevision` when the local cache is absent, same
    as `/spec` already does. New acceptance test creates a job via
    `saveRevision` alone (never calls `exportFlyer`, so no local cache
    exists at all) and confirms `/export` still serves PNG and SVG.
15. **Found 2026-08-05, from the same transcripts: a flyer showed no
    visible change after an agent used `revise_flyer` — because the tool
    silently cannot work on this deployment and neither the tool nor the
    pipeline said so.** **Closed.** `create_flyer` checks `hasLlm()` up
    front and its description warns explicitly ("REQUIRES ANTHROPIC_API_KEY
    ... most deployments do not set one"). `revise_flyer` and
    `create_flyer_batch` use the exact same server-side LLM call and had
    neither: no upfront check in `runRevision` (`pipeline.ts`) — it went
    straight into `reviseSpec` and let the Anthropic SDK throw whatever
    exception a missing key produces, well after `pollJob`'s delay — and no
    warning in either tool's description, unlike their `create_flyer`
    sibling. An agent with no server key (this repo's default) could call
    `revise_flyer`, get a job that fails for reasons unrelated to the actual
    instruction, and — since the underlying failure message was raw SDK
    text, not a clear "no key" signal — have no way to know the fix was to
    use `revise_composition` instead. Fixed both ways: `runRevision` now
    checks `hasLlm()` immediately and fails with the same clear message
    `runJob` gives, naming `revise_composition` as the working alternative;
    both tool descriptions now carry the same explicit warning
    `create_flyer` already had. New acceptance test confirms `POST
    .../revise` fails fast and clearly, not with a raw SDK error, when no
    key is configured — the same coverage `create_flyer` already had that
    `revise_flyer` never did.
16. **Found 2026-08-05, from the same investigation: `export_flyer` had the
    exact same hosted-connector bug `upload_asset` had, the other
    direction — and discovering it exposed that the two tests written for
    that bug class were themselves passing by accident, not by working
    test infrastructure.** `export_flyer`'s `outputPath` was required and
    only ever wrote to local disk — a hosted connector, no shared disk with
    the user, had no valid way to call it at all. Fixed to mirror
    `export_composed_flyer`'s already-safe pattern: `outputPath` optional,
    always returns the export URLs plus an inline preview. While writing a
    regression test for this, found the real reason the equivalent
    `upload_asset` test (added earlier the same day) had been passing: MCP
    tools that wrap the REST API call it over a real loopback `fetch()`
    (`config.flyeroApiUrl` — "how the process talks to itself"), and no
    test file has ever actually started a listening server — `app.inject()`
    only simulates the *inbound* request being tested, it does nothing for
    an outbound `fetch()` a tool handler makes from inside that request. The
    `upload_asset` test's `fetch()` was reaching a stale, unrelated local
    `npm run dev` process left running on the default port from earlier
    work — coincidentally answering successfully because creating a new
    asset doesn't depend on any pre-existing fixture state. This test's own
    job *did* depend on fixture state, and had no such process to coincide
    with, so it surfaced the gap immediately as a 404, then (after closing
    that process) a clean connection failure, then (after fixing that) a
    401 from a second, related gap: `config.flyeroApiKey` — what these
    internal `fetch()` calls authenticate with — defaults to
    `dev_key_change_me`, never added to the test suite's `API_KEYS` list.
    Fixed all the way down: `test/acceptance/api.test.ts` now actually
    binds `app.listen()` on `config.port` in `beforeAll`, and
    `test/setup.ts` sets `FLYERO_API_KEY` to a key the suite's own
    `API_KEYS` accepts. Both tools' regression tests now pass against a
    real, correctly configured listener — confirmed stable across repeated
    runs — not against whatever happened to be on the port.
17. **2026-08-13 — the "assembled" example's intermittent contrast failure
    is real and more common than assumed, and only partly explained by the
    existing theory.** Item 8's last bullet (this file) names one mechanism:
    `composed-figure` only paints ink where it draws marks, so text near an
    uneven figure can land on a genuinely busy patch. Measured it directly
    (`scripts/repro-contrast-flake.ts`, new — run it rather than re-deriving
    this by hand) instead of trusting the "roughly 1 in 5-8" estimate: two
    batches of 40 and 20 samples failed at 13%, 28% and 45% respectively —
    noisy at this sample size but consistently well above rare-edge-case
    territory. More importantly, **not every failure fits the composed-figure
    theory**: `layered-depth-stack` failures hit `facts`/`action`/`who`
    (plausibly near the figure, consistent with item 8), but
    `banded-masthead` failures hit `message` — the headline — which that
    topology's recipe has no obvious reason to place near or over the figure
    at all. That suggests a second, broader mechanism: possibly a general
    small mismatch between how ink is chosen and how the mechanical gate
    measures tone, not exclusive to `composed-figure`. **Not fixed.**
    Deliberately did not attempt a fix blind: this reaches into the core
    ink-selection path (`inkFor` and how `gates/index.ts`'s contrast check
    samples `layout.tone`), which this file's own history shows needs a
    geometry dump and careful iteration, not a guess, the same lesson item 8
    itself already learned once. Next step is exactly that: dump
    `layout.tone` + the chosen ink for a `banded-masthead` failure specifically
    (not `layered-depth-stack`, already explained) and find what item 8's
    theory doesn't cover.

Each step: `npm test` green, then render **several different briefs** (trees,
travel, a shop, an event) — not one — and compare against the references before
moving on. One example is how you get a false sense of progress.
