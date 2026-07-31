# Flyero — Idea Validation

*An honest look at the AI Design Studio idea from the research doc. Written July 2026.*

---

## The idea in one sentence

An MCP-powered design system where the AI (Claude) acts as **creative director** — deciding meaning, metaphor, and hierarchy — while a **deterministic engine** you build does the actual rendering: professional, editable marketing assets (posters, decks, motion videos) that don't all look like the same AI-generated gradient poster.

## Verdict: Yes, it's buildable. But not the way the doc describes it.

The architecture in the PDF is **correct in its core insight** and **dangerous in its scope**. The core insight — *"LLM plans, engine renders, critic loops until it's good"* — is the right architecture and is proven to work. The scope — Creative World Models, 8 embedding channels, graph databases, quality-diversity search, 7 critics — is a 3-year research program disguised as a product plan. If you try to build all of it first, you will never ship.

---

## Reality check #1: The market is NOT empty

You said "they are not in the market, I don't see." That's no longer true, and it's important to know exactly who exists:

| Who | What they do | Where they fall short (your opening) |
|---|---|---|
| **Lovart** | "AI design agent" — brief in, 40+ campaign assets out | Orchestrates *image-generation models*. Output is mostly raster pixels. Editing means "finish it in Figma/Photoshop." No deterministic component system. |
| **Canva MCP** (official, 2026) | ~32 MCP tools: generate, edit, export designs | Still template-first intelligence underneath. Produces exactly the "strategically empty" Vayami flyer your doc opens with. |
| **Figma MCP** (official) | Agents write native frames/components to canvas | Built for UI/design-system workflows, not marketing campaign creation. No creative planning layer. |
| **Krumzi, Gamma, Recraft** | Agentic social graphics / decks / vector generation | Each owns one output type. None share a design system across poster + deck + video. All converge on the same aesthetics. |

**What this means:** The category is validated — people clearly want this and pay for it. But the specific wedge is still open:

> Nobody produces designs that are (1) built from real editable components, (2) structurally different from each other on every run, and (3) share one design DNA across static, slides, and motion.

That's your product. Not "AI makes designs" — that's crowded. It's **"AI makes designs that are actually editable, actually different, and actually a system."**

## Reality check #2: Why hasn't anyone built it? (the real answer)

This is your biggest question, and the answer is unglamorous:

1. **It's not an AI problem, it's a content problem.** The moat in your doc — the component library, the layout grammars, the motifs — is hand-authored design work. Hundreds of hours of a skilled designer encoding taste into rules. VC-funded startups skip this because "just use a bigger model" demos faster. That's exactly why their output converges to the same gradient poster.
2. **The evaluation loop is genuinely hard.** "Does this look professional?" has no reliable automatic answer yet. Everyone who tried one-shot generation got mediocre results and shipped anyway.
3. **Editability is an export-engineering grind.** Keeping text as text, shapes as shapes, through SVG → PPTX → video is boring, fiddly work with no demo-day payoff.

**The good news hidden here:** the barrier is *grind, not genius*. Nobody has a secret you lack. A solo builder who does the grind ends up with a moat that can't be copied by prompting a bigger model.

---

## The gaps in the plan — and the fixes

### Gap 1: The plan is architecture-maximalist
The doc describes ~6 novel subsystems (World Model, Memory Network, QD search, critic studio, genome, visual compiler). Each alone is a hard project.

**Fix:** Build exactly three things first, nothing else:
1. **One deterministic renderer** (React + SVG → PNG/SVG) with ~25 hand-designed components and ~8 layout families.
2. **One planning step** (LLM turns a vague prompt into a structured brief + design spec JSON — no invented statistics).
3. **One render → screenshot → critique → revise loop** (a vision model looks at the render and returns specific fixes).

That's it. The genome, embeddings, graph DB, and MAP-Elites are Phase 3+, *if* the simple version proves people want the output.

### Gap 2: "Anti-convergence" doesn't need the fancy machinery yet
The doc is right that sameness is the enemy, but you can get 80% of the benefit with a cheap trick: a **seeded lineage system**. Before generating, randomly commit to one metaphor family + one composition topology + one typography behavior from hand-written lists (the doc's "10 creative theses" idea). Ten runs = ten genuinely different structures, no vector database required. Add the similarity-fingerprint archive later when you have real usage data.

### Gap 3: The critic is the weakest link and the doc underestimates it
Vision models reward generic polish — the doc says this, then still relies on them heavily.

**Fix:** Split evaluation in two:
- **Rule-based checks** (deterministic, reliable): text overflow, contrast ratios, alignment, safe margins, CTA presence, asset usage. Your layout engine can guarantee most of these *by construction*, which is the whole point of not letting the LLM place pixels.
- **Vision model** only for the subjective 20%: "is the hierarchy clear, is anything colliding, does it look like a title slide?"
- **You, manually**, rating outputs for the first months. This builds the eval dataset that later becomes trainable — and is itself a moat (the "design process dataset" the doc mentions).

### Gap 4: No business model or distribution in 104 pages
The doc is 100% architecture, 0% "who pays and how do they find it."

**Fix:** Two surfaces, one engine:
- **MCP server** — distribution through Claude/Cursor users. Great for early adopters (developers launching products — they need launch graphics and hate design tools). This is your beachhead.
- **Simple web app later** — marketers won't install MCP servers. Prompt in, campaign out, pay per export or monthly.
- **Wedge positioning:** "The launch kit generator." One prompt → poster + 5-slide deck + 10-second vertical video, all matching, all editable. Indie hackers and early-stage startups ship launches weekly and currently duct-tape Canva + Gamma + CapCut. Nobody serves that whole kit from one design system.

### Gap 5: Cost per generation is never mentioned
The full pipeline (plan → retrieve → compose → render → inspect → revise × N → export) could burn many LLM + vision calls per design — plausibly $0.50–$3 per finished campaign.

**Fix:** Cache lineage plans, use small/cheap models for rule-adjacent critique, cap revision loops at 2–3, and price the product per campaign (e.g., $5–15/launch kit) so unit economics work from day one.

### Gap 6: Fonts, licensing, and brand safety
Small but real: curated font pairings need licenses (start with open-source: Inter, Fraunces, Space Grotesk, IBM Plex...), reference-image analysis must extract *principles* not copy assets (the doc handles this correctly), and generated copy must never invent claims (the doc handles this too — keep that rule).

---

## What to build: the 90-day version

**Phase 1 (weeks 1–6): One format, done extremely well.**
Instagram portrait (1080×1350) tech-product launch graphics only.
- 25 components, 8 layouts, 10 font pairings, 10 hand-written creative theses
- MCP tools: `create_brief`, `generate_design`, `inspect_design`, `revise_design`, `export_png`, `export_svg`
- The render→inspect→revise loop working end to end

**Phase 2 (weeks 7–10): Prove the differentiator.**
Run the doc's own acceptance test, scaled down: *same prompt 5 times → 5 structurally different, professionally usable designs.* If this fails, fix theses/grammars — don't add subsystems.

**Phase 3 (weeks 11–13): The kit.**
Add A4 flyer + story format via automatic re-layout, then a first Remotion motion template (the doc is right that motion graphics from the same components is very feasible). Now one prompt makes a matching mini-campaign — the thing no competitor does.

**Ship to 20 indie hackers launching products. Their reaction decides everything after that.**

---

## The one test that matters

From the doc, and it's the right bar:

> Same prompt, 5 runs → every output professionally usable, clearly the same brand, and **unmistakably different in concept, structure, and reading path** — with all text still editable.

Every existing tool fails this today. If you pass it, you have a product. If you can't pass it with the simple version, the fancy architecture wouldn't have saved you either.

## Will it get popular?

Honest answer: **the demand is already proven** — Lovart, Canva AI, and Gamma growing fast proves people want "brief in, design out." Popularity for *you* depends on two things only:

1. **The output quality bar.** People share designs that made them look good. If the 5-run test passes, the product markets itself on Twitter/X the way Gamma did — every export is an ad.
2. **Speed to the wedge.** The giants (Canva, Figma) will keep improving. Your advantage is they're architecturally committed to templates and raster generation. You have maybe 12–18 months of open field on "editable + different + cross-medium." Ship the narrow version fast; don't build the cathedral first.

## Bottom line

- **Possible?** Yes — every piece uses proven tech (MCP, React/SVG, Remotion, vision-model critique).
- **Is the idea sound?** The core architecture (LLM directs, engine renders, critic loops) is genuinely right and matches where the field is heading.
- **Biggest risk?** Not competition, not tech — it's *drowning in your own architecture*. The doc describes the version 3 product. Build version 0.1: one format, 25 components, one loop, one test.
- **The moat?** Hand-authored design intelligence + the process dataset you accumulate. Grind that compounds — which is exactly why the well-funded players haven't done it.
