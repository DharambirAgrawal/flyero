import { COMPONENTS } from "../components/registry.js";
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
 */
export function guideMarkdown(): string {
  return `# Flyero — how to make a flyer with this API

You are the creative director. This service is the studio: it samples a designer,
computes every coordinate, renders, and judges. It will never write your idea for
you, and you will never place a pixel.

## The loop

1. **POST /v1/studio/assignments** — get one or more creative assignments.
   Each assignment hands you a *lineage*: a metaphor family, a composition
   topology, a typography behaviour, a material, a colour logic and a signature
   gesture, sampled from ${PROFILE_SPACE.toLocaleString()} possible designers.
   You do not choose these. Working inside constraints you did not pick is the
   entire point — it is what stops every flyer looking like your default taste.

2. **Find or prepare images.** If the brief has no picture of the thing being
   sold, search for one: POST /v1/assets/search {"query":"..."} returns
   candidates without downloading anything, then POST /v1/assets/import with the
   chosen candidate's downloadUrl, sourceUrl and author. Imported photos then
   follow exactly the same path as uploads. **A flyer for a place, a dish or an
   object with no picture of it cannot pass the cover test (G2), and no amount
   of styling fixes that.** If there is genuinely nothing to photograph, use
   **motif-collage**, which draws the idea instead — that is an honest answer, a
   stock photo of nothing is not.

   If the user gave you images, upload with POST /v1/assets, then
   **transform** before compose. Do not drop a raw phone photo or a logo-on-white
   into a component and hope. Call GET /v1/assets/transforms for the catalogue,
   then POST /v1/assets/{id}/transform with a preset (or ops). Use the *new*
   assetId in your elements. Look at GET /v1/assets/{id}/file to verify the cut.

3. **Write the idea.** One sentence describing what the viewer literally SEES.
   Not a summary, not a slogan.
   Good: "A weak résumé bullet is visibly rewritten into a strong one, mid-page."
   Bad:  "Showcasing the power of AI-driven resume optimization."

4. **POST /v1/flyers/compose** — send the idea, the story beats, the copy, and
   the elements you have chosen from the component catalogue. You get back a
   rendered flyer, the code-checkable gate results, and a critique.

5. **LOOK AT IT.** GET /v1/flyers/{id}/export?format=png and actually read the
   image. Three of the six gates cannot be settled by code — only a viewer can
   say whether the idea reads, whether the product is guessable, and whether the
   headline participates. Until you submit a verdict the flyer is NOT done.

6. **POST /v1/flyers/{id}/review** — your honest verdict on what you saw.
   If it fails, fix the spec and compose again (same flyerId → new revision).

## Image preparation — required for blending

User images almost never drop cleanly into a flyer. Treat prep as part of design:

| User gave… | Typical prep |
|---|---|
| Logo on white/black | preset \`logo-clean\` |
| Product photo on studio bg | preset \`product-hero\` or \`soft-cutout\` |
| UI screenshot | preset \`screenshot-frame\` |
| Face / founder | preset \`circle-avatar\` |
| Photo to sit *behind* type | preset \`bg-plate-blur\` (+ optional \`brand-tint\`) |

Custom ops (crop, cropBox, blur, removeBackground, feather, roundCorners, tint,
modulate, opacity, …) can be chained after a preset. Originals are immutable —
every transform returns a new assetId.

## How an image lands on the page is itself a design decision

Do not default to one photo in one rectangle. The way an image enters the
composition carries as much meaning as the image:

- **photo-cluster** — 2–4 circular cutouts on a bowed line joined by a dashed
  route, with a plane or pin riding it. Turns several photos into a *journey*.
  Travel, itineraries, multi-stop events, "how it works" in three steps.
- **polaroid-stack** — tilted prints with white borders, overlapping. Warm and
  personal: weddings, parties, food, anything nostalgic.
- **photo-grid** — 2–4 images on a tight gutter, optionally with one running
  larger. Shows *range* rather than a hero: lookbooks, menus, portfolios.
- **torn-photo** — one image with a torn paper edge over an offset colour
  block. Collage and zine register, when a clean rectangle feels corporate.
- **masked-image** — a single photo cut to a circle, arch, pill or blob.
- **motif-collage** — no photograph at all. Drawn shapes composed around a
  subject mark. For services and ideas with nothing literal to shoot.

Pick the one that tells the story. Three circular cutouts joined by a dashed
line say "we go to these places"; the same three photos in a grid say "we offer
range". Those are different claims — choose the true one.

## Choosing evidence — match the component to the product

This is where most compositions go wrong. The evidence element must depict the
*actual subject*, in the material a viewer would expect it in:

- **Software / SaaS** → browser-frame, phone-frame, ui-fragment, chat-exchange.
- **Documents** (résumés, reports, contracts) → document-card, before-after-stack.
- **Physical products, food, flowers, fashion, venues, events** → the photograph
  IS the evidence. Use **photo-hero** (full-crop, no chrome, scrim for type),
  **masked-image** (circle/arch/pill/blob cut) or **asset-image** (direct
  placement, e.g. a cutout). Never wrap a flower in browser chrome, and never
  rely on abstract content bars to sell a physical thing — prepare a real image
  first.
- **before-after-stack** accepts two image assets (index 0 = before, 1 = after)
  and renders them along the seam; without assets it falls back to abstract
  document lines, which only read for document/software subjects.

photo-hero renders a darkened scrim (top or bottom), so the headline can sit
*on* the photograph: declare a relationship with the headline element in front
and the photo behind. That single move — type participating in the image — is
what Gate G4 wants and what most templates never do.

## The Six Gates — a flyer ships only if all six pass

- **G1 One idea** — the flyer's concept is one sentence, and it reads in the image.
- **G2 Cover test** — hide the logo and headline: can a stranger still tell what
  the product does? This is the gate most AI flyers fail. It is why an "evidence"
  element that depicts the actual subject matter is mandatory.
- **G3 Restraint** — 4 to 7 elements, each with a real answer to "what breaks if
  you delete me?". Enforced by the schema; you cannot submit 8.
- **G4 Type works** — the headline participates in the composition (scaled
  against something, overlapping, masked, structural), not a label floating on
  decoration.
- **G5 One gesture** — exactly one deliberate rule-break, and it must be the one
  your lineage assigned. Some gestures require a specific component; the
  assignment tells you which, and the schema enforces it.
- **G6 Real words** — no invented statistics, no "Innovate. Integrate. Elevate."
  Banned vocabulary is checked by regex; invented-looking figures are rejected.

## Copy rules that will get you rejected

- Never invent a statistic, testimonial, award or customer count. If you were not
  told it, you may not say it.
- Banned words include: innovate, elevate, empower, unlock, revolutionize,
  seamless, cutting-edge, game-changing, next-generation, supercharge,
  "transform your", "the future of", reimagine.
- Headlines want 2–6 words. They are set very large; long headlines shrink and
  the composition dies.
- \`body\` may be null. Silence is usually stronger than a supporting sentence.

## What you do NOT control

Colours, fonts, sizes, positions, wrapping, spacing, z-order. All derived from
the lineage and computed by the layout solver. If you want a different look, that
is a different lineage — ask for another assignment.

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
  return `- **${m.id}** [${m.category}] roles: ${m.roles.join("|")} · assets: ${m.assetSlots}${limits}\n  ${m.purpose}`;
}).join("\n")}
`;
}
