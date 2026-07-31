# Flyero

**One prompt → one marketing flyer that looks like a skilled human designer made it.**

Not AI-gradient decoration. Not a template fill. A flyer with an idea, a story, and the product visible in it — different every single time, the way ten human designers given the same brief produce ten different flyers.

The promise: **a flyer is only marked `done` if it clears every quality gate.** Internally Flyero competes multiple design candidates; failures return honest `below_bar`, never a fake success.

## Status

**Milestones 0–2 built.** The pipeline runs end to end: creative libraries, 25 hand-authored components, the Studio Sampler, the deterministic layout solver and renderer, all ten stages, the REST API, and the MCP server. Next up is Milestone 3 — the Diversity test — which is the one that decides whether the product works.

```bash
npm install && npm run fonts   # one-time font download
npm test                       # 62 tests, no API key needed, spends nothing
npm run sheet -- SEED 8        # see 8 sampled designers render the same brief, offline
npm start                      # REST API
npm run smoke -- "Flyer for …" # live run against real models
```

The documentation below is the complete build plan — read it in this order:

| Doc | What it answers |
|---|---|
| [`docs/OUTPUT-FIRST.md`](docs/OUTPUT-FIRST.md) | What "looks human-made" means, concretely (the Six Gates, the banned list) |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Everything the product must do, all testable — including the Diversity Requirement |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The pipeline, the Studio Sampler (diversity by construction), stack, repo layout |
| [`docs/FLOWCHARTS.md`](docs/FLOWCHARTS.md) | Every flow as a diagram |
| [`docs/SCHEMAS.md`](docs/SCHEMAS.md) | Data contracts every stage must speak (brief, lineage, spec, gates) |
| [`docs/API.md`](docs/API.md) | REST API (the core surface) + MCP tool mapping |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Build order, milestone by milestone, each with a hard definition of done |
| [`docs/VALIDATION.md`](docs/VALIDATION.md) | Full audit of the plan — idea, tech, gaps, what was fixed |
| [`docs/IDEA-VALIDATION.md`](docs/IDEA-VALIDATION.md) | Market context (historical; do not build from this) |
| [`AGENTS.md`](AGENTS.md) | Working rules for anyone (human or agent) writing code here |
| [`CHANGELOG.md`](CHANGELOG.md) | What changed, when |

## The three ideas that define the product

1. **The LLM never places pixels.** AI decides meaning (idea, story, hierarchy, copy); a deterministic engine computes geometry. That split is why output is professional.
2. **Diversity by construction, not memory.** Every run randomly samples a "designer" from ~460,000 curated creative profiles (metaphor × topology × typography × material × color logic × gesture). Ten same-prompt sessions differ by probability, like ten independent humans — no tracking required.
3. **Gates, not hopes.** Six checkable output gates (one idea, cover test, restraint, type works, one gesture, real words) plus a banned list of the 2026 AI look. Failing work is discarded, never shown.

## Surfaces

- **REST API** — the core; everything is built and tested here first (`curl`-driven development).
- **MCP server** — thin adapter over the same API for Claude/Cursor users.
- Web app, more formats (story, A4, decks, motion video) come later — the design spec is format-agnostic by design.
