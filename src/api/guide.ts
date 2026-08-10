import { COMPONENTS } from "../components/registry.js";
import { MOTIF_NAMES } from "../components/shapes.js";
import { METAPHORS } from "../creative/metaphors.js";
import { TOPOLOGIES } from "../creative/topologies.js";
import { TYPOGRAPHY } from "../creative/typebehaviors.js";
import { MATERIALS } from "../creative/materials.js";
import { GESTURES } from "../creative/gestures.js";
import { PROFILE_SPACE } from "../core/studio/sampler.js";

/**
 * The onboarding document for an agent driving this API.
 *
 * Flyero's design engine is deterministic; the *thinking* — the idea, the story,
 * the words — is the caller's job. This text is what tells a fresh agent session
 * how the two halves fit together, so it is served from the API rather than
 * living only in the repo.
 *
 * The failure mode this document exists to prevent: an agent that treats the
 * composition example as a flyer to remix, fills headline / photo / body / CTA,
 * and ships a competent-but-generic poster every time. The example is a JSON
 * *shape*. The flyer must be invented.
 */
export function guideMarkdown(): string {
  return `# Flyero — how to make a flyer with this API

You are the creative director. This service is the studio: it samples a designer,
computes every coordinate, renders, and judges. It will never write your idea for
you, and you will never place a pixel.

Your job is not a safe, balanced poster. Your job is a flyer with one specific
visual thought that a stranger would remember — and that does not look like the
last flyer you made, or like the published examples.

## The trap that kills most sessions

Agents fail this system the same way every time:

1. Call \`get_composition_example\`
2. Keep the same five slots (headline, photo-hero, body, CTA, footer)
3. Swap the product name and a stock photo
4. Ship something "fine"

That is template filling. It is wrong here. The examples teach **field names and
valid JSON**, not the flyer you should build. Steal the shape; invent the
thought. If your element list could be described as "the Nepal trek example with
different words", throw it out and start from the metaphor instead.

## How an elite designer actually thinks here

Work in this order — do not skip ahead to components:

1. **Name the visual sentence first.** One concrete thing a viewer SEES.
   Good: "A weak résumé line is crossed out and rewritten mid-page."
   Bad:  "A clean promo for our AI resume tool."
2. **Pick the designer whose metaphor forces that sentence.** If every
   assignment suggests the same safe picture you already had in mind, request
   another set — do not sand the metaphor down to fit your default.
3. **Choose the evidence as a claim, not a decoration.** The arrangement itself
   means something (journey / personal / range / exchange / before-after /
   drawn idea). Pick the true claim for this brief.
4. **Only then open the catalogue.** Match components to the sentence you
   already wrote. Do not browse for "what usually works."
5. **Refuse your own defaults.** If your last job used \`photo-hero\` +
   \`body-paragraph\` + solid CTA, this one must not. Vary the evidence family,
   the support device, and the CTA style across jobs on purpose.

A composition you can summarise as "a pleasant, balanced poster" is not specific
enough yet. Prefer one bold, slightly unexpected choice over broad competence.

## Design skills

GET /v1/skills lists them; GET /v1/skills/{name} returns markdown. Four:
**brief** (reading a request, choosing an assignment), **composition** (what the
flyer shows), **copywriting** (words that survive the gates), **critique**
(judging the render). Read composition and copywriting before your first spec —
they teach taste and refusal, not palettes.

Colour, fonts, sizes and ornament come from your lineage. That is what stops
every flyer looking the same. There is nothing to steer there. If the first idea
feels familiar, re-roll the assignment or change the evidence shape until it
stops feeling generic.

## Tools — the intended path (no server model key)

Use these. Descriptions are written so tool-search finds them; call them by name.

| Need | Tool |
|---|---|
| How the system works | \`read_design_guide\` |
| Judgement (brief / composition / copy / critique) | \`read_design_skill\` |
| Designer assignment / lineage from the Studio Sampler | \`request_designers\` |
| Find photos, icons, illustrations, shapes, QR | \`search_images\` then \`import_image\` |
| Valid composition JSON shape (not a flyer to remix) | \`get_composition_example\` |
| Submit your authored flyer | \`compose_flyer\` |
| Edit after looking | \`revise_composition\` |
| Verdict after you looked at the PNG | \`review_flyer\` |
| Hand the user links | \`export_composed_flyer\` |

Avoid \`create_flyer\`, \`create_flyer_batch\` and \`revise_flyer\` unless the
deployment clearly has a server-side model key — you are already the model;
those tools usually fail with a configuration error. Do not retry them.

## The loop

1. **POST /v1/studio/assignments** (\`request_designers\`) — get creative
   assignments. Each hands you a *lineage*: metaphor, topology, typography,
   material, colour logic, signature gesture — sampled from
   ${PROFILE_SPACE.toLocaleString()} possible designers. You do not choose these
   fields. Working inside constraints you did not pick is the whole point.
   Pass \`campaignArchetype\`. Pick the designer whose metaphor creates the most
   intriguing visual sentence for *this* brief — not the safest palette.

2. **Find or prepare images.** If the brief has no picture of the thing being
   sold, search: POST /v1/assets/search (\`search_images\`) fans out to a dozen
   sources — photographs, SVG icons, brand marks, illustrations, shapes, QR
   codes. Add \`"type":"icon"\` (or svg / vector / png / background / shape /
   photo) to aim it. Then POST /v1/assets/import (\`import_image\`) with the
   candidate's downloadUrl, sourceUrl, author and provider.
   **A flyer for a place, a dish or an object with no picture of it cannot pass
   the cover test (G2).** If there is genuinely nothing to photograph, use
   **motif-collage** or **scene-illustration** — an honest drawing beats a stock
   photo of nothing.

   User-supplied images: upload, then **transform** before compose. Call GET
   /v1/assets/transforms, then POST /v1/assets/{id}/transform. Use the *new*
   assetId.

3. **Write the idea** — the visual sentence from above. Not a slogan.

4. **Fetch the composition shape** — \`get_composition_example\` /
   GET /v1/schema/composition. There are several examples on purpose so none
   reads as *the* answer. Use them for keys and nesting only. Build a new
   element list from your idea and the assignment's constraints
   (\`direction.density\`, \`direction.gesture.requiresComponent\`).

5. **POST /v1/flyers/compose** — idea, story beats, copy, 4–7 elements each
   with component, role and \`whyHere\`. Never send coordinates, colours or fonts.

6. **LOOK AT IT.** Export the PNG and actually read the image. G1, G2 and G4
   cannot be settled by code.

7. **POST /v1/flyers/{id}/review** — honest verdict. Fail → fix the spec and
   compose again.

## Skeletons you must refuse by default

Do not reach for these unless the brief *and* the metaphor specifically demand
them — and even then, change at least two other choices (support device, CTA
style, relationships, density):

- headline + photo-hero + body-paragraph + cta-button + footer (the "safe stack")
- the same evidence component you used on the previous job
- eyebrow + headline + three benefit lines every time
- a stock photo of smiling people that does not depict the actual product

Prefer, when they fit: \`polaroid-stack\`, \`photo-cluster\`, \`photo-grid\`,
\`torn-photo\`, \`masked-image\`, \`before-after-stack\`, \`document-card\`,
\`chat-exchange\`, \`checklist-card\`, \`scene-illustration\`, \`motif-collage\`,
\`detail-cluster\`, \`big-numeral\`, \`score-ring\`, \`composed-figure\`.

There are ${COMPONENTS.length} components. Most flyers should not be reaching
for the same three.

## Image preparation — required for blending

| User gave… | Typical prep |
|---|---|
| Logo on white/black | preset \`logo-clean\` |
| Product photo on studio bg | preset \`product-hero\` or \`soft-cutout\` |
| UI screenshot | preset \`screenshot-frame\` |
| Face / founder | preset \`circle-avatar\` |
| Pure atmosphere behind type (no recognisable subject) | preset \`bg-plate-blur\` |

**\`bg-plate-blur\` is heavy** — wrong for anything G2 needs a viewer to
recognise. For a listing, venue or product, use \`photo-hero\`'s scrim instead:
it darkens only the band type needs and leaves the photograph sharp.

## How an image lands is itself a design decision

Do not default to one photo in one rectangle. The arrangement is a claim:
three cutouts on a dashed line say *"we go to these places"*; the same three in
a grid say *"we offer range"*. Choose the true one.

Every component below carries a **LOOKS LIKE** line. Read those before choosing.

## Choosing evidence — match the component to the product

- **Software / SaaS** → browser-frame, phone-frame, ui-fragment, chat-exchange.
- **Documents** → document-card, before-after-stack.
- **Physical products, food, flowers, fashion, venues, events** → the photograph
  IS the evidence: photo-hero, masked-image, polaroid-stack, photo-cluster,
  photo-grid, torn-photo, asset-image. Never wrap a flower in browser chrome.
- **before-after-stack** with two image assets shows real states; without assets
  it draws abstract document lines (only credible for document/software).

Type on a photograph: declare a relationship with the headline in front and the
photo behind. That move is what Gate G4 wants.

## Building a component for one flyer

When nothing in the catalogue says what the brief needs, **compose one**.
\`composed-figure\` assembles motifs, shapes, cut-out photos and short words for
this flyer only — placed by **relationship**, never by coordinate:

\`\`\`json
{ "component": "composed-figure", "role": "evidence",
  "props": { "parts": [
    { "id": "seal",  "draw": { "kind": "shape", "form": "seal" },
      "size": "huge",  "at": { "at": "center" }, "tone": "accent" },
    { "id": "word",  "draw": { "kind": "word", "text": "FREE" },
      "size": "medium", "at": { "of": "seal", "side": "on" },
      "tone": "paper", "layer": "front" },
    { "id": "spark", "draw": { "kind": "shape", "form": "sparkle" },
      "size": "small", "at": { "of": "seal", "side": "top-right-of", "gap": "tight" } }
  ] } }
\`\`\`

- **draw** — \`motif\` (${MOTIF_NAMES.join(", ")}), \`shape\`
  (circle, blob, star, sparkle, burst, seal, ribbon, polygon, squiggle, wave,
  tape, arch, panel, torn; \`outline: true\` for stroke only), \`photo\`
  (\`slot\` into your \`assets\`, \`mask\`: rect|circle|arch|blob|torn), or
  \`word\` (up to 24 characters).
- **at** — \`{ "at": "top-right" }\` or \`{ "of": "<partId>", "side": "...", "gap": "..." }\`.
  Sides: above, below, left-of, right-of, on, and the four diagonals.
  Gaps: touching, tight, near, far.
- **size** — tiny, small, medium, large, huge. **tone** — ink, accent, muted,
  paper, ground. **layer** — behind, with, front. **rotate** — -30 to 30.

Gate G3 counts elements, not marks — a composed figure is ONE element with up
to eight parts. Empty page → denser figure, not more elements.

## The Six Gates — a flyer ships only if all six pass

- **G1 One idea** — one sentence, and it reads in the image.
- **G2 Cover test** — hide logo and headline: can a stranger still tell what
  the product does? Evidence that depicts the actual subject is mandatory.
- **G3 Restraint** — 4 to 7 elements, each with a real \`whyHere\`.
- **G4 Type works** — headline participates (scaled, overlapping, masked,
  structural), not a label floating on decoration.
- **G5 One gesture** — exactly the rule-break your lineage assigned.
- **G6 Real words** — no invented statistics or corporate filler.

## Copy rules that will get you rejected

- Never invent a statistic, testimonial, award or customer count.
- Banned: innovate, elevate, empower, unlock, revolutionize, seamless,
  cutting-edge, game-changing, next-generation, supercharge, "transform your",
  "the future of", reimagine.
- Headlines want 2–6 words. Long headlines shrink and the composition dies.
- \`body\` may be null. Silence is usually stronger than a supporting sentence.
- Lift the user's phrasing wherever it is usable — specificity beats polish.

## What you do NOT control

Colours, fonts, sizes, positions, wrapping, spacing, z-order. All derived from
the lineage and computed by the layout solver. Different look → different
assignment.

## Creative dimensions

**Metaphor families** (the binding constraint on your idea):
${METAPHORS.map((m) => `- ${m.id}: ${m.brief}`).join("\n")}

**Composition topologies**:
${TOPOLOGIES.map((t) => `- ${t.id} (reads ${t.readingPath}): ${t.brief}`).join("\n")}

**Typography behaviours**:
${TYPOGRAPHY.map((t) => `- ${t.id}: ${t.brief}`).join("\n")}

**Materials**:
${MATERIALS.map((m) => `- ${m.id}: ${m.brief}`).join("\n")}

**Signature gestures**:
${GESTURES.map((g) => `- ${g.id}${g.requires ? ` [requires component: ${g.requires}]` : ""}: ${g.brief}`).join("\n")}

## Component catalogue

Roles: evidence (shows the product), message (the headline), support, cta, brand,
structure. You need at least one evidence, one message and one cta.

${COMPONENTS.map((c) => {
  const m = c.manifest;
  const limits = m.textLimits
    ? ` limits: ${Object.entries(m.textLimits)
        .map(([k, v]) => `${k}≤${v}`)
        .join(", ")}`
    : "";
  const v = m.visual
    ? `\n  LOOKS LIKE: ${m.visual.reads} (${m.visual.shape}, aspect ~${m.visual.aspect}, ${m.visual.density} density, ${m.visual.carriesTone ? "carries its own tone — darkens what it covers" : "leaves the ground showing through"})`
    : "";
  return `- **${m.id}** [${m.category}] roles: ${m.roles.join("|")} · assets: ${m.assetSlots}${limits}\n  ${m.purpose}${v}`;
}).join("\n")}
`;
}
