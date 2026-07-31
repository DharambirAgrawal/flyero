# AGENTS.md — Working rules for Flyero

*Read this before writing any code in this repo. It exists so that work stays consistent across sessions and agents — nothing here is optional.*

## Read order (once per session, before coding)

1. `docs/OUTPUT-FIRST.md` — what the product actually is (the output bar)
2. `docs/REQUIREMENTS.md` — what must be true, all testable
3. `docs/ARCHITECTURE.md` — how it's built, incl. repo layout §8
4. `docs/SCHEMAS.md` — data contracts (brief, lineage, spec, gates, banned detector)
5. `docs/ROADMAP.md` — find the current milestone; work ONLY on it
6. `docs/VALIDATION.md` — known risks and what was already corrected
7. `CHANGELOG.md` — what's already done and what was decided

Do **not** implement ideas from `docs/IDEA-VALIDATION.md` or the original PDF that are marked out of v1 / later-phase. Those are history and market context only.

## The laws (violating these = the change is wrong, revert it)

1. **The LLM never places pixels.** All geometry (coordinates, wrapping, font sizes, collision, contrast) is computed in `src/core/layout/` by deterministic code. If you find yourself asking a model for an x-coordinate, stop.
2. **Diversity comes from the Studio Sampler, never from memory or temperature.** Do not add history lookups, dedup stores, or temperature bumps to make outputs differ. Fix diversity problems in the creative dimension data (`src/creative/`) or the sampler.
3. **The spec is the source of truth and rendering is deterministic.** Same `spec.json` + seed → identical SVG bytes. The golden snapshot tests in `test/golden/` guard this; never weaken or skip them.
4. **Gates are law.** Never ship (return `status: done`) a flyer that fails a gate. Never soften a gate to make a test pass — fix the pipeline instead. `below_bar` is an honest, acceptable outcome.
5. **No invented facts.** The system must never generate statistics, testimonials, or claims not supplied by the user. This rule is enforced in the brief builder AND checked in Gate G6.
6. **API-first.** Every capability is a REST endpoint before anything else. The MCP layer (`src/mcp/`) contains tool schemas and HTTP calls only — if you're writing business logic there, it belongs in `src/core/`.
7. **No scope creep.** Later-phase items (`docs/ROADMAP.md` table) have triggers. If the trigger hasn't fired, do not build it — even partially, even "to prepare."
8. **Text stays text.** No exported SVG may contain outlined/rasterized text. Groups are named. Editability is a requirement, not a nice-to-have.

## Process discipline

- **Changelog:** every completed milestone, requirement change, or architectural decision → entry in `CHANGELOG.md` (dated, under Added/Changed/Fixed/Decisions recorded). If you changed direction mid-task, record why.
- **Docs stay true:** if code diverges from `ARCHITECTURE.md` or `API.md` for a good reason, update the doc in the same change. Stale docs are worse than no docs.
- **Testing:** develop against the REST API with the curl loop in `docs/API.md` §8. Unit-test the layout solver and gates heavily — they are pure functions and the backbone of quality. Every milestone's definition of done is a real test; run it before claiming completion.
- **Cost:** every LLM call goes through `src/llm/` so per-job cost logging works. Never call a provider SDK directly from a pipeline stage.
- **Secrets:** config via `.env` (template: `.env.example`). Never commit `.env`, never hardcode keys, never log them.
- **Process logs are sacred:** the per-job record (brief, lineages, specs, critiques, gate results) is a future training asset. Never delete it, never skip writing it.

## Judgment calls

When something is ambiguous, resolve it by asking: **"which option makes the flyer better?"** — not which is more elegant, more general, or more interesting. Output-first is the tiebreaker for every decision in this repo.
