# Flyero — Roadmap

*Build order with a hard definition of done per milestone. A milestone is not done until its test passes — no partial credit, no moving on early.*

Status: **v0.1 — pre-code planning.** Update this file (and `CHANGELOG.md`) whenever a milestone completes.

---

## Milestone 0 — Skeleton (foundation, no intelligence)

Scaffold the repo per `ARCHITECTURE.md` §8: Fastify API with auth + health, SQLite job store, filesystem object store, async job runner, zod spec schema v1.0, and the deterministic render path (hand-written test spec → React → SVG → PNG).

**Done when:** a hand-written `spec.json` posted to a dev endpoint renders to pixel-identical PNG on 5 consecutive runs (golden snapshot test), and the `curl` smoke-test loop from `API.md` §8 works end to end with a stubbed pipeline.

## Milestone 1 — The libraries (design work, mostly no code)

The hand-authored creative content — this is the moat and the slowest part; do it before the pipeline so the pipeline has something real to compose with:

- Components, each with a manifest, each looking professional alone on canvas — grown from an initial ~25 to 36 as gate/diversity work found concrete holes (`ARCHITECTURE.md` §6, `src/components/registry.ts`)
- 10 composition topology recipes (parameterized grid + placement rules)
- 12 metaphor families, 8 typography behaviors, 6 material languages, 8 color-logic generators, 10 gesture families — all as data files in `src/creative/`
- Compatibility veto matrix, banned-list detector rules, 10 curated open-license font pairings

**Done when:** for every topology, a hand-written spec using it renders correctly; the sampler produces valid lineages with correct distribution (unit test: 10,000 samples, no vetoed pair passes, all values reachable).

## Milestone 2 — The pipeline (first real flyer)

Stages 1–10 wired: brief builder, studio sampler, idea engine, composer (schema-validated with retry), layout solver, critic (rules first, then vision), reviser loop, gatekeeper, exporter. Single candidate first, then 3-candidate fan-out. Per-job cost logging live.

**Done when:** the Vayami prompt via `curl` produces a flyer that passes all Six Gates on manual audit, with the process log fully populated, in ≤ 3 minutes, at ≤ $1.50.

## Milestone 3 — The Diversity test (the identity of the product)

Tune idea-engine prompts, lineage constraints, and the internal competition until DR-1 passes.

**Done when:** `POST /v1/batches` with the same prompt, 10 independent runs → 3 outside people group the outputs, at least 8 distinct groups, every output individually passes the gates. **If this milestone fails, everything stops until it passes — this is the product.**

## Milestone 4 — Revision + editability

Plain-language revision (spec edits, idea immutable), revision history, SVG editability hardened.

**Done when:** 5 exported SVGs open in Figma with editable text and named groups (acceptance test 4), and 10 varied revision instructions each produce a correct, gate-passing update without losing the original idea.

## Milestone 5 — The Side-by-Side (public proof)

10 real products from Product Hunt → one Flyero flyer each. Same briefs into Canva Magic Design and Lovart. Blind panel of strangers.

**Done when:** Flyero wins ≥ 8/10 on "which looks human-designed." Then the comparisons get published — this is launch marketing, not just a test. If it fails: the losing flyers' process logs tell us exactly which stage to fix; fix, re-run, do not launch until it passes.

## Milestone 6 — MCP surface + first users

**Substantially built already, pulled forward ahead of Milestone 3 completing** — same pattern as the L1 format work below: real agent sessions (`docs/GAP-ANALYSIS.md`, 2026-08-01 onward) needed the surface to exist before diversity tuning could even be evaluated live. Current state, not the original 6-tool stdio plan: `src/mcp/server.ts` registers up to 17 tools over both stdio and streamable HTTP (`POST /mcp`, for hosted connectors), split into an agent-native path (10 tools — the calling agent samples its own lineage, authors the spec, judges the render; no server model key) and a server-authored path (3 tools, only registered when `ANTHROPIC_API_KEY` is configured) — see `API.md` §7. Preview images return small enough to survive chat transports. Ship to ~20 indie hackers who are launching products. Watch which revise instructions they send — that's the real critique dataset.

**Done when:** an external user creates and exports a flyer entirely from Claude/Cursor chat, and at least 10 of 20 testers export something they actually post publicly.

---

## Later phases (each has a trigger — build nothing before its trigger fires)

| Phase | What | Trigger |
|---|---|---|
| L1 | ~~Story (1080×1920) + A4 formats~~ — **done 2026-08-05** (Story + Square; A4 still open), pulled forward by a direct user request rather than through Milestone 6. See `CHANGELOG.md` 2026-08-05 "Multi-format support". | Milestone 6 users ask for them (they will) |
| L2 | Project memory — lineage fingerprints per project so a returning user's campaign stays fresh | A real user generates 5+ flyers for one product and notices repetition |
| L3 | Motion compiler (Remotion) — gestures become animations, components already carry motion affordances | Side-by-side win published and static demand proven |
| L4 | Deck compiler — story arc → 5 slides | Same as L3 |
| L5 | Embeddings / retrieval over the component library | Library exceeds ~100 components and manifest-based selection visibly strains |
| L6 | Postgres + queue + workers | Sustained concurrent load makes SQLite/in-process a bottleneck |
| L7 | Web app | Non-developer demand demonstrated via MCP/API users |
| L8 | Critic fine-tuning on our own accumulated process logs + human ratings | ≥ 500 shipped flyers with human accept/reject signals |

## Standing rules

1. Never skip a milestone's test. 2. Never add a Later-phase item early because it seems fun. 3. Every milestone completion = `CHANGELOG.md` entry. 4. Cost per flyer is reviewed at every milestone — if it trends above target, fix before proceeding.
