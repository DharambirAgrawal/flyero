# Flyero — Documentation Validation Audit

*Full review of the planning suite for idea soundness, technical correctness, cross-doc consistency, and build-readiness. Audited 2026-07-30. Blocking issues were fixed in the same pass — see §5.*

---

## Verdict

**You can start building Milestone 0.** The idea is sound, the architecture matches the product promise, and after this audit the docs are consistent enough that an agent following `AGENTS.md` will not invent a conflicting system.

The plan is **not** risk-free. The hardest parts are design content (Milestone 1) and gate automation (G2/G4), not MCP or the API shell. Cost at 3 candidates × vision loops is the main number that may need tuning once real jobs run.

---

## 1. Idea — validated

| Claim | Verdict | Why |
|---|---|---|
| LLM as creative director, code as geometry engine | **Correct** | Matches known LLM weakness (spatial math) and strength (language, metaphor, copy). |
| Diversity by construction (Studio Sampler), not memory | **Correct** | Matches the "10 humans / 10 sessions" requirement. ~460k profiles is enough that 10 independent jobs collide rarely. |
| Quality gates as the product, not "generate and hope" | **Correct** | This is the real wedge vs Canva/Lovart/Gamma in 2026. |
| Flyer-only v1, same spec later compiles to other formats | **Correct** | Scope control is right; scalability path is preserved without building video now. |
| API-first, MCP as thin adapter | **Correct** | Matches how you'll actually test (`curl`). |
| Hand-authored components + creative dimensions as the moat | **Correct** | Funded competitors skip this grind; that is why their output looks the same. |

**Honest limit:** "Looks human" is partially judgment. Gates G1/G2/G4 still need a vision model. The docs now specify *how* each gate is evaluated (`SCHEMAS.md` §7) so agents don't invent scoring. Expect iteration in Milestone 2–3.

---

## 2. Technical stack — validated

| Choice | Verdict | Notes |
|---|---|---|
| TypeScript + Node 22 + Fastify | **Good** | Fits React/SVG/MCP/Remotion-later ecosystem. |
| React → SVG → resvg PNG | **Good for v1** | Deterministic path is right. Complex filters may need Playwright fallback (already documented). |
| zod as law for specs | **Good** | Shared between API, composer, renderer. |
| SQLite + local filesystem | **Good for v1** | Migration triggers exist (L6). |
| Anthropic for plan + vision | **Good start** | Interface abstraction required (`src/llm/`) — already in AGENTS.md. |
| No vector DB / embeddings / QD in v1 | **Correct** | Not needed to pass DR-1 with curated sampling. |
| Open-license fonts only | **Correct** | `FONTS_DIR` now in `.env.example`. |

**Cost realism:** 3 candidates × up to 3 revise loops × vision critiques can exceed $1.50 in worst case. Fixed in `SCHEMAS.md` §10: parallel candidates, vision after rules, `MAX_VISION_CALLS_PER_JOB=6`, treat $1.50 as rolling average not hard per-job fail.

**Latency:** 3 min is achievable if candidates run in parallel (now explicit in architecture). Sequential would miss the budget.

---

## 3. Cross-doc consistency (after fixes)

| Topic | Status |
|---|---|
| Six Gates definition | Aligned across OUTPUT-FIRST ↔ REQUIREMENTS ↔ SCHEMAS |
| Element count 4–7 | Aligned (was 4–6 vs 4–7) |
| G4 applies to every shipped flyer | Aligned (was "half of outputs" vs every) |
| Product promise vs `below_bar` | Aligned — done only if gates pass; honest failure otherwise |
| Sampler: 1 job seed → 3 lineages | Aligned (was ambiguous: one lineage vs three) |
| Banned-list when/how | Aligned — Stage 7 heuristics, Stage 9 hard fail; detector table in SCHEMAS |
| PDF export | Aligned — post-v1, API returns 501 |
| MCP tool count | Aligned — 6 tools |
| Reading path in DR-1 | Aligned — derived from topology map in SCHEMAS |
| Spec example component names | Fixed — generic `document-before-after-stack`, not Vayami-specific |

---

## 4. Completeness for build agents

### Present and sufficient
- Product bar (`OUTPUT-FIRST`)
- Testable requirements + acceptance tests
- Pipeline stages + principles
- Flowcharts
- REST + MCP API
- Roadmap with hard done-definitions
- Agent laws (`AGENTS.md`)
- Env template
- Changelog discipline
- Data contracts (`SCHEMAS.md`) — **added this audit**

### Intentionally deferred (OK — Milestone 1 work)
- Exact lists of all 12 metaphors / 10 topologies / etc. as code files
- The 25 component React implementations
- Topology recipe JSON for each topology
- Prompt text for brief/idea/composer/critic

### Still thin (known; not blocking Milestone 0)
- Full zod source is not checked into the repo yet — implement from `SCHEMAS.md` in Milestone 0
- Webhook retry/idempotency policy (only payload shape specified)
- Multi-tenant / user accounts (v1 is API-key only — fine)
- Reference-image *structural* imitation (explicitly soft-hint only in v1)

---

## 5. Issues found and fixed in this audit

1. **G3 count mismatch** (4–6 vs 4–7) → unified to 4–7.
2. **G4 "half of outputs" vs every flyer** → every shipped flyer.
3. **"Never see a bad flyer"** vs API `below_bar` → promise rewritten: never mark bad work `done`.
4. **Sampler singular vs 3-candidate fan-out** → job seed → N lineages, metaphors unique, parallel.
5. **Banned-list timing vague** → Stage 7 + Stage 9; heuristic table added.
6. **DR-1 reading path undefined** → topology→readingPath map.
7. **Product-specific component in spec example** → generic name.
8. **PDF listed as current export** → clarified post-v1.
9. **Missing schemas / gate automation how** → `SCHEMAS.md` created.
10. **Font/asset env gaps** → `FONTS_DIR`, asset size/MIME, vision call cap.
11. **AGENTS read order** → includes SCHEMAS + VALIDATION; warns not to build PDF mega-architecture.
12. **Cost target optimism** → operating rules + vision call cap.

---

## 6. Remaining risks (do not "fix" by expanding architecture)

| Risk | Severity | What to do when it bites |
|---|---|---|
| Vision critic still likes generic polish | High | Keep rules first; ask only targeted questions; use banned-list; human-rate early outputs |
| Milestone 1 design content takes longer than coding | High | Budget real designer time; do not skip "looks good alone" bar |
| Gate G2 hard to automate reliably | Medium | Start with vision prompt + human audit; tighten after 50 jobs |
| $1.50 average overrun | Medium | Drop to 2 lineages or 1 revision loop; measure before adding stages |
| Vague prompts with no product visual | Medium | Brief builder must demand evidence role; if no asset and no inventable product UI, prefer document/UI-fragment components over abstract shapes |
| Agents re-expand scope from the PDF | High | AGENTS.md now forbids implementing later-phase PDF ideas |

---

## 7. Build-readiness checklist

- [x] Idea coherent with technical plan
- [x] Requirements testable
- [x] Diversity mechanism specified without memory
- [x] API sufficient for curl-driven development + batch diversity test
- [x] Roadmap ordered with stop-the-line diversity milestone
- [x] Cross-doc contradictions resolved
- [x] Data contracts written
- [x] Agent working rules present
- [ ] Code exists — **start at Milestone 0**

---

## 8. Recommendation

**Proceed to Milestone 0** (skeleton: Fastify, auth, store, hand-written spec → deterministic SVG/PNG). Do not start Milestone 1 creative libraries until the golden snapshot path is green — otherwise you will design components against a render path that still moves.

Treat `docs/IDEA-VALIDATION.md` and the original PDF as **background only**. The build contract is: OUTPUT-FIRST → REQUIREMENTS → ARCHITECTURE → SCHEMAS → ROADMAP → AGENTS.
