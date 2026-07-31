# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install && npm run fonts   # fonts are a one-time download into assets/fonts/
npm test                       # all 62 tests; runs with no API key and never spends money
npm run test:unit              # solver, sampler, gates, colour
npm run test:golden            # determinism + SVG editability
npm run test:acceptance        # REST surface end to end
npx vitest run test/unit/layout.test.ts          # one file
npx vitest run -t "caps a justified overlap"     # one test by name
npm run build                  # tsc --noEmit
npm start                      # REST API on PORT
npm run mcp                    # MCP server over stdio
npm run smoke -- "your prompt" # LIVE run against real models — the only thing that costs money
npm run sheet -- SEED 8        # offline contact sheet of N sampled designers, no model calls
```

`npm run sheet` is the fastest way to see whether a change helped or hurt: it renders one flyer per sampled lineage from a fixture spec, so composition quality is visible without a single model call.

## Repository state

Milestones 0–2 are implemented: creative libraries, component library, sampler, layout solver, renderer, all ten pipeline stages, the REST API, and the MCP server. Milestone 3 (the Diversity test, DR-1) is the next gate and is the one that decides whether the product works — see `docs/ROADMAP.md`.

`AGENTS.md` is the binding working agreement for this repo and takes precedence over general habits. Read it plus the doc order it prescribes before writing code:
`docs/OUTPUT-FIRST.md` → `docs/REQUIREMENTS.md` → `docs/ARCHITECTURE.md` → `docs/SCHEMAS.md` → `docs/ROADMAP.md` → `docs/VALIDATION.md` → `CHANGELOG.md`.

`docs/IDEA-VALIDATION.md` and the PDF in `docs/` are historical market context only — never implement from them.

## What the product is

One prompt → one Instagram-portrait (1080×1350) marketing flyer that looks human-designed. A job returns `status: done` only if it passes all Six Gates; otherwise it returns an honest `below_bar` with the best failing candidate attached. Never soften that.

## Architecture in one pass

A single Node service running a 10-stage pipeline (`docs/ARCHITECTURE.md` §3), with REST and MCP as thin surfaces over it:

1. **Brief Builder** (LLM) — prompt + assets → structured brief, every statement labeled `user` | `assumption` | `placeholder`.
2. **Studio Sampler** (seeded, no LLM) — one job seed → `LINEAGES_PER_RUN` (3) lineages with unique metaphor families. This is the diversity mechanism.
3. **Idea Engine** (LLM, bound by lineage) — the one-sentence idea + 4-beat story.
4. **Composer** (LLM → zod-validated `DesignSpec`) — components, roles, relationships, copy. Chooses only from the Component Library; no coordinates.
5. **Layout Solver** (pure TS) — spec + seed → exact geometry. Constraint *application* into a topology recipe, not constraint solving.
6. **Renderer** — React `renderToStaticMarkup` → SVG → resvg PNG. Deterministic.
7. **Critic** — rule critic (code) first, then vision critic (multimodal LLM on the PNG) returning element-level `CriticFix`es, never scores.
8. **Reviser** (LLM) — applies fixes as *spec edits*, loops back to stage 5, capped at `MAX_REVISION_LOOPS`.
9. **Gatekeeper** — Six Gates + mechanical checks; picks the best passing candidate of the 3, logs the losers.
10. **Exporter** — PNG, SVG (text stays text, groups named), `spec.json`. PDF returns `501` in v1.

The 3 candidates run **in parallel** through stages 3–8; sequential blows the 3-minute and cost budgets.

Key data contracts (`docs/SCHEMAS.md`): `Brief`, `Lineage`, `DesignSpec`, `LayoutResult`, `CriticFix`, `GateResult`, `TopologyRecipe`. Implement each as a zod schema; if a field isn't in SCHEMAS.md, update that doc in the same change rather than inventing it in code.

Planned layout (`docs/ARCHITECTURE.md` §8): `src/api/`, `src/mcp/`, `src/core/{brief,studio,idea,compose,layout,render,critic,revise,gates,export}/`, `src/components/` (component library, each with a manifest), `src/creative/` (dimension data + `banned.ts` + `fontpairs.ts`), `src/llm/`, `src/store/`; tests in `test/{unit,golden,acceptance}/`.

## The laws (from AGENTS.md — a violation means the change is wrong)

1. **The LLM never places pixels.** All geometry is computed in `src/core/layout/`. If you're asking a model for an x-coordinate, stop.
2. **Diversity comes from the Studio Sampler.** No history lookups, dedup stores, or temperature bumps. Fix diversity in `src/creative/` data or the sampler.
3. **Deterministic rendering.** Same spec + seed → identical SVG bytes; golden snapshot tests in `test/golden/` guard this and may not be weakened or skipped.
4. **Gates are law.** Never return `done` for a flyer that fails a gate, and never soften a gate to make a test pass.
5. **No invented facts** — no stats, testimonials, or claims not supplied by the user. Enforced in the brief builder and checked in Gate G6.
6. **API-first.** Every capability is a REST endpoint first; `src/mcp/` holds tool schemas and HTTP calls only.
7. **No scope creep.** Later-phase items in `docs/ROADMAP.md` each have a trigger; don't build before it fires, not even partially.
8. **Text stays text** in exported SVG; groups are named.
9. Every LLM call goes through `src/llm/` so per-job cost logging works — never call a provider SDK from a pipeline stage.
10. The per-job process log (brief, lineages, specs, critiques, gate results) is a training asset: never delete it, never skip writing it.

## The Six Gates

G1 one idea (≤140-char `idea`, reads in the image) · G2 cover test (product guessable with logo+headline masked) · G3 restraint (4–7 elements, each with a non-empty `whyHere`) · G4 type participates in the composition · G5 exactly one signature gesture with a recorded purpose · G6 real words, no invented claims. Plus mechanical checks: no overflow, WCAG-AA contrast, safe margins, CTA present, assets used or reported, banned-list clear. Evaluation methods are specified in `docs/SCHEMAS.md` §7 — follow them rather than inventing scoring.

The banned list (the 2026 AI look) is scored by code heuristics in `src/creative/banned.ts` (`docs/SCHEMAS.md` §8); two or more hits fails.

## Development loop

Develop against the REST API with `curl` (`docs/API.md` §8: upload → create → poll → export → revise). Unit-test the layout solver, gates, and sampler distribution heavily — they're pure functions and the backbone of quality. A milestone is done only when its stated test passes.

Config comes from `.env` (template `.env.example`) — never commit `.env`, never hardcode or log keys.

## Process discipline

- Work only on the current milestone in `docs/ROADMAP.md`.
- Every completed milestone, requirement change, or architectural decision gets a dated `CHANGELOG.md` entry — including direction changes and why.
- If code diverges from `ARCHITECTURE.md` or `API.md` for a good reason, update the doc in the same change.
- Ambiguity is resolved by asking "which option makes the flyer better?" — not which is more elegant or general.
