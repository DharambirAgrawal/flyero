/**
 * Design skills served over the API.
 *
 * An agent using Flyero has no code, no CSS and no canvas — it has our
 * endpoints. So these are not general design skills: published skill libraries
 * teach CSS Grid, OKLCH shade scales and curated hex palettes, none of which an
 * API consumer can act on, and the palettes are actively harmful here.
 *
 * **Why no colour, fonts or measurements in these skills.** Flyero's whole
 * diversity mechanism is the Studio Sampler: one job seed produces lineages that
 * differ by construction. If every agent were handed the same palette advice and
 * the same "use a 1.25 type scale" rule, every flyer would converge on the same
 * look — which is precisely the failure the sampler exists to prevent, and
 * exactly what the 2026-AI-look banned list is trying to kill. The engine owns
 * colour, type, geometry and ornament. These skills own *judgement*: what to
 * say, what to show, and how to tell whether it worked.
 *
 * Each skill therefore states plainly what the agent controls and what it does
 * not, so nobody wastes effort trying to steer something the solver decides.
 */

export type SkillSummary = {
  name: string;
  title: string;
  description: string;
  /** When an agent should reach for this. */
  useWhen: string;
};

type Skill = SkillSummary & { body: string };

const SKILLS: Skill[] = [
  {
    name: "composition",
    title: "Choosing what the flyer shows",
    description:
      "How to invent a specific visual claim and pick evidence that carries it — never a remix of the published examples.",
    useWhen: "Before writing a spec — this is the decision that most affects whether the flyer reads.",
    body: `# Choosing what the flyer shows

## The one rule

**The picture must carry the message.** If a reader covers every word and still
knows roughly what this is about, the composition works. If the words are doing
all the work, you have made a document with a photograph on it.

That is also Gate G2, which is judged on the rendered image, not on your intent.

## Invent first — then open the catalogue

Write one visual sentence before you name a single component. Then match
components to that sentence. Opening the catalogue first is how every session
collapses onto headline + photo-hero + body + CTA.

The composition examples from \`get_composition_example\` are **JSON shapes**.
They are not flyers to remix. If your element list matches an example's slots
with different strings, you have not designed anything yet.

## What you control

The evidence element: which component, and what it holds. That is a real design
decision and it is yours.

## What you do not control, and why

Colour, fonts, sizes, positions, ornament and the ground are computed from the
lineage and the layout solver. Do not try to steer them. Two reasons:

1. They are geometry, and geometry is solved, not authored.
2. Every agent asking for "a warm cream background with a serif" produces the
   same flyer. Variety comes from the lineage you were assigned, not from your
   taste. If the look is wrong for the brief, ask for a different assignment.

## How an image lands is itself a claim

Do not default to one photograph in a rectangle. The arrangement says something:

- **photo-cluster** — cutouts on a bowed dashed route. Says *"we go to these
  places"* or *"it happens in these steps"*. Journeys, itineraries, multi-stop.
- **polaroid-stack** — tilted prints, overlapping. Says *"this is personal"*.
  Weddings, parties, food, anything nostalgic.
- **photo-grid** — a tight gutter, sometimes one cell larger. Says *"we offer
  range"*. Lookbooks, menus, portfolios.
- **torn-photo** — torn paper over an offset block. Hand-made, zine, community.
- **masked-image** — one photo cut to a circle, arch, pill or blob.
- **chat-exchange** — a question and a markedly better answer. Software,
  coaching, support, any brief that is an exchange of voices.
- **before-after-stack** — two states on one hard seam. Transformation with a
  clear pair.
- **scene-illustration** — a drawn landscape. No photograph at all.
- **motif-collage** — drawn marks around a subject mark. No photograph.
- **composed-figure** — a one-off assembly for this flyer only.

Three photos on a dashed line and the same three in a grid make *different
claims*. Choose the true one.

## Refuse the safe stack

Unless the metaphor and the brief both demand it, do not ship:

headline-block + photo-hero + body-paragraph + cta-button + footer-lockup

That skeleton is the system's most common failure. Change the evidence family,
drop the body when the picture is enough, put facts in \`detail-cluster\`, use a
relationship so type sits *in* the image, or build a \`composed-figure\`. Vary
CTA \`style\` (\`underlined\` / \`solid\` / \`bracketed\`) across jobs on purpose.

## When not to use a photograph

Plenty of briefs have nothing worth photographing — a service, an idea, a
campaign about a behaviour. A stock photo of nothing says less than a drawing.
Use \`scene-illustration\`, \`motif-collage\`, \`chat-exchange\` or
\`composed-figure\` and say the thing honestly.

Conversely: a flyer for a *place*, a *dish* or an *object* with no picture of it
cannot pass the cover test, and no amount of styling will rescue it. Search for
one (\`search_images\` / POST /v1/assets/search) before you compose.

## When nothing in the catalogue fits, build the component

\`composed-figure\` is assembled for one flyer and thrown away. You name the
parts — motifs, shapes, cut-out photos, short words — and how each sits
*relative to the figure or to another part*: "the plane top-right of the sun",
"the word on the seal", "the leaf below the blob, far". The engine computes
every coordinate; there is no way to write one and you should not want to.

Reach for it when the brief asks for something specific that no finished
component says. A balloon in the corner, a stamp with a price in it, three pins
walking down the page — these are wanted once each, so no component will ever
exist for them.

## Scattered small text is a device, not a mistake

Real posters constantly break a date or a day into loose fragments tucked
around the big type — "7/10" sitting on the headline, "SATURDAY" rotated
beside it — instead of one tidy eyebrow line above everything. That is a
\`composed-figure\` with \`draw: { kind: "word" }\` parts: each is a short
word or number, placed relative to another part (\`at: { of: "headline",
side: "top-right-of" }\`) and optionally tilted a few degrees with \`rotate\`.
Several small \`word\` parts anchored around your evidence or near the
headline read as *designed*, the way one plain support line never does — use
this instead of defaulting to an eyebrow whenever the brief has a date, a
day, a price or a short stat that wants to feel handwritten-in rather than
typeset-in-a-row.

For a figure that dominates the page (a number is the whole point — "26",
"50% OFF", "Day 3") reach for \`big-numeral\` directly instead of composing
one: it is a real component, not something you need to build from parts.

A \`word\` part also takes \`role: "accent"\` — a name or short phrase set in
the lineage's script/handwritten register instead of the plain display font
("HAPPY BIRTHDAY" in bold caps, "Samira!" beside it in flowing script). Only
some font pairs define this register on purpose, so ask for it where it fits
the brief (a name, a signature, an aside) and it will render in the display
font instead when the assigned pair has no accent — never a forced or ugly
combination, just a graceful no-op.

A \`motif\` or \`shape\` part also takes \`shaded: true\` — a highlight-to-
shadow gradient keyed off the flyer's one light, plus a contact shadow,
instead of a flat single-colour fill. That is the difference between a
rendered *object* (a balloon that looks inflated, a gift that looks wrapped,
a trophy that looks metal) and a flat *icon mark*. Reach for it when the part
is meant to be seen as a thing sitting on the page, not a graphic symbol —
and leave it off for badges, Memphis shapes, small scattered accents and
anything else that should read as a mark: shading everything looks busier,
not more real, so use it on the one or two parts that are the point of the
figure, not on every part in it.

## Density without clutter

The canvas should feel used. But you have 4-7 elements and Gate G3 counts them,
so density comes from elements that carry *several* things:

- \`composed-figure\` is one element and can hold **eight parts**. This is the
  strongest tool you have against an empty page.
- \`detail-cluster\` holds up to six labelled facts as one element. "Sat 17
  June", "Kestrel Park" and "Bring gloves" are one idea — when and where — not
  three.
- \`benefit-list\` and \`checklist-card\` similarly carry several lines.

Spending one element per line is how you run out of budget with a half-empty
page.

## Do not build the same flyer twice

Every component in the catalogue carries a **LOOKS LIKE** line — what it
actually puts on the page, not when to use it. Read them. Output from this API
spent a long time converging on the same two or three components for every
brief, and the cause was simply that the rest were not described well enough to
picture. They are now. If your composition resembles the last one you made,
or resembles a published example with different copy, that is the failure
repeating — change the evidence family before you submit.

## Before you submit

Ask: if this were printed and stapled to a pole, would anyone stop? If the
honest answer is "it is fine", it is not finished.`,
  },

  {
    name: "copywriting",
    title: "Words that survive the gates",
    description:
      "Headline, eyebrow, body and details — specific human language, not a slogan that fits any brand.",
    useWhen: "While filling in copy, and before submitting a composition.",
    body: `# Words that survive the gates

## Never invent a fact

No statistics, no testimonials, no "trusted by 10,000 customers", no awards, no
percentages the user did not give you. Gate G6 checks this and it is not
negotiable — a flyer that invents a number is worse than no flyer, because
someone will print it.

If a claim would be stronger with a number and you do not have one, write the
claim without the number. "Shade cuts the heat a road holds" needs no
percentage to be true.

## The headline is one idea, not a summary

Under 90 characters, and it should read as a *sentence a person would say*.
Three to six words usually beats twelve.

Avoid the shapes that mark generated copy: triads ("Innovate. Integrate.
Elevate."), "Unlock your potential", "Take it to the next level", "Elevate your
X", and any sentence that would fit any other business unchanged.

Test: swap in a competitor's name. If the line still works, it says nothing.
Write again until the line fails that test.

## What each slot is for

- **eyebrow** (<=42 chars) — who this is for, or what kind of thing it is. It
  arrives *before* the headline and sets the frame. Skip it rather than pad it.
- **headline** — the one idea. Gate G1.
- **body** (<=180 chars) — one supporting thought, in the user's own register.
  Not a paragraph. Not three sentences. Often \`null\` is stronger.
- **cta.label** (<=34 chars) — a thing to *do*, phrased as an action. "Book your
  crossing", not "Learn more". Vary CTA tone across jobs; do not always use the
  same verb.
- **details** — up to six labelled facts: date, place, price, phone, handle.
  This is where practical information belongs. Do not stuff it into body.

## Use the user's words

If the brief says "sourdough, slow proved overnight", that is better than
anything you would write. Lift the user's phrasing wherever it is usable — it is
specific, and specificity is what generic copy lacks.

## Label everything you assumed

The brief builder marks each statement \`user\`, \`assumption\` or
\`placeholder\`. If you invented a detail because the flyer needed one, it is an
assumption and must be labelled — so the user can correct it rather than
discover it in print.`,
  },

  {
    name: "critique",
    title: "Judging your own flyer",
    description:
      "How to review a rendered flyer honestly — reject generic work, not only broken work.",
    useWhen: "After fetching the PNG, before POSTing a review verdict.",
    body: `# Judging your own flyer

You must look at the rendered PNG. Three gates — G1, G2 and G4 — cannot be
settled by code, which is why the flyer sits at \`awaiting_review\` until you
give a verdict. Guessing here defeats the entire point of the gates.

## Look in this order

**1. Squint.** Blur your reading of it and ask what stands out. If nothing does,
there is no focal point and the composition has failed before any detail matters.

**2. Cover the logo and headline.** Can you still tell what this is about? That
is G2 and it is the one most flyers fail. A photograph of the actual thing
passes; an abstract shape, a gradient or a decorative panel does not.

**3. Read the headline as a stranger.** Does the idea land in one pass? That is
G1. If you need the body copy to understand the headline, the headline is wrong.

**4. Check the type is participating.** Is the headline *part of the
composition* — scaled, placed, interacting with the image — or is it a caption
sitting above a picture? That is G4.

**5. Ask whether it is generic.** Could this poster belong to any brand after
you swap the name? Does it look like the published example with different
words? If yes, it fails your job even if the mechanical gates pass — revise
until it has a specific visual thought.

**6. Hunt for collisions.** Text clipped by an image edge, a line running off
the canvas, an element overlapping another, a QR sitting on a busy area. Report
each one in \`collisions\`; the reviser can act on specifics, not on "it looks
off".

## Reject when you should

A verdict of \`done\` on a flyer you would not print is the one failure this
system cannot recover from. If the top third is empty, if a word is cut, if the
image says nothing, if it is merely competent — say so. \`below_bar\` with an
honest reason is a *correct* outcome, not a failure.

## What is not your job

Do not report colour choices, font choices or spacing as faults. Those are the
lineage's and the solver's. If the palette genuinely does not suit the brief,
that is a different assignment, not a revision.`,
  },

  {
    name: "brief",
    title: "Turning a request into an assignment",
    description:
      "How to read what a user asked for, and how to choose a designer whose metaphor forces a fresh visual idea.",
    useWhen: "At the start, before requesting or choosing a studio assignment.",
    body: `# Turning a request into an assignment

## Separate the three things

A request usually contains, tangled together:

1. **What is being offered** — the product, event, service or message.
2. **Who it is for** — often implied, rarely stated.
3. **What should happen next** — the action.

Write all three down before composing. If the third is missing you cannot make a
CTA, and a flyer without one is a poster about nothing.

## Ask only what changes the work

Do not interrogate. One or two questions at most, and only where different
answers would produce genuinely different flyers — a date you cannot invent, a
web address, whether there is a logo. Everything else: choose sensibly, label it
as an assumption, and let the user correct it.

## Ask for the right kind of designer first

POST /v1/studio/assignments (\`request_designers\`) takes a **campaignArchetype**:
product-promotion, event-invitation, awareness-education,
editorial-announcement, offer-promotion.

Pass it. The sampler then only returns designers whose metaphor suits that kind
of brief. Without it you are drawing from the whole set and hoping — one real
run burned 27 draws hunting for a metaphor that fitted a travel brief, which is
fighting the sampler rather than using it.

Also note the field is **runs**, not "count".

## Choosing among the sampled designers

You get several lineages per job. They differ by construction — metaphor,
topology, typography, material, colour logic, gesture and graphic language.
Choose the one whose **metaphor forces the most intriguing visual sentence**
for this brief — not the one whose palette feels safest, and not the one that
lets you reuse yesterday's layout:

- \`growth\` suits campaigns about change over time.
- \`cartography\` suits journeys and multi-stop offers.
- \`before-after-fold\` suits transformation with a clear pair.
- \`magnification\` suits a small detail that matters.
- \`conversation\` suits an exchange of voices, questions, or ask-and-answer.

If none creates a striking visual idea, request another assignment with fresh
runs rather than forcing a weak fit. If the metaphor fits but your first
component instinct is the same stack you always use, the metaphor is doing its
job — lean into it and pick unfamiliar evidence.

## Do not fight your assignment

The lineage is the point. It is what stops ten agents producing ten versions of
the same page. A composition that works *with* an unexpected topology is nearly
always more interesting than one that ignores it.`,
  },
];

export const SKILL_INDEX: SkillSummary[] = SKILLS.map(({ name, title, description, useWhen }) => ({
  name,
  title,
  description,
  useWhen,
}));

export function getSkill(name: string): Skill | null {
  return SKILLS.find((s) => s.name === name) ?? null;
}
