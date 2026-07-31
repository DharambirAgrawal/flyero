# Flyero — Requirements

*What the product must do. Everything here is testable. If a requirement can't be tested, it doesn't belong in this file.*

Status: **v0.1 — pre-code planning**
Companion docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`FLOWCHARTS.md`](./FLOWCHARTS.md) · [`API.md`](./API.md) · [`SCHEMAS.md`](./SCHEMAS.md) · [`ROADMAP.md`](./ROADMAP.md) · [`VALIDATION.md`](./VALIDATION.md)

---

## 1. Product statement

Flyero takes one plain-language prompt (plus optional images/logo) and returns **one marketing flyer that looks like a skilled human designer made it** — a flyer with an idea, a story, and the product visible in it. Not AI-gradient decoration, not a template fill.

The single promise: **a flyer is only returned as `done` if it passes every quality gate.** Internally Flyero may generate and discard many attempts. If nothing clears the bar, the API returns honest `below_bar` — never a fake success.

## 2. In scope (v1) / Out of scope

| In scope (v1) | Out of scope (v1) |
|---|---|
| One format: Instagram portrait 1080×1350 | Decks, videos, carousels (the spec format is designed so these come later without rebuilding) |
| REST API (primary, used for all dev/testing) | Web app UI |
| MCP server (thin adapter over the same core) | Canva/Figma export integrations |
| PNG + SVG export, editable design spec | Collaborative editing |
| User-supplied assets: logo, product screenshot, reference image | AI image generation of photorealistic scenes |
| English copy | Localization |

## 3. Functional requirements

### FR-1: Input
- `prompt` (required): free text, any quality. The system must work from a vague one-liner ("flyer for my AI resume tool Vayami, waitlist at vayami.ai/waitlist").
- `assets` (optional): logo (SVG/PNG), product screenshots, reference images. Referenced by ID after upload, never re-transmitted.
- `brand` (optional): colors, fonts, tone words. If absent, the system invents a coherent brand treatment.
- `risk` (optional, default `studio`): `safe` | `studio` | `experimental` — how adventurous the design may be.

### FR-2: Output
Every completed job returns:
- `render.png` — final flyer, print-quality resolution
- `render.svg` — vector version, **all text remains text**, all shapes remain editable paths
- `spec.json` — the design spec (source of truth: idea, components, relationships, copy). A given spec must re-render **byte-identically** — rendering is deterministic.
- `idea` — the one-sentence creative idea behind the flyer (this is user-facing; it's part of the delight)

### FR-3: Revision
The user can send a plain-language instruction against an existing flyer ("make the CTA stronger", "use less text", "show the product bigger"). Revision edits the spec, re-renders, re-runs gates. It must **not** regenerate from scratch or lose the original idea.

### FR-4: Facts discipline
The system must never invent statistics, testimonials, awards, or claims. Missing facts → true-and-specific copy, or a clearly marked placeholder. This is a hard rule with no exceptions.

### FR-5: Surfaces
- **REST API is the product core.** Every capability exists as an API endpoint first (see `API.md`). All development testing happens via the API.
- **MCP server is a thin wrapper** that calls the same internal service. No logic may live only in the MCP layer.

## 4. Output quality requirements — the Six Gates

A flyer ships only if it passes **all six**. These are the product. (Full reasoning in [`OUTPUT-FIRST.md`](./OUTPUT-FIRST.md).)

| # | Gate | Test |
|---|---|---|
| G1 | **One idea** | The flyer's concept can be stated in one sentence, and that sentence is stored in the spec. |
| G2 | **Cover Test** | With logo and headline hidden, a viewer can still tell roughly what the product does. The subject must be *visualized*, not just named. |
| G3 | **Restraint** | 4–7 visual elements. Every element has a recorded answer to "what breaks if you remove me?" |
| G4 | **Type works** | The headline participates in the composition (scale contrast, overlap, mask, structural role) — it is not a label floating on decoration. |
| G5 | **One gesture** | Exactly one deliberate rule-break (edge crop, overlap, grid violation) with a recorded purpose. Not zero. Not two. |
| G6 | **Real words** | Copy is specific and human. No "Innovate. Integrate. Elevate." No invented claims (FR-4). |

Plus mechanical checks (hard failures, verified by code not judgment): no text overflow, WCAG-AA contrast for body/CTA text, safe margins respected, CTA present and legible, every user-supplied asset either used intentionally or explicitly reported as unused.

### The banned list (auto-reject)
A candidate containing **two or more** of the following fails the rule critic and is discarded (or forced into revision), regardless of polish: dark-navy gradient + cyan/purple glow · fully centered single-cluster layout · three equal feature cards · floating glassmorphism panel · generic 3D orb · meaningless decorative grid/noise · pill CTA as the only visual event.

**Where it runs:** Stage 7 rule critic (code heuristics on the spec + layout) first; Stage 9 Gatekeeper re-checks as a hard fail. Detection is heuristic on structure/color/component choices — not a separate vision pass. Exact detector rules live in `src/creative/banned.ts` (see `SCHEMAS.md`).

## 5. The Diversity Requirement (the human-variance law)

**This is the requirement that makes Flyero different, so it is specified precisely.**

> **DR-1:** Given the same prompt in 10 **independent sessions** (no shared state, no memory, no history lookup), at least **8 of 10 outputs must differ in creative idea (`idea` string / metaphor family), composition topology, AND reading path** (reading path is derived from the sampled topology — see topology→readingPath map in `SCHEMAS.md`). At most 2 may share a primary color family.

> **DR-2:** This variance must be achieved **by construction, not by memory.** The system must NOT need to store or consult previous outputs to be different. Rationale: 10 human designers given one brief produce 10 different flyers not because they compared notes, but because each one *is* a different designer. Flyero simulates this: every run, the system randomly becomes a different designer (see "Studio Sampler" in `ARCHITECTURE.md`). Memory-based dedup is a later, optional enhancement for project-level work — never the mechanism of creativity.

> **DR-3:** Variance must be *structured*, not noise. Raising model temperature is forbidden as a diversity mechanism — it produces chaos, not different ideas. Diversity comes from sampling curated creative dimensions (metaphor family, composition topology, typography behavior, material language, signature gesture), each of which is individually professional.

**DR acceptance test (run before any launch):** same prompt, 10 runs, fresh session each → panel of 3 outsiders groups the outputs by similarity. Pass = at least 8 distinct groups, every output individually passes the Six Gates.

## 6. Non-functional requirements

| Requirement | Target (v1) |
|---|---|
| Generation latency | ≤ 3 minutes per flyer (async job; caller polls or receives webhook) |
| Cost per shipped flyer | ≤ $1.50 in model + compute costs (measure from day one; log per-job cost) |
| Determinism | Same spec → identical render, always |
| Editability | SVG opens in Illustrator/Figma with selectable text and named layers/groups |
| Internal attempts | System may generate up to `LINEAGES_PER_RUN` (default 3) candidates and up to `MAX_REVISION_LOOPS` (default 3) critique rounds per candidate; if nothing passes gates, return the failure honestly with the best candidate flagged `below_bar: true` — never silently ship a failing flyer |
| Fonts | Open-license only (Inter, Fraunces, Space Grotesk, IBM Plex, etc.); pairing list is curated, not model-chosen freeform |
| Observability | Every job stores: brief, sampled lineage, all candidate specs, all critiques, gate results, final decision. This process log is a future training asset — never delete it. |

## 7. Acceptance tests (definition of "v1 done")

1. **The Six-Gate test:** 20 consecutive shipped flyers, zero gate violations on manual audit.
2. **The Diversity test:** DR acceptance test above passes.
3. **The Side-by-Side test:** 10 real products (from Product Hunt), one Flyero flyer each vs. Canva Magic Design + Lovart output for the same brief. Blind panel of strangers picks "which looks human-designed" — Flyero wins ≥ 8/10.
4. **The Editability test:** open 5 exported SVGs in Figma; edit headline text and move the hero — no broken outlines, no rasterized text.
5. **The API test:** full create → poll → revise → export cycle via `curl` only, no MCP involved.
