# Changelog

All notable changes to Flyero. Format follows [Keep a Changelog](https://keepachangelog.com/); this project is pre-release, so entries are dated, not versioned, until v0.1 ships.

Rule (from `AGENTS.md`): every milestone completion, requirement change, or architectural decision gets an entry here. Agents and humans alike — if you changed direction, write it down.

---

## 2026-08-13 — agent-facing surface audit: trimmed payloads, reinforced guidance, motif folder, docs realignment

A user session flagged the agent-native path directly: tool responses read as
long confusing objects, guidance was only front-loaded (read once at
`read_design_guide`, never reinforced), component reuse felt templated, body
copy quality was unchecked, and docs had drifted from the shipped code. Each
complaint was verified against the real code before fixing — see the
per-item evidence below rather than taking the report at face value.

### Fixed — payload size and duplication
- `POST /v1/studio/assignments` (`request_designers`) repeated the full
  36-component catalogue, propsSchema included, on every sampled lineage —
  ~20KB × `runs` (up to 6). The catalogue now lives once at the top level
  (`componentLibrary`); each assignment carries only `componentsExcluded`,
  the handful of ids (usually none) that don't fit its topology. Measured:
  default 3-lineage response dropped from 69.6KB to 29.1KB.
- `GET /v1/schema/composition` (`get_composition_example`) returned both a
  singular `example` and `examples[0].composition` — the same object twice.
  Dropped the singular field (no back-compat caller existed; the acceptance
  tests only ever read `examples[]`).

### Added — guidance reinforced at the point of use, not just at read time
- `compose_flyer`/`revise_composition` responses now carry an optional
  `reminder`: fires when the submitted element list is exactly the named
  "safe stack" anti-pattern (headline-block + photo-hero + body-paragraph +
  cta-button + footer-lockup), or when a revision repeats the prior
  revision's components unchanged. Computed fresh per request from the
  submission and (at most) the same flyer's own previous revision — no
  cross-job history or dedup store, so it stays inside AGENTS.md law 2.
- Gate G6 gained one more code heuristic: body copy that just restates the
  headline in different words (high shared-content-word overlap in both
  directions) now fails the gate with a note naming both strings. Narrow by
  design — three-word floor plus dual ratios — so it can't fire on a body
  that legitimately echoes one or two headline words.
- `src/mcp/server.ts`: `create_flyer`, `create_flyer_batch` and
  `revise_flyer` (the server-authored path, needs `ANTHROPIC_API_KEY`) are
  no longer registered as MCP tools at all when no server key is configured
  — the common deployment. Previously they were always listed with prose
  telling the agent to avoid them; an agent can't misuse a tool that isn't
  in its list, and the previous approach cost real runs when an agent tried
  the tool anyway and hit a config error.

### Changed — motif library moved from inline code to a folder of SVG files
`MOTIF_DATA` was a ~280-line object literal in `src/components/shapes.ts`,
built from helper-function calls. Extracted every one of its 39 entries into
`src/creative/motifs/**/*.svg` — alongside every other hand-authored creative
data file (metaphors, materials, colour logic, gestures), not under
`components/`, since motifs are library content, not component code — and
organised into subfolders by subject (`celebration/`, `nature/`,
`communication/`, `objects/`). Filename (minus `.svg`, unique across the
whole tree regardless of subfolder) is the motif id; a loader
(`readdirSync`/`readFileSync`, recursive, at module init — this project runs
`tsx` directly with no build/copy step, so the tree resolves identically in
dev, test and prod) replaces the object literal. Point of the change:
growing this library no longer requires reading TypeScript — a single-colour
SVG dropped in anywhere in the tree becomes a usable, theme-recolourable
motif with no code change. Verified byte-identical: the golden SVG
determinism test passed unchanged (same `d` strings, round-tripped through
the new loader) both before and after the `components/` → `creative/` move.

Two more things landed in the same pass, in direct response to "how does an
agent (or a human adding files) know what a motif actually looks like as the
library grows, and what stops someone dropping in the wrong kind of file":
- Every motif SVG now carries a real `<title>` (the hand-written one-line
  descriptions that existed as JSDoc comments on the old object literal,
  restored as actual SVG metadata instead of lost in translation). The
  loader reads it; `guide.ts`'s Motif reference section lists every motif as
  `id — description` instead of a bare comma-joined id list, and is
  generated live off the loader so it can't go stale as motifs are added.
- `loadMotifData` now rejects, at startup, with a clear message naming the
  file: an SVG that sets an explicit `fill` colour on a path (the signal
  someone dropped in a multi-colour icon/illustration export instead of a
  plain single-tone shape), or that embeds a raster `<image>` or a gradient.
  Previously this would have loaded silently and rendered wrong — every path
  forced to one recolour tone, destroying whatever made the source
  multi-colour, with nothing about the failure pointing back at "the file
  wasn't single-tone." Two duplicate ids in different subfolders is now
  also a startup error rather than a silent shadow.

Also fixed a real inaccuracy while in this area: `read_design_skill
composition` cited "a trophy that looks metal" as a `shaded: true` example —
`trophy` is one of the line-art (`stroke: true`) motifs, where `shaded` is
silently ignored by the renderer. `guide.ts`'s composed-figure section now
computes its shaded/unshaded motif lists live from `MOTIFS[m].stroke`
instead of prose, so it can't drift again as the folder grows, and
demonstrates `shaded: true` in its own worked example (previously present in
skill prose only, never shown in the one example agents are told to copy).

**Revised after user feedback, same day**: the folder moved a second time,
from `src/components/motifs/` to `src/creative/motifs/**/` — alongside
every other hand-authored creative-data file (metaphors, materials, colour
logic, gestures), not under `components/`, which is rendering code — and
split into subfolders by subject (`celebration/`, `nature/`,
`communication/`, `objects/`). Also added `searchMotifs(query, limit)`
(`src/components/shapes.ts`) — real ranked lexical search over every
motif's id/title/category, exposed as `GET /v1/schema/motifs?q=...` and the
`search_motifs` MCP tool — rather than waiting for `docs/ROADMAP.md`'s L5
later-phase trigger ("library exceeds ~100 components," embeddings/vector
retrieval specifically) to build *any* discovery mechanism beyond a flat
list. The two are not the same thing: a real, cheap, local lexical search
over a few dozen-to-few-hundred items needs no vector index and no later
gate; embeddings become the right tool once matching needs actual meaning a
word-overlap score can't reach, not at a raw item count chosen before this
particular growth was anticipated. `read_design_guide` still lists every
motif inline (cheap today), `search_motifs` is the tool that keeps scaling
once that list isn't cheap to read anymore.

### Investigated — the "assembled" example's intermittent contrast failure is real, not flaky
Treated three times this session as "a pre-existing flaky test, unrelated" —
wrong to leave at that. `docs/GAP-ANALYSIS.md` item 8 already root-caused
one real mechanism (`composed-figure` only paints ink where it draws marks,
so text near an uneven figure can land on a busier patch than the ink choice
assumed) on 2026-08-05; measuring it directly instead of citing the doc's
"1 in 5-8" estimate (new `scripts/repro-contrast-flake.ts`) found **13-45%
failure rates across repeated batches**, and — the actual new finding — not
every failure fits the composed-figure theory: `banded-masthead` failures
hit the headline specifically, which that topology has no obvious reason to
place near the figure. Logged as `docs/GAP-ANALYSIS.md` item 17 with the
exact next diagnostic step, rather than attempting a blind fix to core
ink-selection code (`inkFor`, `gates/index.ts`'s tone sampling) in the same
pass that already touched a dozen other files. Not fixed; not silenced
either — the gate is correctly catching a real defect and must keep doing
so until the underlying cause is found.

### Removed
- `scripts/probe-resvg.ts` — its own header said "Throwaway... Delete once
  the answers are folded into the code"; untouched since the initial commit,
  answers long since folded in.
- `@types/sharp` devDependency — `sharp` ^0.35 ships its own types; the
  separate package was unused (confirmed with `knip`).
- The `asset-hub/` directory (a separate, untracked Next.js project sitting
  in this working tree) — investigated on request: it turned out to be a
  standalone gallery UI over the *exact same* 12 image providers this
  service already has server-side, with a browser-only "favourites" list and
  no wiring into Flyero at all. No unique capability to preserve.
- `npm audit fix` cleared 3 transitive-dependency advisories (fast-uri,
  hono, nanoid) with no major-version bumps.

### Docs
`docs/API.md` §7 documented only the legacy 6-9-tool MCP mapping; the real
server registers up to 17 tools and the entire agent-native path (10 tools —
the primary, no-server-key path per `guide.ts`/`server.ts`'s own framing)
was undocumented. Rewrote §7 as three tables (agent-native / server-authored
/ shared) and added §3b documenting the seven agent-native REST routes
directly. `docs/ARCHITECTURE.md` said "~25 components" across three
categories; real count is 36 across five (`photo`/`figure` were missing
entirely). Fixed a wrong component id (`document-before-after-stack` →
`before-after-stack`, copy-pasted identically into both `ARCHITECTURE.md`
and `SCHEMAS.md`). `docs/ROADMAP.md` Milestone 6 still described the
pre-code 6-tool stdio plan as upcoming; noted it was substantially pulled
forward already, same pattern as the L1 format work, with the real tool
count and transport.

### Investigated, not changed
- **RAM/CPU on Render**: the 2026-08-10 fix (sharp cache tuning, a leaked
  timer) is correctly wired — `sharp-init.js` is the first import in
  `src/api/server.ts`, the only process that touches `sharp`. If usage is
  still exceeding limits, that commit's own honest conclusion still holds:
  no further JS-level leak found by code audit; the remaining suspect is
  legitimate concurrent memory (`LINEAGES_PER_RUN=3` candidates ×
  `MAX_CONCURRENT_JOBS=2` jobs, each holding real image buffers through
  compose→render→critique at once — `src/core/pipeline.ts`'s
  `Promise.allSettled` fan-out), which needs Render's actual memory graph
  to confirm, not another guess from source alone.
- A `knip` run flagged 53 unused exports and 27 unused exported types
  across `src/`. Left alone deliberately: an unconfigured `knip` run over a
  project with no `knip.json` over-reports (many of these are zod schemas
  and types that are part of a module's intended public contract, not dead
  code), and verifying each one individually is real work that deserves its
  own pass with proper entry-point configuration, not a rushed sweep.

## 2026-08-13 (continued) — real BM25 search, and a permanent curated asset library

Follow-up the same day: the user pushed back hard on the "lexical search is
enough for now" call above — both that it should be real relevance-ranked
search, not ad-hoc point-scoring, and that they specifically want a
*permanent, personal* image library (not just motifs, not just per-job
uploads) they can drop real photos/illustrations into. Built both, for real,
rather than re-explaining the earlier tradeoff a third time.

### Added
- `src/lib/search.ts` — a real BM25 implementation (the ranking function
  Elasticsearch/Lucene/Postgres full-text search use), replacing the ad-hoc
  point-scoring `searchMotifs` shipped earlier today. Weighted fields (id >
  title > category), a small hand-curated domain synonym table (`birthday`
  → `celebration`/`party`, etc.) so a query word that never literally
  appears in a description can still match. Deliberately still not
  embeddings — see the file's own header for the two independent reasons
  (this service had a production OOM incident on a memory-capped box three
  days ago from an unrelated cause; a local embedding model commonly holds
  100-300MB+ once loaded, and adding that blind, untested against the real
  box, in the same week, is not a responsible trade before it's shown to be
  needed at this collection size). `searchMotifs` now calls this instead of
  its own scorer.
- **The curated asset library** (`src/creative/library/`, see its own
  `README.md`) — a third, permanent system alongside motifs and per-job
  assets: full-colour images the user drops in themselves (one image + one
  `.json` sidecar per item, `{ title, tags, license }`, organised into
  subfolders by subject), searchable forever after via the exact same
  `search_images` → `import_image` flow already used for Pexels/Unsplash/etc.
  Implemented as one more `MediaProvider` (`src/core/images/providers/
  library.ts`, `provider: "library"`) wired into the existing aggregator —
  ranked with the same BM25 utility, and given priority position in every
  provider order list (it's the user's own hand-picked content). Fails
  loudly, naming the exact file, when a sidecar is missing `title` or
  `license` — `license` is required specifically because most downloaded
  stock/clipart licenses do not cover a product embedding the image in
  output for other end users (see the Design Bundles finding earlier today);
  the field is a forcing function to write that answer down before the
  image goes in, not a substitute for actually reading the license.
  Referenced via a new `library:<id>` scheme (not a real URL) that
  `fetchCandidate` reads straight off local disk — no HTTP round trip, and
  no risk of the self-referencing-loopback-URL bug already fixed once in
  this codebase (`shareUrl`, `src/mcp/server.ts`).
- 22 new tests: `test/unit/search.test.ts` (BM25 ranking, synonym expansion,
  ties, empty inputs) and `test/unit/library.test.ts` (loader validation
  against real temp-directory fixtures — missing sidecar, missing
  title/license, malformed JSON, id collisions, mixed extensions — plus
  live integration checks that the real, currently-empty library doesn't
  break `search_images`/`isTrustedDownloadUrl`/`fetchCandidate`).

**Revised again, same day, on direct request: the required `license` field
was removed.** Only `title` is required now; `license` is accepted and
recorded if given but no longer enforced. Also added the two things the
user asked for directly after this landed: `transparent` on every
`CuratedItem`, measured from real alpha-channel pixel values (`sharp`'s
`stats()`, not just "does the file have an alpha channel") rather than
trusted from a declared field — surfaced in every search result as
`assetType: "png"` vs `"photo"` and a plain-English `description` — and an
optional `usage` sidecar field ("what is this image *for*") also surfaced
in `description`, since that's the one thing pixel inspection can't answer.
`loadCuratedLibrary` is async now (pixel reads are), with a new
`reloadCuratedLibrary()` so a running server can pick up newly dropped-in
files without restarting. 17 tests now, including one that builds a real
half-transparent PNG with `sharp` to prove detection works on genuine alpha
data, not a hand-typed assertion.

**Third round, same day: role, not just subject, and an examples audit.**
Real gap named directly: a hundred images could all be titled "balloon" and
mean completely different things — a full-bleed background texture, a small
decorative cutout, or the literal product photo. Added an optional `type`
sidecar field (the *same* `MediaAssetType` union every other provider
already uses — `photo`/`background`/`png`/`icon`/`vector`/`svg`/`shape` —
not a second taxonomy), defaulting from measured transparency when unset,
overridable when the default guess is wrong (a background is very often
opaque and would otherwise default to `photo`). Every search result's
`description` now states the resolved role in plain English
(`ROLE_DESCRIPTION`) alongside the measured transparency and any `usage`
note. 3 new tests (20 total for the library), including the exact
balloon/water disambiguation case.

Separately, on request: audited the prompts for the specific failure named —
a single example teaches the shape *and* becomes the template, the same
class of bug `COMPOSITION_EXAMPLE`'s own three-examples-not-one pattern was
built to prevent, just not applied everywhere. Found it unapplied at
`composed-figure`'s own worked example in `guide.ts` — one example (a
badge: seal + "FREE" + sparkle), no variety, no warning. Real risk: it's
exactly the shape a generated flyer would converge on if agents read it as
"the" composed-figure pattern. Replaced with three structurally different
examples (a badge, a left-to-right progression, a dense scatter) plus
explicit "copy field names, never the actual shape" framing, mirroring the
top-level pattern. All three verified through the real `/v1/flyers/compose`
route, not just schema-checked — genuinely render, not merely valid JSON.
`skills.ts` was checked too and left alone: it's pure prose/judgement
already, no JSON template to become a trap.

## 2026-08-10 — resvg silently failed to decode some sharp-encoded WebP photos

Real bug, root-caused properly rather than patched at the symptom: a
`polaroid-stack` rendered as three blank white cards. Traced through in
order — decoded the embedded image straight out of the exported SVG (real
photo, correct WebP, correct dimensions, ruling out the asset pipeline);
rasterized that exact SVG locally with the same `rasterize()`/resvg call
production uses (identically blank, ruling out anything Render-specific);
stripped every filter/clip/rotate down to a single bare `<image>` tag with
nothing else on the canvas (still invisible — not composited wrong, not
drawn at all). Re-encoded the identical source pixels as JPEG instead of
WebP and rasterized the same minimal test: rendered correctly. `@resvg/
resvg-js` cannot reliably decode some WebP files sharp produces — silently,
no error, just nothing drawn — while JPEG decoding of the exact same
content works every time.

### Fixed
- `downscale()` (`src/store/assets.ts`) now re-encodes photographs as JPEG
  instead of WebP (alpha still goes to PNG, unchanged). JPEG was already
  the smaller format in this file's own prior measurements (108KB vs 2-4MB
  PNG) — WebP had no size advantage left to justify keeping it once shown
  unreliable.
- Broadened the trigger: `downscale()` used to only run when an image
  exceeded `MAX_ASSET_EDGE` (1600px), so a WebP asset small enough to skip
  resizing reached the renderer completely unconverted. It now also runs
  (re-encoding without resizing) whenever the input is WebP, regardless of
  size, so no WebP asset can reach storage unconverted.
- Verified against the exact failure at every layer: the isolated
  single-`<image>` repro (WebP invisible, JPEG fine, same pixels), then a
  real `search_images` → `import_image` → `compose_flyer` → export run
  through the actual REST API with a live-imported photo, confirmed
  rendering correctly end to end.

Two related things from earlier the same day, now moot for *new* imports
but worth naming: the asset-self-heal fix and the OOM fix upstream of it
both interacted with this bug while it was live — self-healed WebP files
would have carried the same invisibility forward even once their
mime/dimension mismatch was fixed. Nothing further to do there; this entry
is the actual root cause both of those exposed.

## 2026-08-10 — asset self-heal was writing mismatched bytes (blank photos)

Live bug, found by decoding an embedded image straight out of an exported
SVG (not by trusting the render): a `polaroid-stack` showing three real
photographs rendered as three blank white cards. The `<image>` tag declared
`href="data:image/webp;base64,..."`; the actual decoded bytes were a
4036×6054 progressive JPEG — the stored metadata said `1067×1600`. Wrong
mime label on real bytes is unrenderable, not almost-right.

Root cause: today's own asset-self-heal fix (`readAssetBytes()`, see the
"asset files self-heal" entry above) re-fetches an original provider image
from `provenance.downloadUrl` when its local file is missing — but wrote
those raw, re-fetched bytes straight to disk without re-running them
through the same normalise → downscale → re-encode pipeline `createAsset()`
used at import time. The provider's URL still serves the full-size original
(here, Unsplash's `&fm=jpg` original); the DB's `mime`/`width`/`height`
describe the *processed* asset (WebP, capped at 1600px). The self-heal path
only fired because the Render redeploy for the OOM fix (previous entry)
landed while this session had photos already imported — wiping their local
files exactly the way `readAssetBytes()` is meant to recover from — so this
shipped and broke in the same sitting it was meant to protect.

### Fixed
- `readAssetBytes()` now runs a recovered asset's bytes through
  `normalizeOrientation()` + `downscale()` before writing them back — the
  exact pipeline `createAsset()` runs at import time — so the file on disk
  always matches the mime/dimensions already stored in the database. If a
  provider ever serves something that reprocesses to a *different* mime than
  originally stored (a changed CDN rendition), recovery now fails loudly
  with a clear "re-import it" error instead of silently writing another
  mismatch.
- Verified against the exact failure: imported an asset, deleted its file,
  confirmed the old code path's bug reproduces the mismatch, then confirmed
  the fix recovers a WebP file whose decoded dimensions exactly match the
  stored metadata.

## 2026-08-10 — Render OOM: tuned sharp's native cache, cleared a leaked timer

Render restarted the service after it exceeded its memory limit. Audited every
module-level `Map`/`Set`/cached-promise in `src/` for genuine unbounded growth
(the classic JS-heap-leak shape) before touching anything: the search-result
cache (`src/core/images/providers/cache.ts`) is correctly capped at 500 entries
with working eviction; the unDraw/Simple Icons/Open Doodles provider caches are
one-time, fixed-size dataset caches (44 pages / one slug index / one doodle
list), not per-request growth; the in-memory job queue
(`src/api/runner.ts`) always drains and its `inFlight` set is cleared in a
`finally` regardless of success or failure; nothing keeps an LLM call history
or rendered image bytes in memory outside a single request's scope. **No
unbounded JS-level leak found.**

### Fixed
- **sharp's native cache was never tuned.** It defaults to on (~50MB memory +
  20MB file + 100 operations, native/libvips memory — invisible to a JS heap
  snapshot, which is exactly the "grows over time, gets restarted" shape this
  incident had). Every image operation in this codebase (`src/core/images/
  transform.ts`, `src/store/assets.ts`, tone-map sampling, render
  rasterisation) touches a distinct buffer exactly once — the cache exists to
  speed up *reprocessing the same input*, which never happens here, so it was
  pure overhead. `src/lib/sharp-init.ts` (imported first thing in
  `src/api/server.ts`) now calls `sharp.cache(false)` by default
  (`SHARP_CACHE_MB` env var to re-enable at a chosen size) and
  `sharp.concurrency(1)` — libvips' thread pool otherwise defaults to
  `os.cpus().length`, which under a cgroup CPU limit (Render's starter plan is
  0.5 CPU) commonly still reports the host's full core count, so sharp could
  spin up threads a fractional-CPU container has no real capacity for, each
  with its own working buffers.
- `searchAllProviders`'s per-provider `withTimeout` (`src/core/images/
  providers/aggregator.ts`) never cleared its `setTimeout` once the race
  resolved — one leaked timer per provider per image search, self-bounding
  (each fires within 15s regardless) but real. Now cleared in a `finally`.

Not a leak, but worth saying plainly: I can't see Render's actual memory graph
from here, so this is the strongest lead a full code audit turned up, not a
confirmed root cause — watch the metrics after this deploy. If the instance
still climbs, the next things to check are concurrent-job memory (each
`MAX_CONCURRENT_JOBS` slot holds several full-resolution image buffers through
compose→render→critique at once) and whether the starter plan's 512MB is
simply undersized for real traffic, not a bug at all.

## 2026-08-10 — asset files self-heal after Render's ephemeral disk wipes them

Live bug, reported directly: exporting an older flyer 500'd with a raw
`ENOENT: ... /data/objects/assets/ast_....png`. Root cause was architectural,
not a code mistake: `DATABASE_URL` (Postgres) moved job/asset *metadata* off
the ephemeral Render disk a while back, so `getAsset()` still finds the row —
but asset *bytes* (`src/store/objects.ts`, local filesystem, `STORAGE_DIR`)
were never part of that migration and are wiped on every redeploy/restart
regardless. A DB row that looks entirely valid pointing at a file that no
longer exists is worse than a clean failure, because nothing about the asset
looks broken until something tries to read it.

### Fixed
- `provenance.downloadUrl` is now persisted on every provider-imported asset
  (new `download_url` column, additive migration in `src/store/db.ts`) — it
  was already available at import time (`POST /v1/assets/import`'s request
  body) and simply wasn't kept.
- `readAssetBytes()` (`src/store/assets.ts`): reads the local file if present;
  if missing AND the asset is an original (non-derived) provider import with a
  stored `downloadUrl`, transparently re-fetches and re-writes it, then
  returns the bytes — the exact "we already know where this came from, just
  get it again" idea. Deliberately does NOT apply to a derived/transformed
  asset (`parentId` set) — re-fetching the source would silently swap back in
  the un-cropped original in place of whatever `prepare_asset` did to it, a
  worse bug than the one being fixed. A direct upload has no source to
  recover from either way.
- `assetDataUri()` now goes through `readAssetBytes()` (necessarily async now
  — updated all four call sites: the flyer export re-render path, both
  `compose_flyer`/`revise_composition` handlers in `src/api/agent.ts`, and
  `src/core/pipeline.ts`'s `create_flyer` path).
- The flyer export re-render path, the transform route, and `GET
  /v1/assets/:id/file` now catch a genuinely-unrecoverable read (a lost
  direct upload) and return a clean `404 not_found` with an explanation,
  instead of an unhandled 500 with a raw stack trace.
- Verified live: imported an asset, deleted its file to simulate a redeploy
  wipe, confirmed `GET .../file` transparently recovers and re-writes it;
  did the same for a direct upload and confirmed a clean 404 instead of a
  crash (caught one real bug in the process — `reply.type()` was being called
  before the risky `await`, which left the reply's content-type stuck on the
  image mime and made the *error response itself* fail to send).

Not done, and worth a real decision rather than a quiet fix: object bytes are
still local-disk-only. The honest long-term fix is durable storage for
`STORAGE_DIR` itself (S3-compatible, already anticipated in
`docs/ARCHITECTURE.md`'s storage row) or a Render persistent disk on a paid
plan — this change only closes the gap for the common case (search-imported
assets), not uploads.

## 2026-08-10 — agent prompts: invent, don't remix; fix MCP tool discovery

Live agent sessions were still template-filling: fetch `get_composition_example`,
keep headline / photo-hero / body / CTA / footer, swap product words. Tool search
also loaded the wrong shortlist — queries like "request designers assignment
lineage" returned `revise_flyer` / `create_flyer_batch`, and "search images"
missed `search_images`.

### Changed
- `guide.ts` / `skills.ts` / MCP server instructions: lead with the failure mode,
  invent-visual-sentence-first order, explicit "examples are JSON shapes not
  flyers", refuse the safe stack, and a tool table keyed to the intended path.
- Third published composition example `exchange-led` (`chat-exchange`) so the
  range covers photo / assembled / conversation — none reads as the answer.
  Schema notes scream remix-is-wrong.
- MCP tool descriptions: discovery keywords (`designer assignment`, `lineage`,
  `Search images`, `design guide`, `schema shape`); server-key tools demoted to
  `SERVER-KEY ONLY / LAST RESORT` so they stop winning general searches.
- `docs/FLOW.md` notes that composition examples teach shape, not a template.
- Tests: three examples compose end-to-end; guide/skills anti-template asserts;
  MCP description keyword asserts.

## 2026-08-10 — elevated AI agent creativity, design posture & contrast legibility

Upgraded the agent prompt architecture across MCP instructions (`src/mcp/server.ts`),
the onboarding guide (`src/api/guide.ts`), and design skills (`src/api/skills.ts`).
The instructions now explicitly push the LLM agent to think like an award-winning
poster artist rather than a default template builder. Key improvements:
- Mandated non-repetition across jobs (varying evidence component families, reading paths,
  and CTA styling across runs).
- Deepened creative posture guidance in `guide.ts` and `skills.ts`, detailing how to leverage
  unconventional component choices (e.g. `scene-illustration`, `polaroid-stack`, `photo-cluster`,
  `photo-grid`, `torn-photo`, `document-card`, `before-after-stack`, `detail-cluster`, `composed-figure`).
- Hardened text ink selection in `src/components/primitives.tsx` (`inkFor` now evaluates box font size
  and calls `ensureContrast` over measured ground tone), resolving edge-case contrast gate failures.
- Verified all 231 tests pass cleanly across unit, golden snapshot, and acceptance suites.

## 2026-08-10 — agent guide now pushes harder on creative variance

The API guide text for agent-facing flyer creation was too checklist-like and
let models settle into familiar, generic compositions. Tightened the prose to
do three things more explicitly: push for a specific visual sentence instead of
a template, tell the agent to vary evidence family / reading path / CTA shape
across jobs, and call out the actual tool sequence (`read_design_guide`,
`read_design_skill`, `request_designers`, `get_composition_example`,
`import_image`, `compose_flyer`) so the prompt matches the tools the agent sees.

## 2026-08-10 — cta-button's printed URL overlapped the next element down

Same live test, second real bug: after the EXIF fix, the rebuilt flyer's
"solid"-style CTA button had its URL caption (`vayami.ai/waitlist`-style
text, drawn by `cta-button` itself below the plate) landing almost exactly
on top of `footer-lockup`'s brand name one element below it — both texts
legible-but-smashed together in the exported PNG.

Root cause: `cta-button`'s `intrinsicHeight` (`src/components/content.tsx`)
returned a fixed 72px for the "solid" style — exactly the button plate's own
height, with no allowance for the URL line `render()` draws *underneath* it
(`${id}-url`, at `box.y + min(box.h,72) + 12`). The layout solver sizes each
element's box from `intrinsicHeight` alone (`src/core/layout/solver.ts`), so
whatever `render()` draws past that box simply spills into the next element
down — a collision the mechanical `noCollisions` gate doesn't catch because
it reasons about element boxes, not sub-element paint outside them.

### Fixed
- `intrinsicHeight` now takes `copy.cta.url` into account (the function
  already received `copy` as its 4th argument — solver.ts passes it, this
  was just the one component not using it) and adds 44px of real room when
  a URL will be printed. Verified two ways: swept 20 fixture lineages with
  the CTA forced to `style:"solid"` and checked cta-box-bottom vs.
  footer-box-top for every one (no overlap), then rendered one through the
  real pipeline offline and looked at the PNG — button, URL and brand name
  now sit with clean space between them.

## 2026-08-09 — EXIF-rotated photos were stored sideways (found via live multi-provider test)

Ran the new multi-provider search end to end through a real MCP agent session
(coffee-shop flyer, Wikimedia photo). The exported flyer's hero photo was
real image data — verified by decoding the embedded webp straight out of the
SVG — but rendered turned 90°, reading as an unrecognizable diagonal smear
over the crop band. Not a rendering-pipeline bug: `sharp(buffer).resize(...)`
in `downscale()` (`src/store/assets.ts`) never called `.rotate()` (sharp's
EXIF auto-orient), and `imageSize()` (`src/lib/imagesize.ts`) reads raw
JPEG/WebP frame headers, which are silent about EXIF orientation entirely.
A camera/phone JPEG with an orientation tag (confirmed live: a Wikimedia
photo at raw 4128×2322 px, tag 6, meant to display at 2322×4128) got
measured sideways, downscaled sideways, and re-encoded sideways with the
tag dropped on the way — nothing left downstream to ever correct it.

Pexels and Unsplash pre-rotate server-side, so every photo Flyero had ever
imported before today was already upright by the time it arrived — this bug
existed on day one but had no way to manifest until a provider serving real
camera-original files (Wikimedia, Openverse, a user's own phone upload via
`upload_asset`) actually got exercised.

### Fixed
- `normalizeOrientation()` (`src/store/assets.ts`) bakes EXIF orientation
  into the pixel grid via `sharp(buffer).rotate()` before `imageSize()` ever
  measures the image or `downscale()`/`analyze()`/`computeToneMap()` touch
  it — one normalization point at the top of `createAsset()` so every
  downstream step (dimensions, crop, vision analysis, tone map) agrees with
  what a viewer actually sees. Verified against the exact failing file:
  before, `{width:4128, height:2322, orientation:6}`, visibly sideways;
  after, `{width:2322, height:4128, orientation:undefined}`, upright.

## 2026-08-09 — Multi-provider asset search: 12 sources, no key required by default

`search_images`/`POST /v1/assets/search` was a single-provider Pexels wrapper
gated entirely on `PEXELS_API_KEY` — unset, and an agent's only path to a
picture was asking the user to upload one. Ported the provider adapters from
the sibling `asset-hub` project (a standalone aggregator that proved this
approach out) into `src/core/images/providers/`, vendored rather than called
over HTTP so Flyero stays the single Node service CLAUDE.md describes.

### Added
- 12 asset providers behind the existing `ImageProvider` interface: Pexels,
  Unsplash, Pixabay (real photos, keyed), Openverse, Wikimedia (photos,
  unauthenticated), SVGRepo/Iconify + Color Icons (SVG icons/brand marks),
  unDraw + Open Doodles (illustrations), Simple Icons (brand logos), and two
  fully local generators — Shapes (dividers, arrows, badges, speech bubbles,
  procedurally rendered, zero network) and QR Code (`qr:<url>` query). Nine
  of the twelve need no API key at all, so `search_images` is now available
  out of the box — an agent should reach for it before ever asking the user
  for stock imagery, matching the two-source split already documented
  (user's own asset -> `upload_asset`; anything else -> `search_images` +
  `import_image`).
- `ImageSearchQuery.type` (photo | svg | icon | vector | png | background |
  shape, single or array) and `.provider` (pin to one named source) —
  callers can now aim a search at exactly the kind of asset a slot needs
  instead of only ever getting photographs.
- `isTrustedDownloadUrl()` (`src/core/images/search.ts`) — an exact-hostname
  allowlist across all provider CDNs plus inline `data:image/svg+xml` for
  the two local generators. Replaces the old single-regex Pexels-only guard
  on `POST /v1/assets/import` with the same SSRF-safe intent, now correct
  for a dozen sources instead of one.
- `fetchCandidate()` now decodes `data:` URIs directly (shapes/QR codes are
  generated, not hosted — there is nothing to fetch).

### Changed
- `docs/API.md` §2 documents `POST /v1/assets/search` and
  `POST /v1/assets/import`, which existed in code but were never written up
  (AGENTS.md doc-parity law) — the MCP tools wrapping them were already
  shipping undocumented.
- `docs/DEPLOY.md` reframes stock keys as optional upgrades, not a gate:
  search works unauthenticated; `PEXELS_API_KEY`/`UNSPLASH_ACCESS_KEY`/
  `PIXABAY_API_KEY` only add real photo libraries on top.
- MCP `search_images`/`import_image` tool descriptions and the top-level
  server instructions rewritten to describe the full catalogue and the
  `type` filter, so a connected agent knows to search before it asks.

Not done: `asset-hub`'s own Next.js app is not deployed or called at
runtime — only its provider *logic* was ported. Its zero-persistence,
unauthenticated `/api/search` design (no DB, ids that only round-trip inside
one browser session) made it unsuitable to depend on directly; Flyero's own
asset store already gives every imported asset a durable `ast_…` id.

**Known caveat, carried over from asset-hub, worth a human decision later:**
unDraw and Open Doodles have no public search API — both providers scrape
their sites' HTML per query (1h page cache). `docs/GAP-ANALYSIS.md`
(2026-08-0x, decor-library sourcing) already flagged that unDraw's terms
prohibit "automated/bulk scraping" in the context of a *bulk download,
checked-in library* — this is a live, per-query, never-redistributed fetch
instead, which is a different act, but it is still automated access to a
site whose terms weren't written with that distinction in mind. Not
disabled here since Pexels (a live third-party API call, same shape) was
already the precedent; flagging for a real legal read rather than a silent
ship.

## 2026-08-05 — Hosted-connector upload fix, three gate holes closed, ornament over photos

Second pass the same day, prompted directly by watching a real Claude
connector session and a real MCP tool trace fail. Six changes, each a
confirmed live bug or a law-5/law-4 hole, not a taste call.

### Fixed
- **`upload_asset` required a local filesystem path.** The exact tool
  definition is shared between the stdio MCP server and the remote HTTP MCP
  transport (`src/mcp/http.ts`, AGENTS.md law 6), and a hosted Claude.ai/
  Desktop connector has no shared disk with the user at all — an attached
  image arrives as inline bytes, not a path. Watched live: the connected
  agent invented an "uploads folder", found it "empty", and gave up with
  placeholder imagery. Now accepts `data` (base64) as well as `path`, with
  both the tool description and the top-level auto-delivered instructions
  explaining the distinction and warning against inventing a local file.
- **Gate G6 (no invented facts) only ever inspected `spec.copy`.** An
  invented claim placed in a component prop instead
  (`annotation-label.text = "Sunrise is at 5.40am"`, from an earlier live
  run) reached the page untouched — props are exactly where an agent puts
  short factual text. Now every string nested anywhere inside every
  element's `props` gets the same slogan/hollow-word and unsupported-
  statistic scan `copy` already gets; `STAT_CLAIM_PATTERN` extended to catch
  time-of-day claims, the exact shape of the original bug.
- **A reported vision collision never blocked `done`.** `vision.collisions`
  only ever reached `notes`; a verdict listing three collisions could still
  return `status: done`. Added `mechanical.noCollisions`, so it fails
  `passed` the same way every other mechanical check does.
- **Ornament was invisible on every `photoGround` topology.** A photoGround
  evidence element's box *is* the canvas, so its zero-tolerance decoration
  keep-out covered 100% of the page — no ornament could ever clear it, on
  exactly the briefs a graphic language should do the most for. `layer:
  "over"` decorations (badges, sparkles, bunting — a normal design move on
  top of a photo) now get an explicit exemption from that specific keep-out;
  `under`/`with` stay zero-tolerance, since crowding the photo from behind
  or beside it is what actually costs Gate G2.
- **`ToneField.paintPhoto` claimed every photo was equally busy.** A
  hardcoded `variance = 0.12` for every photo cell meant text within one
  90px grid cell of *any* photo edge inherited a busy verdict regardless of
  what that photo actually showed there. Now computed from the photo's own
  measured 8×8 tone map (local 3×3-neighbourhood spread), floored at 0.02.
  Found alongside it: the gate's failure note displayed a different, more
  flattering contrast ratio than the one `legibleFor` actually decided on
  (a 4.47:1 near-miss showed up in a note as "12.12:1") — fixed to compute
  from the same formula.
- **Ink-consultation sweep.** Three components GAP-ANALYSIS.md had tracked
  as picking ink blind (`cta-button`, `eyebrow-label`, `footer-lockup`) were
  confirmed already fixed by earlier work, not re-touched. A fresh sweep for
  the same pattern across every component file found two real remaining
  instances — `score-ring`'s value/label text and `waypoint-marker`'s label —
  both gate-checked roles, both fixed.

### Also
- `headline-block`'s `plate`/`band` treatment (type reversed out of a solid
  colour block — the "box behind text" device most reference posters use)
  was fully built and completely undiscoverable: its own `visual.reads` line
  never mentioned it. Same failure class as the 2026-08-02 fix that made 28
  components reachable, for a prop instead of a component. Fixed.

Full root-cause detail, including two corrected wrong theories from earlier
in this file's own history, lives in `docs/GAP-ANALYSIS.md`.

---

## 2026-08-05 — Coverage floor gate, gradient-wash contrast fix, reachability sweep

Closed the five open items `docs/GAP-ANALYSIS.md` was tracking under
"Working order", plus two more found while closing them.

### Added
- **`mechanical.coverage`** (`src/core/canvas/coverage.ts`), GAP-ANALYSIS.md's
  own top-priority item: nothing previously caught a flyer that cleared G3's
  4-7 element count and every colour check while still reading as an empty
  page — a headline, a CTA pill and two small motifs on a flat background.
  Grid-based canvas coverage (element boxes + decoration bboxes, ground
  exempt, same convention as `decor/budget.ts`'s ink cap), floor 0.32,
  calibrated against 40 fixture-sampled designers.

### Fixed
- **Gradient-wash contrast blind spot.** The blanket palette check compared
  accent/muted/fg against the flat page colour, not a gradient wash's
  actually-darker stop (derived from accent itself, not guaranteed lighter
  than base). Fixed in `gates/index.ts` and `ground.ts` (`docs/GAP-ANALYSIS.md`
  item 7). Surfaced a real ink bug in the photo-hero scrim decision
  (`solver.ts`, item 8) and a deeper, still-open ring keep-out gap
  (`scallop-frame`, item 8) — recorded, not papered over.
- **A real-estate flyer's hero photo rendering as an unrecognisable blur**,
  found testing real prompts end to end. The guide's own image-prep table
  steered straight into the `bg-plate-blur` preset (sigma 12, meant for pure
  atmosphere) for a subject photo that needed to stay recognisable for Gate
  G2; `photo-hero`'s built-in scrim was the right tool and was documented two
  sections later in the same guide, easy to miss. Rewrote the table and the
  preset's catalogue description (`docs/GAP-ANALYSIS.md` item 9).
- **Reachability.** `kawaii-doodle`/`festive-scene` wired into
  `crafted-collage`'s graphics pool, not just `botanical-celebration`.
  `shaded` motif/shape parts documented in the composition skill (item 6).

### Investigated, confirmed not a live bug
- The speech-bubble-with-no-shape render from an earlier live session: the
  motif renders correctly in isolation across flat/shaded/three sizes
  (now permanent coverage in `scripts/sheet-figures.ts`). Matches the
  already-documented failure class of an LLM-authored `composed-figure` part
  passing a bad parameter, not a defect in the shape data.

---

## 2026-08-05 — Postgres-backed store for production (job/asset data survives redeploys)

Render's filesystem is ephemeral and `render.yaml` provisions no persistent
disk, so the SQLite file the store used to write to was wiped on every
deploy — a live flyer disappeared this way, and every push during this
session had likely been quietly destroying it further. AGENTS.md law 10 (the
per-job process log is never deleted) cannot hold against a filesystem that
gets discarded out from under it. Fixed at the root: the store now runs on
Postgres in production, not by adding a disk.

### Changed
- **`src/store/db.ts` — dual backend.** SQLite (`better-sqlite3`) when
  `DATABASE_URL` is unset — this stays the zero-setup path for local dev and
  `npm test`. Postgres (`pg`) when it is set — this is production. Every
  caller writes one dialect of SQL (Postgres-style `$1, $2, ...`
  placeholders) through `dbRun`/`dbAll`/`dbGet`; for the SQLite path these
  are translated to `?` by placeholder *number*, not by position, so a query
  that legitimately reuses the same `$N` twice (`createJob`'s
  `created_at`/`updated_at`) still binds the right value to each occurrence
  on both backends.
- **`src/store/jobs.ts`, `src/store/assets.ts`** — every exported function
  that touches the database is now `async`; every caller across
  `src/api/server.ts`, `src/api/agent.ts`, `src/api/runner.ts`,
  `src/core/pipeline.ts`, and `src/llm/index.ts` now awaits it.
- **`cost_events.id`** switched from an autoincrement integer to a
  `ulid()`-generated `TEXT` primary key — the value was never read anywhere,
  and this lets the same `CREATE TABLE` text run unmodified on both backends
  instead of branching the DDL per dialect.
- **`config.ts`** — added `databaseUrl` from `process.env.DATABASE_URL`.
- **`render.yaml`** — documented `DATABASE_URL` as an expected (`sync:
  false`) env var, matching how it's actually set in the Render dashboard.

### Fixed (found while verifying against a real Neon database, before push)
- `test/setup.ts` never cleared `DATABASE_URL`, so with it present in the
  developer's own `.env` (needed for the manual production test below),
  `npm test` was silently hitting the real production Neon database instead
  of an isolated SQLite file — and, run in Vitest's parallel workers, several
  test files raced each other's `CREATE TABLE IF NOT EXISTS` against it,
  surfacing as a Postgres `pg_type_typname_nsp_index` unique-constraint
  violation. Tests must never touch real data (this file's own comment says
  so); fixed by explicitly setting `DATABASE_URL = ""` in test setup so the
  isolated per-run SQLite path always wins regardless of what's in `.env`.
- The `$1, $2, ...` → `?` conversion above was originally position-based
  (`sql.replace(/\$\d+/g, "?")`), which breaks the moment a query reuses a
  placeholder number — exactly what `createJob` does for
  `created_at`/`updated_at` (`..., $11, $11`). Postgres accepts this; SQLite
  doesn't, since each `?` needs its own bound value, so the run failed with
  `RangeError: Too few parameter values were provided`. Rewritten to expand
  params by the placeholder's actual number rather than by scan order.

### Verified
- `npm test` — 221/221 passing against the isolated SQLite path.
- A manual round-trip (create → read → update) against the real Neon
  `DATABASE_URL`, run and then cleaned up by hand, confirms the Postgres path
  works end to end, not just type-checks.

---

## 2026-08-05 — Motif library expansion: 12 hand-authored vector marks

Expanded Flyero's hand-authored decorative motif library (`src/components/shapes.ts`) with 12 new vector marks spanning food, retail, music, celebration, symbols, travel, and awards.

### Added
- **12 new motifs** (`src/components/shapes.ts`):
  - `coffee-cup`: line-art coffee mug with dual wavy steam lines.
  - `bell`: line-art ringing bell with clapper droplet and top hanger loop.
  - `music-note`: line-art double eighth note pair connected by top beam.
  - `crown`: line-art five-pointed regal crown with base band and peak jewels.
  - `tag`: retail price tag silhouette with punched circular hole (`fillRule: "evenodd"`).
  - `trophy`: line-art victory cup trophy with handles and pedestal.
  - `peace-sign`: line-art circular peace symbol with vertical and diagonal arms.
  - `drink-cocktail`: line-art martini glass with stem, base, and olive toothpick garnish.
  - `donut`: ring donut shape with center hole punched through (`fillRule: "evenodd"`).
  - `palette`: artist color palette silhouette with thumbhole cutout (`fillRule: "evenodd"`).
  - `anchor`: line-art maritime anchor with top ring, shank, stock, and flukes.
  - `clover`: line-art four-leaf clover doodle with heart-shaped lobes and curving stem.

### Fixed (found while verifying by render, before push)
- 11 of 12 rendered correctly on the first check. `palette` did not: its
  thumbhole was spliced into the *middle* of the body's own path string
  rather than appended as an independent closed subpath after it, which
  breaks one closed shape into a self-intersecting one — it rendered as a
  blob with a stray diagonal slash through it, not a checkerboard-style
  failure but a real one all the same. Rebuilt as a plain oval body plus
  five independent hole subpaths (one thumbhole, four paint-daubs) —
  every hole an `evenodd` motif punches must be its own separate closed
  subpath after the body's, never inserted inside it.

---

## 2026-08-05 — The six gaps from the two-reference review, closed

Direct follow-through on the "AVERY TURNS 26" / "HAPPY BIRTHDAY Samira!"
review earlier the same day: two capabilities that already existed just
weren't being reached, four genuinely didn't exist. All six addressed.

### Added
- **Bunting/pennant string** — `buntingStringPath` (`shapes.ts`) plus a new
  `bunting-string` `DecorForm`. Budgets its cord-sag and pennant-drop as
  fixed fractions of its own rect height (40% / 60%) so the declared bbox
  always matches the true ink extent — the first version derived the split
  from pennant width instead and could draw pennants past its own bbox,
  which is the same class of bug a full-page frame decoration already hit
  once. Needed a new `"banner"` `DecorZone` too: the existing `"edge"` zone
  returns a *square* region sized off one `size` value, which is the wrong
  shape for a wide short band and collided with whatever sits at the top of
  the page on almost every attempt. Wired into `festive-scene`.
- **`accent2` on `Palette`** (`colorlogic.ts`) — every generator now returns
  a second, hue-related accent (fixed +36° rotation off the resolved accent,
  lightness nudged for separation), computed once in the shared `finish()`
  so none of the 10 generators needed individual changes. Exposed to
  `composed-figure` via a new `"accent2"` tone. This is what makes a
  genuine multi-colour balloon cluster possible — previously every palette
  had exactly one accent, so "shaded" balloons could only ever be one colour.
- **`soft-pastel-multi` colour logic** — a genuine pastel palette (previously
  every one of the 10 generators was single-accent, duotone, or one
  saturated field; none produced a soft multi-hue page). Deliberately
  restricted to specific hue bands (pink, lavender, soft blue, mint) rather
  than reusing `baseHue()`'s wider range: a first version using the general
  range landed on a yellow-green base that `ensureContrast` darkened into
  khaki/olive, not pastel — some hues read as "soft" once darkened for AA
  text contrast and some read as "muddy," and that has to be chosen for, not
  left to chance. Wired into `botanical-celebration`.
- **`role: "accent"` on `composed-figure`'s `word` parts**, plus `accent`/
  `accentWeight` on `FontPair` (set on `anton-inter` and `bungee-inter`,
  pointing at the already-downloaded Great Vibes script face — no new font
  fetch needed). Lets a composition mix a bold display headline with a
  flowing script word ("HAPPY BIRTHDAY" + "Samira!") instead of every line
  on the page sharing one register. Falls back to the display font when a
  pair defines no accent, so it can never force an ugly combination.
- **Background "ghost" texture** — no new mechanism needed, `weight: "wash"`
  motifs already existed and are already exempt from keep-out/tone checks.
  Verified the effect (a large, barely-there shape behind the composition)
  actually reads correctly at scale, then wired a real one into
  `festive-scene`. Confirms the plan-mode assumption from earlier in the day
  ("probably reachable already, lower confidence, would need to actually
  test") — it needed testing, then five minutes of wiring, not new code.
- Skills guidance for the two already-existing-but-unused capabilities:
  scattering rotated `word` fragments around a headline instead of a plain
  eyebrow, and reaching for `big-numeral` directly for a page-dominating
  figure. Same reachability lesson as the 2026-08-02 `visual`-field fix —
  a capability nobody is told about might as well not exist.

### Fixed
- **`FittedLine` computed a font-family override and then never passed it to
  the `TextBlock` it renders through** — `TextBlock` re-derived its own
  family from `role` independently, silently discarding the override. Found
  while verifying the `role: "accent"` word feature above: the accent word
  rendered in the *display* font, not the script one, even though the
  override was correctly resolved one level up. `family` is now threaded
  through both `FittedLine` and `TextBlockProps`. This bug would have
  silently defeated the plate/band pill-shape work from earlier in the day
  too, had that path gone through `FittedLine` — it doesn't, so it didn't,
  but the fix is the same class of "computed the right thing, dropped it on
  the way to the renderer" issue found twice today.

### Found, not fixed (recorded, not silently absorbed)
- `runGates`'s "contrast" mechanical check fails intermittently (~2 of 7
  sampled) whenever a `gradient-wash` ground is drawn — pre-existing,
  confirmed on `organic-blobs` (untouched this session) at the same seeds,
  not something today's work introduced. Likely checks `accent` against
  `theme.palette.bg` rather than the gradient's actual darkest rendered
  stop. Not fixed here — found while gate-auditing the bunting work, out of
  scope for this pass, added to `docs/GAP-ANALYSIS.md`'s Working order.

### Verification
- All 12 graphics × 14 topologies (168 combinations) checked for mechanical
  gate failures, contrast excluded (see above) — clean.
- Bunting, multi-colour clusters, pastel palette, mixed type register, and
  the background wash each rendered and visually confirmed, not just
  gate-checked.
- Full suite green (`npm test`).

---

## 2026-08-05 — Checked two free sticker sources, kept neither; added line-art motifs instead

### Decisions recorded
- **Checked OpenMoji (CC BY-SA 4.0, official bulk download, ~4,500 icons
  including a recolourable single-tone variant) and unDraw (excellent
  license, but explicitly forbids automated/bulk downloading) as sources for
  richer decorative stickers.** Decided against bulk-importing either:
  OpenMoji's attribution+share-alike requirement has no display mechanism
  anywhere in the product today (the same gap already exists silently for
  Pexels photo attribution), and unDraw can't be automated without violating
  its terms. The library keeps growing by hand-authored `MOTIF_DATA` entries
  instead — same convention as everything already there. Full reasoning in
  `docs/GAP-ANALYSIS.md`.

### Added
- **`Motif.stroke`** (`src/components/shapes.ts`) — a motif can now be
  line art (outline, no fill) instead of a filled silhouette, wired into
  both render paths that draw motifs (`src/core/render/ground.tsx` for
  decoration, `src/components/figure.tsx` for composed-figure parts).
  Filled motifs are unaffected; a `shaded` composed-figure part is ignored
  for a stroke motif, since a gradient sheen has nothing to fill.
- **Three new motifs** using it: `cake` (two-tier, three lit candles),
  `bow` (two loops, a knot, notched tails), `sparkle-doodle` (a scattered
  three-sparkle cluster) — the hand-drawn sketch register the doodle/
  scrapbook references use, which a filled silhouette can't reach.

### Fixed
- `test/unit/shapes.test.ts`'s "every motif is a well-formed path" check
  required every motif's `d` to end in `Z` (closed) — true for a filled
  shape, wrong for line art with legitimately open subpaths (an open candle
  stroke, a bow's tail). Exempted `stroke` motifs from that specific check.

---

## 2026-08-05 — Shaded motifs, and a live agent run that found four real gaps

Drove a real MCP session end to end (external agent, real brief) against
today's earlier motif/frame/format work to see how it actually held up, not
just how it rendered in isolation. Full trace in `docs/GAP-ANALYSIS.md`
2026-08-05 — summary here per AGENTS.md.

### Added
- **`shaded: boolean` on `composed-figure`'s `motif` and `shape` parts**
  (`src/components/figure.tsx`), default `false` so nothing existing changes.
  When set, renders a highlight-to-shadow radial gradient keyed off the
  flyer's one light (`src/core/canvas/light.ts`, already used by photos and
  panels, just never wired into motifs/shapes) plus a matching contact
  shadow, instead of a flat single-colour fill. Turns a flat balloon/gift
  silhouette into something that reads as a rendered object sitting in the
  same lit scene as everything else — and because the gradient is derived
  from the part's own `fill` at render time, recolouring it is still one
  prop, not a new asset.

### Decisions recorded
- **Considered and rejected raster stickers (licensed packs) and
  AI-generated sticker images** as the fix for "flat-looking decoration,"
  in favour of vector shading. Neither raster option is recolourable, a
  pre-lit raster asset fights the single-light system instead of joining it,
  and a bundled sticker pack is exactly what `shapes.ts`'s own header already
  rejects (licence, house style). Vector shading was the only option that
  actually satisfies "an agent can adjust its colour" and "it blends with
  everything else," which is what was actually asked for. Full reasoning in
  `docs/GAP-ANALYSIS.md`.
- Confirmed and documented the motif/asset distinction for future
  contributions: `MOTIF_DATA` entries are theme-recoloured at render time;
  uploaded assets (logos, images via `POST /v1/assets`) are not and never
  will be by this mechanism.

### Found, not yet fixed (tracked in `docs/GAP-ANALYSIS.md`'s Working order)
- `kawaii-doodle`/`festive-scene` are reachable from only one art direction
  (`botanical-celebration`) — an agent reading "hand-drawn collage" reasonably
  lands on `crafted-collage` instead and never sees them.
- No colour-logic generator produces a genuine multi-hue pastel palette.
- Nothing yet points an agent at the new `shaded` option — it exists but
  isn't surfaced, the same reachability failure the 2026-08-02 `visual`-field
  fix already happened once.
- A `speech-bubble` motif part rendered as bare text with no bubble shape in
  the live run — not yet root-caused.

---

## 2026-08-05 — Multi-format support (L1, pulled forward)

User directly asked for size-awareness — the agent choosing among several
canvas dimensions, not just the one fixed portrait — in the same request that
prompted the motif/frame work above. `docs/ROADMAP.md` had gated this behind
"Milestone 6 users ask for them" (L1); recording here, per AGENTS.md, that the
trigger fired directly instead of through that milestone. `docs/ROADMAP.md`
L1 row updated to point at this entry.

### Added
- **`src/creative/formats.ts`** — a `Format` dimension (`{id, w, h, safe, label}`),
  not a Studio Sampler dimension (format is chosen by the caller, not sampled
  per lineage). Three to start: `portrait-4x5` (1080×1350, the original,
  still the default everywhere), `square-1x1` (1080×1080), `story-9x16`
  (1080×1920).
- **`format` threaded end to end**: `POST /v1/flyers`, `POST /v1/batches`,
  `POST /v1/flyers/compose` (agent-native path), the `create_flyer` /
  `create_flyer_batch` / `request_designers` MCP tools, and a new
  `GET /v1/formats` for discovery. Every entry point defaults to
  `portrait-4x5` when omitted, so no existing caller's behavior changes.
  `jobs`/`batches` gained a `format` column (additive `ALTER TABLE`
  migration in `src/store/db.ts`, same pattern as the existing asset-transform
  columns — an existing local `data/flyero.db` upgrades in place).
- `src/core/compose/spec.ts`'s canvas schema now validates `w`/`h` against
  `isKnownCanvasSize` instead of a hardcoded `z.literal(1080)/z.literal(1350)`.

### Fixed
- **`type-poster`'s headline could overflow the canvas on a shorter format.**
  The recipe's `headlineCeiling: 0.24` sizes off canvas *width*, which is
  1080 in every format here, but the solver lets the headline box grow past
  its nominal slot height to fit the text (`solver.ts` §3, by design — the
  box grows rather than the text always shrinking to a fixed slot). That
  read fine against the tall portrait canvas it was tuned against and
  visibly clipped on `square-1x1`'s shorter one at 4 lines near ceiling.
  Capped to `0.19`/3 lines — verified against all 14 topologies on all 3
  formats (mechanical gates + a structural off-canvas-box check) after.

### Verification
- Every topology recipe rendered at every format and eyeballed (normalized
  0–1 rects mostly port automatically, as `ARCHITECTURE.md` intended — only
  `type-poster` needed a change). `story-9x16` needed none — extra vertical
  room only helps. The five pre-existing intentional bleed topologies
  (`split-editorial`, `oversized-anchor`, `layered-depth-stack`,
  `off-center-hero`, `asymmetric-two-column`) show the same boxes running
  past the canvas edge in all three formats, confirming that's by design
  (`recipe.bleed`), not new breakage.
- `runGates` mechanical checks (overflow, WCAG-AA contrast, safe margins,
  banned-list) pass across the full 3-format × 14-topology product.
- Full suite green (`npm test`).

### Decisions recorded
- `assembleSpec`'s 4th parameter is the resolved `{w, h, safe}`, not a
  `FormatId` — a revision must reuse the *stored* spec's own canvas exactly,
  and re-deriving a `FormatId` from stored dimensions to look it back up
  would be a lossy round-trip for no reason. Fresh composition resolves a
  `FormatId` to that shape via `formatById` at the call site instead.
- Deferred: auditing every graphic language's `grounds`/`slots` scale ranges
  per format (the new `wobble-frame`/`scallop-frame` insets, decor `scale`
  fractions, etc. are all width-relative and looked fine in this pass's
  renders, but weren't exhaustively swept the way topology recipes were).

---

## 2026-08-05 — A thicker motif/frame vocabulary, and a real onDark bug it exposed

User feedback, with four reference posters (a halftone vintage bazaar flyer, a
Y2K/Memphis grid, a kawaii doodle scrapbook page, a festive birthday card):
the range of decoration was too thin to reach any of them. Investigation
(`docs/GAP-ANALYSIS.md`'s own "Working order") confirmed the gap was real —
11 motif icons, one rectangular frame/plate shape — not imagined.

### Added
- **11 new hand-authored motifs** in `src/components/shapes.ts` (`star`,
  `heart`, `flower`, `lightning`, `balloon`, `gift`, `bunting`, `confetti`,
  `speech-bubble`, `rainbow`, `smiley`), same pattern as the existing 11: pure
  path math, no bundled icon set. `flower`/`rainbow` reuse `ellipsePath`/
  `archPath` rather than inventing new construction.
- **Two new frame ground kinds** (`wobble-frame`, `scallop-frame` in
  `src/core/decor/ground.ts`), modeled directly on the existing `block-frame`:
  a ring region (outer path minus inner path, evenodd), just with the outer
  edge drawn by two new path generators (`wobblyFramePath`,
  `scallopedFramePath` in `shapes.ts`) instead of a rounded rect. Framing the
  whole page turned out to belong with ground, not decor — a ring's bbox is
  nearly the whole canvas, which is structurally incompatible with the
  decor-item keep-out/budget system (tried first; see Fixed).
- **`plateShape` on `headline-block`** (`rect` / `pill` / `ribbon`) — the
  `plate`/`band` treatment can now set type inside an oval or a banner, not
  only a rectangle.
- **Two new graphic languages**, `kawaii-doodle` and `festive-scene`, plus
  extended `halftone-pop` (optional `scallop-frame` ground) and
  `geometric-memphis` (a `star`/`lightning`/`flower`/`smiley` motif slot) —
  wired into `botanical-celebration`'s art direction so the sampler can
  actually reach them, per the 2026-08-02 lesson that an unreachable option
  might as well not exist.

### Fixed
- **The `plate` headline treatment drew one background block per line**, so a
  wrapped headline came back as a staircase of different-width rectangles
  instead of one plate hugging the block. Rewritten to size one plate to the
  widest line and set every line's `text-anchor` against it.
- **A ring ground region's bbox lies about its own coverage, and two separate
  systems believed it.** `GroundRegion.bbox` is a ring's *outer* rect —
  necessary for the `region()`/`markOnDarkFromGround` overlap math generally,
  but for a ring shape that outer rect is nearly the whole canvas even though
  the actual ink is a thin band at the very edge. Two consumers took that bbox
  at face value: `markOnDarkFromGround`'s per-box coverage check, and (the
  real culprit, found only by rendering and looking) the solver's tone field
  (`solver.ts`'s `tone.paintFlat(region.bbox, region.fill, 0.9)`), which
  tinted the *entire* interior at 90% opacity for any ring, flipping ordinary
  headlines to white on a light page. This was latent in the pre-existing
  `block-frame` ground kind too, just apparently never rendered and eyeballed
  closely enough to notice. Fixed with `GroundRegion.excludeFromCoverage`,
  set on ring regions, checked at both call sites.
- Confirmed via first attempt at a fix, which was wrong: capping a decor-item
  "frame" DecorForm's inset at the canvas safe margin does not keep it away
  from content — a *smaller* inset sits closer to the true edge and is safer;
  a larger one moves the line inward, toward content. Abandoned that
  DecorForm approach entirely in favor of the ground-ring approach above,
  which sidesteps the keep-out system rather than fighting it.

### Decisions recorded
- A full-page frame is architecturally a ground concern, not a decoration
  item: ground is drawn first, exempt from the per-item keep-out/budget
  caps, and a ring's true ink can't be expressed as the one `Rect` a
  `Decoration.bbox` requires. `block-frame` had already established this
  pattern; the new kinds extend it rather than inventing a competing one.
- Deferred: multi-size/format support (`docs/ROADMAP.md` L1) — a separate,
  larger change (new `Format` dimension, REST/MCP surface, per-format recipe
  audit) tracked as the next piece of this same request, not folded in here.

---

## 2026-08-02 — Twenty-eight invisible components, and components the agent builds itself

User feedback on real output: the flyers repeat. "It kept that on side that
circular things" — every flyer coming back with the same component, no density,
no creativity, and no way for the agent to make something for a request that has
no component.

The cause was measured, not guessed. **The library had 35 components. Seven had
a `visual` block. The agent picked from the seven it could see** — and of those,
`photo-cluster` was listed first in the guide, described twice, and given the
most vivid prose, so it won nearly every time. Nothing was wrong with the
sampler, the ranking or the model. Twenty-eight components were unreachable
because nobody had written down what they look like.

### Added
- **`visual` on all 35 manifests, and the field is now required** — shape,
  natural aspect, density, `carriesTone`, and one line describing the finished
  thing as a viewer sees it. `test/unit/anchors.test.ts` fails the build if a
  component ships without one. A component nobody can picture is a component
  nobody will ever choose.
- **`composed-figure`** (`src/components/figure.tsx`) — a component the agent
  assembles for one flyer and throws away: up to eight parts (motifs, shapes,
  cut-out photos, short words), each placed *relative to the figure or to
  another part*. Answers two complaints at once. The one-off ("a balloon at the
  top right") will never get its own component because it is wanted exactly
  once. And density: Gate G3 counts elements, not marks, so a page could only
  hold seven things and output stayed sparse — one figure is one element
  carrying eight parts, so the page gets busy while the gate stays as strict.
- **Relational placement resolver** (`src/core/layout/anchors.ts`) — named spots
  (`top-right`), named sides (`top-right-of`, `above`, `on`), named gaps and
  sizes; topological ordering so parts can be declared in any order; cycles
  rejected rather than silently half-applied. `Anchor` has **no numeric escape
  hatch** and a test asserts it never grows one — that is what keeps this inside
  law 1. A relationship survives the figure moving; an `x: 812` was true once.
- `npm run sheet:figures` — one flyer per arrangement, no model calls.

### Fixed
- **Depth-of-field blurred flat vector art.** Blur was applied from depth alone,
  so a full-bleed drawn figure came back with every motif smeared. Softness
  reads as distance on a photograph and as a broken export on a drawn shape,
  which has no focal plane to be outside of. Blur is now gated on the element
  actually carrying an image; haze still applies to everything.
- **A new drawing component reintroduced the exact bug the canvas tone field
  exists to prevent.** The field only knew about photographic components, so the
  first composed figure under a line of type put solid accent behind grey text
  and nothing measured it. `figureInk()` resolves the parts and declares its
  rects to the field before rendering. **General rule: anything that puts ink on
  the canvas must tell the tone field, or the canvas model is lying.**
- **Corner anchors did not actually straddle their corner.** The gap is a
  fraction of the figure, so on a small part it exceeded the part's half-width
  and pushed it fully outside — turning "badge on the corner" into "badge
  floating beside it". Caught by a test, not by eye. Backoff is now capped
  against the part's own extent so some overlap always survives.
- **Guide anchoring.** `photo-cluster` was listed first and described twice; the
  section is now neutral and states the repetition failure explicitly.

### Also — the example was teaching the wrong flyer

`get_composition_example` is the highest-leverage text in the system: the
instructions tell agents to fetch it and copy it, and an agent copies structure
far more faithfully than it follows prose. There was **one** example — a
photograph, a paragraph and a button, four elements, lots of paper — and it had
**no test at all**. That shape is precisely what real output kept coming back
as.

- **Two examples now**, `photo-led` and `assembled`, with `useWhen`,
  `elementCount` and `fitsDensity` on each. One example is copied as a
  template; two are compared as a range.
- **`test/acceptance/examples.test.ts`** composes both through the real route.
  It found three bugs immediately, none of which was visible by reading:
  - **No fixed element count is valid for every assignment.** Quiet tops out at
    5, rich starts at 6, so the published example was rejected outright by some
    lineages — the exact "guessed the shape and burned attempts" failure the
    example exists to prevent, caused by the example. The two are now
    deliberately different sizes (5 and 6) and cover all three densities
    between them, and `elementBudgets` is published alongside.
  - **The assembled example failed Gate G6.** It showed a date and a meeting
    point with no `sourceStatements` to back them. The gate was right. A
    published example that quietly fails a gate teaches the shape *and* the
    mistake, so the test now asserts every code-checked gate passes.
  - **G6 matches detail values verbatim**, not by meaning — "Sat 17 June, 10am"
    against a user who said "Saturday the 17th at ten" fails, and should, since
    paraphrasing a date is how wrong dates get printed. Now stated explicitly
    in the notes rather than left to be discovered.

### Known gap
A small text box straddling a hard edge — half over a dark mark, half over pale
paper — still takes one ink for the whole box, so neither half is right. Scrims
solve this for photo plates; a partial-coverage figure has no equivalent yet.

---

## 2026-08-01 — Hard photo edges and a diluted "handmade" register

User feedback on a real run (`output/nepal5/`): the grid layout's photos butted
together with raw rectangular clips, and the overall output read as controlled
rather than human-made next to reference Canva templates (rotated/taped photo
stacks, torn paper, stickers/badges, loud marker type). Investigation found both
were structural, not bad luck — fixed here:

### Fixed
- **`photo-grid` shipped with `radius: 0` and no shadow**, the one evidence
  component with no edge device of its own (every sibling — `masked-image`,
  `photo-hero`, `polaroid-stack`, `torn-photo` — bakes one in). Default radius
  raised to 10 and each cell now casts the same soft drop-shadow `polaroid-stack`
  uses, so grid cells stop reading as a raw clip.
- **`crafted-collage` and `botanical-celebration` art directions had the right
  materials/graphics but no pull toward the components that sell the look.**
  `ArtDirection` gained an optional `preferredComponents` field; the Composer
  prompt now names the preferred evidence component(s) ahead of the full
  catalogue instead of leaving the art-direction brief as the only signal.
- **The font set had no loud handmade register** — only 2 of 15 pairs were
  script, and both competed with 5-6 cleaner alternatives for the same
  material+typography combo. Added `permanentmarker-nunito` and `bungee-inter`
  (new families fetched via `npm run fonts`), scoped to the collage-adjacent
  materials.
- **`paper-collage` and `sticker-sheet` graphic languages drew only generic,
  mostly-faint marks** (a torn edge, a blob, a ribbon, two sparkles) — nothing
  as confident as the tape/badge vocabulary in the reference. Added `tape` and
  `badge` `DecorForm`s (`scallopedCirclePath`, `tapeStripPath` in
  `src/components/shapes.ts`) and wired one `solid`-weight slot of each into
  the two languages.

### Decisions recorded
- Left the asset-transform pipeline (`src/core/images/transform.ts`) opt-in
  only, as designed — the edge-treatment fix belongs in component defaults,
  not in forcing every asset through a transform before it can render.
- Did not pad existing dimension counts (metaphors/topologies/gestures/etc.)
  as a diversity fix — the real gap was coherence between an art direction's
  intent and what actually rendered, not headcount. `AGENTS.md` law #2 ties
  diversity work to fixing the sampler/creative data for a reason.
- Fixed stale doc counts caught while establishing ground truth for this
  change: `docs/ARCHITECTURE.md` §4 claimed ~460,000 designer profiles from
  an unrestricted 6-dimension product and omitted the graphics dimension
  entirely; the actual art-direction-gated 7-dimension `PROFILE_SPACE` is
  ~47,000 (already correctly asserted in `test/unit/sampler.test.ts` — only
  the prose was wrong). Topology count corrected 10 → 14, color-logic 8 → 10.

---

## 2026-07-31 — Milestone-3 gap closure (structure, gates, selection)

The sameness diagnosis was structural: independent dimension sampling, safest-passer
selection, thin gates, and unused canvas awareness. Closed in this change:

**Art directions.** Sampler rolls inside coherent families
(`src/creative/artdirections.ts`), filtered by brief `archetype`. `PROFILE_SPACE`
counts only allowed combinations (~47k), not the old contradictory Cartesian product.

**Comparative selection + outer restart.** Among gate passers, a vision jury
(`src/core/select/`) picks the most authored candidate; vision-budget exhaustion
falls back to least-revised. If the first lineage set produces no passer,
`MAX_OUTER_RESTARTS` (default 1) samples a fresh set.

**Gate correctness.** G2 builds a masked critique crop (`maskForCoverTest`) over
logo + headline. G6 checks `provenance.userStatements` for details and numeric
claims, not only slogan regex.

**Canvas placement.** Solver consults `quietZones` when nudging type; tone-field
scrims are sized to the protected text.

**DR-1 precheck.** `npm run diversity` batches independent jobs, writes a contact
sheet, and flags structural/perceptual duplicates before the human grouping panel.

Docs: `SCHEMAS.md`, `ARCHITECTURE.md`, `GAP-ANALYSIS.md` updated to match.

## 2026-07-31 — Closing the gaps the decoration work opened

Four items were identified while building the decoration layer and left open.
All four are now closed, and two of them were gate-correctness holes.

**The contrast gate was checking the wrong colour.** It compared type against
`spec.brand.colors.bg` — the flat page colour. Once a flyer can carry a gradient
wash or a diagonal colour split, that flat colour may be painted over across
most of the canvas, so the gate would happily pass a flyer whose CTA was
unreadable. It now checks every text element against the fill actually beneath
it (`effectiveGroundUnder`) and against the ink it will actually be drawn in —
which for a box the solver marked `onDark` is a light ink, not the brand
foreground. The palette is still checked against the base wash as well, so a
flyer cannot pass merely because each element happens to sit on a region that
rescues it.

**The banned list could be evaded by a gradient.** Signal 1 (navy + cyan glow)
only ever inspected `brand.colors.bg`, so a ground running navy to cyan slipped
past entirely — reopening the exact hole the banned list exists to close.
`detectBanned` now takes the ground and tests every fill that actually gets
painted: the base, every region, and both gradient stops. Two tests demonstrate
the hole was real by asserting the same spec passes without the ground and fails
with it.

**Material x graphics vetoes.** The two dimensions both describe surface, so
unconstrained they contradict each other — a sticker sheet printed on drafting
paper is not bold, it is two briefs fighting. Seven material x graphics and two
topology x graphics vetoes added. The sampler's "every dimension value is
reachable" test still passes, so the sample space has not collapsed.

**A global boldness budget.** G5 insists on exactly one signature gesture, but
counts only the gesture: nothing stopped a flyer taking a gesture *and* a
saturated split ground *and* an arched headline *and* two solid ornaments —
four competing bids for attention. `MAX_BOLD_MOVES = 3` now counts ground,
gesture and type treatment first, and ornament spends whatever survives.
Ornament yields because it is the least meaningful of the four, and a solid mark
is demoted to a tint rather than dropped, so the graphic language still reads.
This is the "spend your boldness in one place" rule made mechanical — taken from
Anthropic's `frontend-design` skill, not invented here.

Also: the Composer and the agent assignment now both state the graphic language
and that the engine applies it, so a cold session does not spend one of its 4-7
elements on decoration that is going to be drawn anyway.

Tests 150 -> 154.

## 2026-07-31 — Bleed fix attempted and reverted; imported design expertise

**Attempted and reverted: non-photographic components giving up the bleed.**
A card in a full-bleed slot is shrunk to its natural height and centred, which
leaves the rest of the declared rect empty. The apparent fix — make the bleed a
property of the component rather than the slot, and clamp anything
non-photographic into the safe rectangle — was implemented, measured, rendered,
and **reverted**: it regressed `split-editorial` from a 16% to a 28% empty band
and pushed every element into the top half of the page, leaving the bottom 55%
bare. That is a worse fault than the one it set out to fix. The centring
behaviour and the reason it exists are now documented in place so the next
attempt starts from the measurement rather than repeating it.

The recipe-level fix from earlier stands and is verified visually. Every
topology sits at or below a 16% largest empty band.

**Banned list: three imported signals.** Anthropic's official `frontend-design`
skill names the three palettes current AI design keeps landing on "regardless of
subject":

- warm cream ground (~#F4F1EA) + high-contrast serif + terracotta accent
- near-black ground + a single acid-green or vermilion accent
- broadsheet pastiche — hairline rules, zero radius, dense columns

`src/creative/banned.ts` previously detected only navy+cyan glow. All three are
now detected, as `cream-serif-terracotta`, `black-acid-accent` and
`broadsheet-default`. They are deliberately imported rather than invented: a
taxonomy we reasoned our way to would just re-encode our own habits, which is
the exact failure being detected.

Calibration measured across 120 sampled flyers: the three fire 9 times in total
and cause **zero** failures on their own, because each is legitimate for some
brief and two hits are required to fail. A test asserts that stays true, so the
thresholds cannot quietly become punitive.

Tests 146 -> 150.

## 2026-07-31 — Dead-band fix in off-center-hero

The save-trees run shipped with a quarter of the page empty between a lone
eyebrow and the headline. Rather than eyeball it, every topology was measured
for its largest contiguous empty horizontal band:

    off-center-hero        30%  at y=0%     <- outlier
    split-editorial        16%  at y=75%
    everything else       <=13%

`off-center-hero` started its message slot at y=0.30 while the eyebrow ended at
0.05. Moved the message to 0.09 and redistributed support (0.47) and cta (0.72).
Result: 30% -> 14%, and the remaining air moved from the top of the page to just
above the brand mark, where it reads as deliberate because something anchors it.
A void under a lone eyebrow reads as a missing element; air above a signature
does not.

`test/unit/layout.test.ts` now asserts no topology leaves a contiguous empty
band over 20% of the canvas, so this class of fault cannot return unnoticed.

Tests 145 -> 146. Output of the run is checked in at `output/save-trees/`.

## 2026-07-31 — Type treatments, new faces, and a real end-to-end run

**Fonts.** The set had no script, no condensed poster face and no slab — the
exact registers every travel, event and hand-made reference depends on. Added
Caveat, Great Vibes, Anton, Archivo Narrow and Roboto Slab (41 → 52 faces) with
five new pairings. Anton and Great Vibes ship a single weight, so their pairs
request 400 rather than silently falling back.

**Type treatments.** `headline-block` gains
`treatment: plain | outline | shadow | arch`. Arched type uses `<textPath>`, so
it stays real `<text>` and the SVG editability guarantee survives.

`arcGuideId()` exists because of a trap worth recording: `checkEditability`
(`src/core/export/index.ts:54`) rejects any `<path>` whose id mentions
headline/copy/text/label, and the guide path an arched headline is set along
belongs to an element usually called exactly `headline`. The obvious
`${id}-guide` would have failed every export. The substitution uses `_`, which
`specElementSchema` forbids in an element id, making the encoding injective —
a first attempt using plain abbreviations collided (`headline` and `hl` both
became `hl`), which its own new test caught.

**End-to-end run — a "save trees" brief, entirely through the agent API.**
Studio assignment → Pexels search → import three canopy photographs with
provenance → compose with `photo-cluster` → render → review → `done`, all six
gates passed. This was the first run to exercise search, import, the photo
components and the decoration layer together.

It found two real bugs, neither visible to any existing test:

1. **`photo-cluster` sized its circles independently of their spacing**, so two
   cutouts overlapped into a single blob, and the route motif drew on top of a
   cutout instead of clear of it.
2. **The `connector-to-cta` gesture drew off the canvas.** `startY` came from
   the evidence element's bottom edge — and when the evidence is a full-bleed
   plate, that bottom is the bottom of the page, putting the path's start at
   y=1384 on a 1350px canvas. The line then ran off three sides. The margin
   pass could not catch it because margins only ever inspect *boxes*, and the
   connector's box was legal; it was the drawn path that escaped. Fixed by
   holding the start above the CTA and clamping every waypoint into the safe
   rect. `test/unit/layout.test.ts` now asserts connector waypoints stay inside
   their own box across six fixture lineages.

Two earlier hypotheses about that bug were wrong and produced byte-identical
output, which is what forced actually dumping the solved geometry rather than
reasoning about it further.

Tests 143 → 145.

## 2026-07-31 — Stock photography, and a vocabulary for how images land

Two halves of one problem. Flyero could only put a photograph in a rectangle,
and it could only use photographs the user happened to supply — so a flyer for
a place, a dish or an object with nothing to show could never pass the cover
test (G2), whatever the styling.

**Retrieval.** `src/core/images/search.ts` (new) puts Pexels behind an
`ImageProvider` interface, so adding or swapping a source touches one file.
`POST /v1/assets/search` returns candidates without downloading anything —
an agent can look at a dozen options and pay for one — and
`POST /v1/assets/import` pulls the chosen image into the asset store, where it
rides the existing normalise → analyse → transform → compose path. Import only
accepts Pexels image URLs, so the endpoint cannot be used as a general URL
fetcher. Provenance (`source`, `source_url`, `author`) is recorded via the same
idempotent `PRAGMA table_info` + `ALTER TABLE` pattern as `parent_id`, and is
inherited by derived assets — a crop of a stock photograph is still that
photographer's photograph, and Pexels asks for credit. Two new error codes,
`not_configured` and `upstream_error`, keep "we lack a key" and "someone else
failed" distinct from our own failures. An absent key is a valid state.

**Composition.** `src/components/photo.tsx` (new) — five ways an image can land
on a page, all Composer-selectable and therefore counting against the 4–7
budget, because choosing between them is a real design decision:

- `photo-cluster` — 2–4 circular cutouts on a bowed line joined by a dashed
  route with a plane or pin riding it. Turns several photographs into a journey.
- `polaroid-stack` — tilted prints with white borders, overlapping.
- `photo-grid` — 2–4 images on a tight gutter, optionally one running larger.
- `torn-photo` — a torn paper edge over an offset colour block.
- `motif-collage` — **no photograph at all**: drawn marks composed around a
  subject. Not every brief has something worth photographing, and an honest
  drawing beats a stock photo of nothing.

Per-element `assets` raised `.max(3)` → `.max(6)`; the new photo components
join `PHOTO_COMPONENTS` in the solver so they are treated as photographic
plates for the `onDark` pass.

Verified against the live Pexels API and inspected by eye, which caught two
real bugs: `photo-cluster` sized its circles independently of their spacing, so
two large cutouts overlapped into a blob, and the route motif was drawn on top
of a cutout instead of clear of it. Both fixed — radius now accounts for the
gaps, the run is re-centred against the bow, and the motif rides the route's
normal on the outside of the curve.

Guide updated: the image loop now reads search → import → transform → compose,
and states plainly that how an image enters a composition is itself a claim —
three cutouts on a dashed line say "we go to these places", the same three in a
grid say "we offer range".

Tests still 143 green.

## 2026-07-31 — Vector vocabulary and the decoration layer

Shown eight sampled flyers, the user judged the output "not even 5 percent" as
attractive as ordinary Canva templates and asked for the architecture to be
examined rather than the surface tuned. The diagnosis: **Flyero had no graphic
vocabulary.** `primitives.tsx` exported only `Group`, `TextBlock`, `FittedLine`,
`Panel` and `Rule`; there was one gradient repo-wide, no `<pattern>`, no
illustrative form of any kind, and `Background()` could draw a flat rect plus
one of four monochrome textures. Ornament was also *architecturally excluded* —
`spec.elements` is capped 4–7 and G3 counts every element, while the reference
flyers carry 15–30 visual objects.

**Decision: ornament is engine-generated, never authored.** It is a pure
function of (graphic language, seed, palette, solved boxes, canvas) and never
enters `spec.elements`. So the 4–7 budget and G3 are untouched, and AGENTS.md
law 1 extends — the LLM does not choose ornament either. Diversity comes from
the sampler, as law 2 requires.

- **`src/components/shapes.ts`** (new) — pure path geometry: blob, wave,
  squiggle, star, sparkle, burst, arc, polygon, ribbon, torn edge, dashed
  route, arch, rounded rect, arc bands, plus `<pattern>` tiles (checker,
  stripe, halftone, grid, grain) and 11 hand-authored motifs. Directional
  motifs all point along +x so rotating to a bearing composes correctly.
- **`src/core/decor/`** (new) — `ground.ts` plans the coloured field,
  `decorations.ts` places ornament by deterministic rejection sampling,
  `budget.ts` holds the caps, `ink.ts` chooses ornament colour and works out
  what a box actually sits on, `ids.ts` guarantees safe ids.
- **`src/creative/graphics.ts`** (new) — the seventh dimension, ten graphic
  languages. Profile space 460,800 → 4,608,000.
- **`src/core/render/ground.tsx`** (new) — replaces `Background()`; textures are
  now `<pattern>` rather than 900 individual `<circle>` elements.

**Architectural correction made during the work:** the ground is planned inside
`solveLayout` (pass 8.4), *before* the pass that sets `box.onDark`. `onDark` is
the only mechanism that switches type to a light ink and it lives in the solver,
so a ground decided in the renderer would arrive after every ink decision had
already been made. `Box` gained `ground?`, and `inkFor` now holds contrast
against the real fill instead of guessing at a photographic plate.

**Measured, not assumed:** `docs/RESVG-SUPPORT.md` records what the installed
renderer actually draws, verified by pixel sampling in
`test/unit/resvg-capabilities.test.ts`. Two findings matter — `mix-blend-mode`
is *silently ignored* as a presentation attribute and only works via `style`,
and `feTurbulence` is barred despite working, because its output is an
implementation detail of resvg's noise and a version bump would silently change
every flyer without failing the self-comparing golden test.

Tests 76 → 143. New: `shapes.test.ts` (43), `resvg-capabilities.test.ts` (12),
`decorate.test.ts` (12, run across all 100 graphic-language × topology
pairings — keep-out invariant, every budget cap, id safety, determinism).
`PROFILE_SPACE` updated in `sampler.test.ts`. `lineageSchema.graphics` is
defaulted so the ~11 stored `spec.json` files still parse.

Still open from the plan: type treatments and script/condensed/slab faces,
photo-composition components, and Pexels search/import.

## 2026-07-31 — Structural diversity: the ten topologies were one layout

A user looking at eight sampled flyers said they all looked the same. They were
right, and the cause was measurable: **nine of the ten topology recipes put the
message at y=0.05, the CTA at 0.84 and the brand at 0.95.** Metaphor, palette,
type and material varied; the composition did not. The Diversity Requirement is
a claim about structure, so the system was failing it at the geometry layer while
passing every gate.

### Added
- **All ten recipes rewritten as genuinely distinct structures** — message below
  the image (framed-evidence, oversized-anchor), full-bleed poster grounds
  (layered-depth-stack), right-hand image columns bleeding off the edge
  (split-editorial, off-center-hero), right-aligned type (zigzag-path), centred
  axis (radial-field). A table in the file header states each one's shape.
- **`bleed` on recipes** — slots that may cross the canvas edge. Bleeding
  elements sit behind the flow, are exempt from the margin clamp, and are
  excluded from collision and fill (they are ground, not a beat in the column).
- **`align` on recipes** — text alignment is a property of the composition, not
  of the author's taste.
- **`onDark` ink switching.** The solver marks any text element sitting on a
  photographic plate; components then switch to a light ink, and `photo-hero`
  is asked for a scrim on the side the text actually landed. Type on a full-bleed
  photograph now works, which the guide had been recommending while the renderer
  could not do it.
- **`logo-lockup` component** (28 total) — a logo at controlled optical size,
  locked up with the company name and an optional tagline.
- Tests: topology recipes must be structurally distinct (message y, CTA y, bleed
  count, alignment variety), and recipe slots that share a column may not overlap
  vertically.

### Fixed
- `PATCH /v1/flyers/{id}` **silently dropped `brandColors`**, regenerating the
  palette from nothing — a flyer changed colour between revisions for no reason.
  It now inherits the stored brand.
- Bleed plates were shrunk to their intrinsic height, collapsing a full-height
  column into a band; photographic grounds now fill their rect, and non-photo
  components keep their aspect and centre inside it.
- A relationship promoted a bleed plate *above* its partner, burying the very
  text it existed to place on the image. A ground never climbs over type.
- The crop gesture re-bled an already-bleeding element until it swallowed the page.
- The gates carried their own copy of the margin rule and failed a flyer for
  obeying its own recipe's bleed.
- Evidence could claim slack beyond its natural size, turning a three-item
  checklist into a large empty panel; growth is now capped per component.
- The solver only ever *shrank* an element to its content. When content needed
  more height than the slot, the box stayed short and the text spilled onto
  whatever was below — a paragraph printed across a button. Content now decides
  height; the recipe decides only where an element starts.
- A single gap could absorb all of a column's surplus and open a hole mid-page.
- `framed-evidence` had overlapping support/cta and message/support bands.

### Verified
Two runs in `.scratch/runs/`: `2026-07-31-orchid-v2` (done, six gates) and
`2026-07-31-xayali` (**below_bar on G2** — a tourism brief with a logo but no
photograph of anywhere; the service is named, never shown). The second is a real
failure kept as a failure.

---

## 2026-07-30 — Agent E2E orchid run + patch asset fix

### Fixed
- **`PATCH /v1/flyers/{id}` dropped newly referenced assets.** Patching an
  element's `assets` to a freshly prepared id still rendered from
  `job.asset_ids` only, so the hero drew an empty placeholder. Patch now unions
  element-referenced ids into the job (same rule as compose) and rejects unknown
  ids.

### Verified (API-only agent loop)
- Upload `orchid.png` (downscaled jpeg) → transform (crop/sharpen; `product-hero`
  cutout ruins dark studio photos) → 3 studio assignments → compose with
  `photo-hero` / `masked-image` → export PNG/SVG → review. Outputs in
  `.scratch/e2e-orchid/`. Prior broken runs archived under
  `.scratch/archive/old-flyers/` and `.scratch/e2e-orchid/archive-bad-prep/`.

---

## 2026-07-30 — Photo-first evidence and brand-faithful colour (post-run fixes)

The first end-to-end agent run (a florist brief) exposed that the system was
structurally biased toward pale, chrome-wrapped, document-shaped output — the
exact "AI template" look the product exists to kill. Root causes fixed:

### Added
- **`photo-hero` component.** Full-crop photograph with no chrome and an optional
  top/bottom scrim, so the headline can sit *on* the image (declare the headline
  in front via a relationship). The default evidence for physical products.
- **`masked-image` component.** Photograph clipped to a circle, arch, pill or
  seeded organic blob, with an optional accent ring — the florist/boutique/
  editorial device. Component count 25 → 27.
- Agent guide: new "Choosing evidence — match the component to the product"
  section (software → frames, documents → cards, physical products → the
  photograph IS the evidence), plus the headline-on-scrim pattern for Gate G4.

### Fixed
- **`before-after-stack` ignored its two asset slots** and always drew abstract
  bars. It now renders asset 0 in the before half (under a quiet ground wash)
  and asset 1 in the after half; the abstract bars remain only as the no-asset
  fallback for document/software subjects.
- **Colour logics discarded brand saturation and lightness**, reducing every
  supplied palette to a hue and regenerating near-white grounds (93–98% light) —
  "vibrant" was unreachable by construction. Generators now use saturated brand
  colours literally where the logic allows: the brand colour becomes the accent
  (`single-accent`, `monochrome-with-signal`, `two-accent`), a dark brand colour
  becomes the ground (`inverted-dark-field`), a second brand hue drives the
  duotone, and `tinted-ground` keeps the brand's real chroma in the ground.
  Ground saturation ranges raised across the set so derived palettes carry
  colour too.
- `baseHue`'s green band ran to 172°, which reads as cyan now that grounds carry
  real saturation — trimmed to 158° so no derived ground lands in the banned
  cyan family.
- `asset-image` forced every placement square; it now takes an `aspect` prop
  (square / portrait / landscape).
- Component purposes now steer the Composer: browser/phone frames say "software
  only — never the evidence for a physical product", document-card points
  photographs to the photo components.

---

## 2026-07-30 — Image preparation API for agent blending

### Added
- **Asset transform pipeline (`src/core/images/transform.ts`).** Deterministic image prep with sharp: crop, cropBox, resize, blur, sharpen, grayscale, opacity, roundCorners, circleCrop, feather, vignette, tint, modulate, contrast, rotate, flip, pad, removeBackground (auto/chroma), duotone.
- **Presets** for common flyer jobs: `product-hero`, `logo-clean`, `soft-cutout`, `circle-avatar`, `bg-plate-blur`, `screenshot-frame`, `brand-tint`.
- **REST:** `GET /v1/assets/transforms`, `POST /v1/assets/{id}/transform` (returns new assetId; originals immutable), `GET /v1/assets/{id}/file`.
- **MCP:** `prepare_asset` tool — preset/ops, returns preview image so the agent can verify the cut.
- Agent guide updated: upload → prepare → compose is the required image loop.

### Decisions recorded
- Background removal v1 is corner-sampled chroma knock-out (logos / studio product shots). Full ML subject matting is a later upgrade if real photos need it — not required for the common flyer case.
- Derived assets store `parent_id` + `transforms` JSON; agents can try several preparations without re-uploading.

---

## 2026-07-30 — Milestones 0–2 implemented

### Added
- **Scaffolding.** TypeScript/Node 22, Fastify, zod, React→SVG→resvg, better-sqlite3, vitest. `npm run fonts` installs 41 static TTF faces (12 open-license families) into `assets/fonts/` with a hashed manifest, so rendering is reproducible from a clean clone.
- **Creative libraries (`src/creative/`).** All six dimensions as data: 12 metaphor families, 10 composition topologies, 8 typography behaviours, 6 material languages, 8 colour-logic *generators*, 10 signature gestures, an 11-rule veto matrix, 10 curated font pairings, and the banned-list detector. 460,800 designer profiles.
- **Component Library (`src/components/`).** 25 hand-authored React/SVG components across content / evidence / structure, each with a manifest (roles, min/max size, asset slots, text limits, motion affordance).
- **Studio Sampler (`src/core/studio/`).** Seeded lineage sampling with unique metaphors per job, risk-gated adventurousness, and veto re-rolls. Contains no history lookup by design.
- **Layout Solver (`src/core/layout/`).** 10 topology recipes plus a deterministic solver: slot assignment → intrinsic shrink → headline fit → clamped relationships → gesture → collisions → text safety → fill → margins → masks.
- **Renderer (`src/core/render/`).** Exact text metrics via fontkit, React→SVG, resvg rasterisation. Text stays `<text>`, groups are named, assets embed as data URIs.
- **Pipeline stages 1–10.** Brief builder, idea engine, composer (schema-validated with retry), rule + vision critic, reviser (spec edits only), gatekeeper (Six Gates + mechanical checks), exporter with an editability report.
- **REST API (`src/api/`)** covering every endpoint in `API.md`, an in-process job runner with concurrency and spend guards, and **MCP server (`src/mcp/`)** with the six mapped tools, returning preview images.
- **62 tests** across unit / golden / acceptance, plus `npm run smoke` (live) and `npm run sheet` (offline contact sheet).

### Fixed (bugs the tests caught during the build)
- `fitText` under-measured height with tight leading, so headlines overflowed their own box; it now uses real ink extent (ascent + descent).
- `fitText` accepted sizes that hard-split words mid-character; it now rejects any size where the longest word does not fit.
- `ensureContrast` searched only one lightness direction and could not reach AA against mid-tone grounds.
- Colour-logic palettes did not guarantee their own accent was legible; `finish()` now holds the accent to the large-text threshold.
- Justified overlaps could bury text — capped to a fraction of one line vertically, and forbidden entirely in the horizontal direction, where they slice words.
- A lone evidence element never grew or centred in its column, leaving dead space.
- IBM Plex Mono's space glyph crashes fontkit's outline reader; measurement now falls back to the `hmtx` table per face.

### Decisions recorded
- Model roles default to `claude-opus-5` (planner), `claude-sonnet-5` (vision), `claude-haiku-4-5` (cheap). `effort` is sent only to models that support it, so older ids in `.env` still work.
- Structured outputs (`output_config.format`) replace free-text JSON parsing for every model call, so composer retries are about content quality rather than malformed JSON.
- Gestures that can only be expressed through a specific component now declare `requires`, and the spec schema enforces it — a gesture can no longer silently no-op and leave G5 passing.
- The test suite runs with no API key and its own temp store, so it can never spend money; the live run is the separate `npm run smoke`.

---

## 2026-07-30 — Planning suite complete

### Added
- `docs/IDEA-VALIDATION.md` — market analysis of the original 104-page concept PDF; verdict, gaps, competitive landscape (Lovart, Canva MCP, Figma MCP, Krumzi/Gamma/Recraft).
- `docs/OUTPUT-FIRST.md` — output-first product definition: the "never see a bad flyer" promise, the Six Gates, the banned list, the human design sequence.
- `docs/REQUIREMENTS.md` — testable requirements incl. the Diversity Requirement (DR-1..3: variance by construction, not memory) and the five v1 acceptance tests.
- `docs/ARCHITECTURE.md` — 10-stage pipeline, Studio Sampler (~460k designer profiles from 6 curated creative dimensions), design spec schema, component library plan, tech stack (TypeScript/Fastify/React-SVG/resvg/SQLite), repo layout, risk register.
- `docs/FLOWCHARTS.md` — mermaid diagrams: end-to-end generation, studio sampler, critique loop, API lifecycle, surface architecture, future format compilation.
- `docs/API.md` — REST-first API spec (assets, flyers, revise, batch, process introspection), async job pattern, MCP 1:1 tool mapping, curl smoke test.
- `docs/ROADMAP.md` — milestones 0–6 with hard definitions of done; later phases each gated behind an explicit trigger.
- `docs/SCHEMAS.md` — data contracts (brief, lineage, spec, layout, critic, gates, banned detector, topology recipes, cost rules).
- `docs/VALIDATION.md` — full audit of idea + tech + consistency + build-readiness; lists fixes applied.
- `.env.example`, `README.md`, `AGENTS.md`, this changelog.

### Changed (same-day audit fixes)
- Clarified product promise: only `done` if gates pass; `below_bar` is honest failure.
- Unified Gate G3 to 4–7 elements; Gate G4 applies to every shipped flyer.
- Studio Sampler: one job seed → N lineages (metaphors unique), candidates in parallel.
- Banned-list timing and heuristic detection specified.
- DR-1 reading path derived from topology map.
- Spec examples use generic component IDs only.
- Cost/vision call caps and font/asset env vars added.

### Decisions recorded
- Scope: flyer only (Instagram portrait 1080×1350) until the Side-by-Side test is won.
- API is the core surface; MCP is a logic-free adapter; all dev testing via curl.
- Diversity mechanism is seeded lineage sampling — cross-session memory explicitly rejected as the creativity mechanism (kept as optional later project-level feature, trigger L2).
- No vector DB, graph DB, embeddings, QD search, Python workers, or image-generation models in v1.
- Reference images in v1 = soft hints (palette/roles) only — no full structural imitation pipeline.
- Build contract for agents: OUTPUT-FIRST → REQUIREMENTS → ARCHITECTURE → SCHEMAS → ROADMAP; PDF / IDEA-VALIDATION are background only.
