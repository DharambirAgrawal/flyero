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

**Component appearance.** Each manifest can now carry a `visual` block — shape,
natural aspect, density, whether it brings its own tone, and one line describing
what a viewer sees. `purpose` says when to reach for something; it said nothing
about what lands on the page, so an agent could pick a wide horizontal run of
circles for a tall slot and only discover the problem by rendering.

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

### 2. Relative placement instead of slots

Today an element lands in a recipe slot. An agent should be able to say
`above(hero, gap: 0.04)`, `corner(top-right, bleed: 0.2)`, `resting_on(...)`,
and have a solver resolve it. This is what lets the agent *compose* rather than
fill. It is also a solver rewrite, which is why it sits below asset geometry
despite being the headline feature.

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
