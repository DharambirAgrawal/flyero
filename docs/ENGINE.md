# The engine an agent needs

*"Canva is an engine for humans. A human goes there, drags things, and can see.
An AI can't see. It needs the same shelf and the same critical judgement, but a
different sense organ."*

That framing is the whole design. This document records what that engine has to
provide, what is built, and what is still missing — so the reasoning outlives any
one conversation.

---

## The gap, precisely

A human designer says *"balloon top-right, bleeding off the edge, and the
headline arcs over the cake"* and can picture it. An agent can say the same
sentence but cannot picture anything, so today it either guesses coordinates
(which drift, overlap and bury text) or accepts whatever the recipe hands it.

Neither is design. Design is **choosing relationships and then checking the
result** — and an agent can do both, if the engine speaks in relationships and
reports back in measurements.

---

## What is built

**A percept channel** (`src/core/canvas/tone.ts`). After layout the engine holds
a coarse grid of the page: per-cell luminance, per-cell busyness, contrast
measured against what is actually composited beneath. `legibleFor` fails fine
type on a busy ground *regardless of contrast ratio*, because 21:1 over leaves
is still unreadable. This is the agent's eyes, and it is why ink, scrims and the
contrast gate now agree with the picture instead of guessing at it.

**One light** (`src/core/canvas/light.ts`). Declared once per flyer, seeded.
Every shadow derives from it. Elements used to invent their own — `Panel` offset
a black rect by (3, 6), `polaroid-stack` did too, the headline plate had none.
Shadows that disagree are *the* reason composited things read as pasted on.

**Continuous depth** (`src/core/canvas/depth.ts`). `zIndex` only answers what
covers what. Elements now carry 0..1 depth, and scale, blur, atmospheric haze
and contrast compression are all *derived* from it. The coupling is the point:
per-element styling always breaks it, and the eye reads that inconsistency as
"fake" without being able to name it.

**Relationships as intent.** `overlap`, `weave`, `annotate`, `connect`, `frame`
— the agent declares meaning, the solver computes pixels. Masks are real: an
element declared behind another is actually cut.

**Composition grammars.** Fourteen topologies, four of which change *which roles
appear and where the story starts* rather than only moving rectangles.

**Component appearance.** Every manifest carries a `visual` block — shape,
natural aspect, density, whether it brings its own tone, and one line describing
what a viewer sees. `purpose` says when to reach for something; it said nothing
about what lands on the page, so an agent could pick a wide horizontal run of
circles for a tall slot and only discover the problem by rendering.

The field is **required**, and that is the whole lesson of this section. For a
long stretch only the seven photo components had one, so those were the only
components an agent could picture — and real output came back built from the
same two or three of them, over and over, whatever the brief. The library had
35 components the entire time. Twenty-eight of them were unreachable, not
because of any ranking or sampling logic, but because nobody could see them.
`test/unit/anchors.test.ts` fails the build if a component ships without one.

**Assembled components** (`src/components/figure.tsx`, `src/core/layout/anchors.ts`).
`composed-figure` is a component the agent builds for one flyer and throws away:
a part list of motifs, shapes, cut-out photos and short words, each placed
relative to the figure or to another part — `{ of: "sun", side: "top-right-of",
gap: "near" }`. The resolver topologically sorts the parts, sizes them by named
fraction, and computes every coordinate.

Two problems fall to this at once. **The one-off**: no component will ever exist
for "a balloon at the top right" because it is wanted exactly once, and there
were previously only two answers — ship without it, or add a component nobody
reuses. **Density**: Gate G3 counts elements, not marks, so a page could only
ever hold seven things and output was persistently sparse. One composed figure
is one element carrying up to eight parts, so a page gets busy while the
restraint gate stays exactly as strict. Restraint is about how many *ideas* are
on the page, not how many shapes.

`Anchor` has no numeric escape hatch and a test asserts it never grows one.
That is what keeps this inside law 1: a relationship stays true when the figure
moves, the canvas resizes, or the headline grows a line; an `x: 812` was true
once, for one layout. Only one of those is design.

---

## What is still missing, in order of value

### 1. Asset geometry — the biggest hole

Assets carry an 8×8 luminance map and nothing else. To place type against a
photograph properly the engine needs, computed once at import:

- **alpha mask and outline path** — for real cut-outs rather than rectangles
- **saliency map** — where the subject is, so text can avoid it
- **safe-text regions** — derived from saliency plus tone
- **anchors** — `cake.top_surface`, `subject.head_top`, so "resting on" is a
  lookup rather than a guess

Without saliency, *"put the headline where it will not kill the subject"* is
unanswerable. With it, it is arithmetic. Everything else on this list is worth
less than this.

### 2. Relative placement between top-level elements

Half done. *Within* a composed figure, placement is fully relational
(`src/core/layout/anchors.ts`) — parts anchor to each other and to the figure,
with no coordinates anywhere. What is still slot-based is the level above:
top-level elements land in recipe slots, so an agent cannot yet say
`above(hero, gap)` or `resting_on(...)` about the *headline*.

The resolver is written and tested, so this is now a matter of teaching the
solver to accept anchors as an alternative to a slot — a much smaller change
than it was before the vocabulary existed.

### 3. Canvas size as a decision

The canvas is fixed at 1080×1350. A poster, an A4 flyer, a story and a square
post are different objects with different type scales and margins. The archetype
should choose the format, and recipes should be expressed relative to it.

### 4. Parametric primitives with knobs

`shapes.ts` has the geometry but not the vocabulary: `balloon(size, tilt,
string_curve)`, `ribbon(...)`, `confetti_field(density, exclusion_mask)`. This
is what makes "I need a balloon" never fail and never produce the same balloon
twice.

### 5. Comparative winner selection

`scoreCandidate` ranks by gates passed, then *fewest revisions and fewest
notes* — it literally optimises for the safest candidate. Once several pass, the
blandest wins. Gates should stay hard pass/fail, and an art-director pass should
choose among survivors on specificity, coherence, image/type integration and
distinctness from its siblings.

### 6. An entropy budget

One deliberate rule-break per flyer is required by G5, but nothing forces the
composition to spend it *interestingly*, and nothing forbids the boring
solution. Making centred-stack-on-flat-ground unreachable would do more than any
number of new components.

---

## Two defects worth remembering, because both were invisible

**Blur is a photographic cue.** Depth-of-field was applied by depth alone, so a
full-bleed *drawn* figure came back with every motif smeared. On a photograph
softness reads as distance; on flat vector marks it reads as a broken export,
because a drawn shape has no focal plane to be outside of. Blur is now gated on
the element actually carrying an image; haze still applies to everything, since
atmosphere is real whether the far thing is drawn or photographed.

**A new drawing component reintroduced the exact bug the tone field exists to
kill.** The field only knew about photographic components, so the first composed
figure to run under a line of type put solid accent behind grey text and nothing
measured it — the eyebrow was simply illegible. `figureInk()` now resolves the
parts and declares its rects to the field before rendering. The general rule:
**anything that puts ink on the canvas must tell the tone field, or the canvas
model is lying.** Every future drawing component owes the field the same debt.

*Known remaining gap:* a small text box straddling a hard edge — half over a
dark mark, half over pale paper — still gets one ink for the whole box, so
neither half is right. Scrims solve this for photo plates; a partial-coverage
figure has no equivalent yet.

---

## One thing deliberately rejected

**Novelty memory** — hashing past outputs and penalising near-duplicates — is
frequently proposed and does not belong here. Diversity comes from the seeded
Studio Sampler, by construction (AGENTS.md law 2). The moment output depends on
what was made before, independent sessions correlate, determinism breaks, and
the golden tests stop meaning anything. If flyers repeat, the fix is in the
sampler or the grammars — never in a memory of previous work.

---

## The principle to keep

The engine measures; the agent judges. Every time something has gone wrong here
it has been the same shape: a component drawing blind, an error that named no
field, a link only the server could open, an image too large to arrive. The fix
is never a better model. It is **giving the agent something true to read**.
