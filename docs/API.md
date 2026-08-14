# Flyero — API Specification

*The REST API is the product core. Every capability exists here first; MCP is a thin adapter (see §7). All development testing happens against these endpoints with `curl`.*

Status: **v0.1 — pre-code planning.** Base URL: `http://localhost:{PORT}` in dev.

---

## 1. Conventions

- **Auth:** `Authorization: Bearer <key>` — keys from `API_KEYS` env var in v1 (comma-separated). No auth bypass paths.
- **Async jobs:** generation takes up to ~3 minutes, so creation endpoints return `202` with a job ID immediately. Poll with `GET`, or pass `callbackUrl` for a webhook on completion.
- **IDs:** prefixed ULIDs — `ast_…` (asset), `fly_…` (flyer job).
- **Errors:** always `{ "error": { "code": "…", "message": "…", "details": {} } }` with proper HTTP status. Codes: `invalid_request`, `not_found`, `unauthorized`, `generation_failed`, `below_bar`, `rate_limited`.
- **Content:** JSON everywhere except asset upload (multipart) and export downloads (binary).

## 2. Assets

### `POST /v1/assets`
Upload a logo, product screenshot, or reference image. Multipart: `file` + optional `kind` (`logo` | `screenshot` | `reference`).

```json
// 201
{
  "assetId": "ast_01JX3…",
  "kind": "screenshot",
  "dimensions": [1440, 1024],
  "analysis": {
    "recommendedRoles": ["hero-evidence", "feature-demo"],
    "palette": ["#0B1B2B", "#2EC4F1", "#F4F6F8"],
    "cropSafety": { "left": 0.08, "right": 0.12, "top": 0.06, "bottom": 0.09 },
    "background": "opaque"
  }
}
```

Analysis runs at upload so generation jobs reference `assetId` and never re-transmit binary data.

### `GET /v1/assets/{assetId}` — metadata + analysis (+ `parentId` / `transforms` when derived).

### `GET /v1/assets/{assetId}/file` — binary download (so agents can *see* prepared images).

### `GET /v1/assets/transforms` — catalogue of presets + ops the transform endpoint accepts.

### `POST /v1/assets/{assetId}/transform`
Prepare an image so it blends into a flyer. **Creates a new asset** — originals are never overwritten.

```json
{
  "preset": "product-hero",
  "ops": [
    { "op": "crop", "left": 0.05, "right": 0.05, "top": 0.02, "bottom": 0.02 },
    { "op": "feather", "radius": 12 }
  ],
  "accent": "#2EC4F1",
  "reanalyze": true
}
```

Presets: `product-hero`, `logo-clean`, `soft-cutout`, `circle-avatar`, `bg-plate-blur`, `screenshot-frame`, `brand-tint`.

Ops include: `crop`, `cropBox`, `resize`, `blur`, `sharpen`, `grayscale`, `opacity`, `roundCorners`, `circleCrop`, `feather`, `vignette`, `tint`, `modulate`, `contrast`, `rotate`, `flip`, `pad`, `removeBackground`, `duotone`.

```json
// 201
{
  "assetId": "ast_01NEW…",
  "parentId": "ast_01JX3…",
  "dimensions": [1200, 900],
  "opsApplied": [ { "op": "removeBackground", "mode": "auto", "tolerance": 40 }, … ],
  "urls": { "file": "/v1/assets/ast_01NEW…/file", "meta": "/v1/assets/ast_01NEW…" }
}
```

**Agent rule:** upload → transform for the slot → pass the *prepared* id into compose. Do not place raw user photos.

### `POST /v1/assets/search`
Search stock photography, SVG icons, brand marks, illustrations, procedurally generated shapes (dividers, arrows, badges, speech bubbles) and QR codes across a dozen providers at once (`src/core/images/providers/`). Returns candidates only — nothing is downloaded or stored. Most providers need no API key (only Pexels/Unsplash/Pixabay do), so this endpoint is effectively always available.

```json
// request
{ "query": "coffee cup icon", "type": "icon", "perPage": 12, "orientation": "square", "color": "brown" }
```

- `type` — one of `photo | svg | icon | vector | png | background | shape`, or an array of them. Omit to search every kind.
- `provider` — pin to one named source (`pexels`, `unsplash`, `pixabay`, `openverse`, `wikimedia`, `svgrepo`, `coloricons`, `undraw`, `opendoodles`, `simpleicons`, `shapes`, `qrcode`). Omit to search all configured providers, ranked by query.
- A bare `"qr:<url>"` query returns one scannable QR code SVG.

```json
// 200
{
  "provider": "multi",
  "providersUsed": ["svgrepo", "coloricons"],
  "query": "coffee cup icon",
  "results": [
    {
      "id": "svgrepo::mdi:coffee",
      "provider": "svgrepo",
      "assetType": "icon",
      "width": 0,
      "height": 0,
      "alt": "coffee",
      "sourceUrl": "https://icon-sets.iconify.design/mdi/?query=coffee",
      "author": "mdi",
      "downloadUrl": "https://api.iconify.design/mdi/coffee.svg",
      "previewUrl": "https://api.iconify.design/mdi/coffee.svg"
    }
  ],
  "attribution": "Assets provided by svgrepo, coloricons"
}
```

### `POST /v1/assets/import`
Pull one chosen `search_images` result into the asset store, so it rides the exact same normalise → analyse → transform → compose path as an upload.

```json
{ "downloadUrl": "https://api.iconify.design/mdi/coffee.svg", "sourceUrl": "...", "author": "mdi", "provider": "svgrepo", "kind": "reference" }
```

`downloadUrl` must come from a `search_images` result — either a known provider CDN (exact-hostname allowlist, `isTrustedDownloadUrl` in `src/core/images/search.ts`) or an inline `data:image/svg+xml,...` URI from a local provider (shapes/QR code). Anything else is rejected with `400 invalid_request` — this endpoint is deliberately not a general-purpose URL fetcher.

## 3. Flyer generation

### `POST /v1/flyers`

```json
{
  "prompt": "Flyer for Vayami, an AI resume tool. Get people to join the waitlist at vayami.ai/waitlist.",
  "assetIds": ["ast_01JX3…"],                 // optional
  "brand": {                                   // optional; omit → system invents treatment
    "colors": ["#0B1B2B", "#2EC4F1"],
    "tone": ["credible", "modern"]
  },
  "risk": "studio",                            // safe | studio | experimental (default: studio)
  "callbackUrl": "https://…/hooks/flyero",     // optional webhook
  "debug": false                               // true → response includes losing candidates + critiques
}
```

```json
// 202
{ "jobId": "fly_01JX4…", "status": "queued", "estimatedSeconds": 120 }
```

### `GET /v1/flyers/{jobId}`

While running:

```json
{ "jobId": "fly_01JX4…", "status": "generating", "stage": "critique", "revision": 1 }
```

On success:

```json
{
  "jobId": "fly_01JX4…",
  "status": "done",
  "idea": "A weak resume bullet is visibly rewritten into a strong one, mid-flyer.",
  "lineage": { "metaphor": "transformation", "topology": "diagonal-progression" },
  "gates": { "passed": true, "detail": { "G1": true, "G2": true, "G3": true, "G4": true, "G5": true, "G6": true } },
  "urls": {
    "png": "/v1/flyers/fly_01JX4…/export?format=png",
    "svg": "/v1/flyers/fly_01JX4…/export?format=svg",
    "spec": "/v1/flyers/fly_01JX4…/spec"
  },
  "cost": { "usd": 0.84, "llmCalls": 11 },
  "revision": 1
}
```

On honest failure (nothing passed all gates):

```json
{
  "jobId": "fly_01JX4…",
  "status": "below_bar",
  "bestCandidate": { "urls": {"...": "..."}, "failedGates": ["G2"], "reason": "Product not visible without reading headline" }
}
```

### `POST /v1/flyers/{jobId}/revise`
Plain-language instruction against the finished flyer. Edits the spec (idea and lineage immutable), re-renders, re-gates. Returns `202`; poll the same job — `revision` increments. All revisions remain retrievable via `?revision=N`.

```json
{ "instruction": "Make the CTA more prominent and show the resume bigger." }
```

### `GET /v1/flyers/{jobId}/spec` — the design spec JSON (`?revision=N` optional).
### `GET /v1/flyers/{jobId}/export?format=png|svg|pdf` — binary download. SVG guarantees editable text and named groups. PDF is post-v1 (returns `501` until then).

## 3b. Agent-native composition (`src/api/agent.ts`) — the primary path

No server model key needed: a connected agent samples its own lineage, authors the spec, and judges the render. This is what `create_flyer` (§3) hands to a *second* model internally; here the calling agent does that work itself.

### `GET /v1/guide` — markdown onboarding document (creative posture, the 7-step loop, Six Gates, full creative-dimension and component listings). Served from the API, not static docs, so it never drifts from the code it describes.
### `GET /v1/skills`, `GET /v1/skills/{name}` — four judgement guides (`brief`, `composition`, `copywriting`, `critique`); no palettes, fonts or measurements — those come from the sampled lineage, never from a skill.

### `POST /v1/studio/assignments`

```json
{ "runs": 3, "campaignArchetype": "event-invitation", "evidence": "photographic", "brandColors": [], "format": "portrait-4x5" }
```

`evidence` is optional. Pass `"photographic"` when the brief has a real picture of the thing (a place, a dish, an object, a face) — the sampler then prefers topologies where that photograph fills the page. Omit it (or pass `"drawn"`) when the page is assembled from type and marks.

Returns `jobSeed`, `canvas`, the resolved `componentLibrary` (all 36 manifests — id, category, roles, purpose, asset slots, text limits, author-safe `propsSchema` — sent **once**, not per assignment), and `assignments[]`: one per sampled lineage, each with `lineage` (opaque, echo back unchanged), `direction` (metaphor/topology/typography/material/colorLogic/gesture/graphics briefs; `topology.photoIsThePage` when the photograph is the full canvas, `topology.photoIsTheField` when it is a large bleed in its slot), `resolved` (palette + fonts, informational only), `constraints` (element budget, required roles) and `componentsExcluded` — the few `componentLibrary` ids (usually none) that don't fit this lineage's topology.

### `GET /v1/schema/composition` — three complete, valid composition JSON objects (`examples[]`: `photo-led`, `assembled`, `exchange-led`) plus `elementBudgets` and rule notes not obvious from the shape. Shapes to copy field names from — never flyers to remix; see `COMPOSITION_NOTES` in `src/api/agent.ts`.

### `POST /v1/flyers/compose`

The authored composition: `lineage` (from `/v1/studio/assignments`, unchanged), `productName`, `campaignArchetype`, `sourceStatements` (the user's own words — Gate G6 checks every `copy.details` value against these), `idea`, `story` (4 beats), `copy`, `elements` (4–7, each `{ id, component, role, whyHere, assets?, props? }`), `relationships`, `gesturePurpose`, `assetIds`, `brandColors`. Omit `flyerId` to start a new flyer; include it to add a revision.

Renders, gate-checks and returns immediately (no polling): `flyerId`, `revision`, `codeCheckedGates` (G3/G5/G6 + mechanical — settled by code), `pendingYourJudgement: ["G1","G2","G4"]` (need a viewer), `critique`, `layoutWarnings`, an optional `reminder` (fires when the submission is exactly the "safe stack" skeleton, or repeats the prior revision's components unchanged), and export `urls`. A `422` lists the exact schema fields that are wrong.

### `PATCH /v1/flyers/{jobId}` — partial edit to an existing composition (`revise_composition`). Every field optional; an omitted field means "leave it alone." Supports `elements` (patch by id), `addElements`, `removeElements`. Same response shape as compose.

### `POST /v1/flyers/{jobId}/review`

The three gates code cannot settle, answered by whoever looked at the render:

```json
{
  "ideaReads": true, "ideaAsSeen": "…",
  "productGuessable": true, "productGuess": "…",
  "headlineParticipates": true, "copyReadsHuman": true,
  "collisions": [], "notes": "optional"
}
```

Flips the job to `done` (all six gates passed) or `below_bar` (with `failedGates` and a `message` naming what to fix). A reported collision fails `mechanical.noCollisions` — it can't be logged and ignored.

## 4. Batch (for the acceptance tests — build early, it's how we test ourselves)

### `POST /v1/batches`

```json
{ "prompt": "…", "runs": 10, "risk": "studio" }
```

Runs N **fully independent** jobs (fresh session semantics — no shared state between runs; this is how DR-1 is verified). Returns `batchId`; `GET /v1/batches/{batchId}` lists job results side by side, including each run's `idea` and `lineage` so diversity is auditable at a glance.

## 5. Introspection (dev/debug, auth-gated the same)

- `GET /v1/flyers/{jobId}/process` — the full process log: brief, sampled lineage, all candidate specs, critiques, gate results, per-stage timing and cost. This is the "why did it decide that" endpoint, and the data asset we never delete.
- `GET /v1/health` — liveness + component library / creative library counts and versions.

## 6. Rate/spend guards

Per-key: `MAX_CONCURRENT_JOBS` (default 2), `MAX_DAILY_USD` soft cap (default 20) — a job that would exceed the cap is rejected with `rate_limited` before any LLM call is made.

## 7. MCP mapping (thin adapter — no logic in this layer)

`src/mcp/server.ts` is a single `McpServer` shared by both transports (`server.registerTool`, no HTTP-vs-stdio duplication): stdio for local Claude/Cursor use, streamable HTTP (`POST /mcp`) for hosted connectors. Tool descriptions state what the tool does for the *user's goal* (goal-oriented, not `add_rectangle`-style primitives) and carry the discovery keywords a connector's tool-search matches on.

There are two independent surfaces. Most deployments (including the default — no `ANTHROPIC_API_KEY` set) only expose the first.

### Agent-native path — the calling agent is the designer, no server model key needed

This is the primary path: `read_design_guide` / `read_design_skill` teach judgement, `request_designers` samples a Studio Sampler lineage, the agent authors a composition itself, and the engine only supplies geometry, colour, typography, ornament and the gates.

| MCP tool | Calls | Notes |
|---|---|---|
| `read_design_guide` | `GET /v1/guide` | markdown onboarding doc; read once, first |
| `read_design_skill` | `GET /v1/skills`, `GET /v1/skills/{name}` | judgement guides: brief, composition, copywriting, critique — no palettes or measurements |
| `request_designers` | `POST /v1/studio/assignments` | Studio Sampler lineages; component catalogue returned once at the top level (`componentLibrary`), each assignment carries only `componentsExcluded` — the few ids (if any) that don't fit its topology |
| `search_images` | `POST /v1/assets/search` | multi-provider photo/icon/vector/shape/QR search |
| `import_image` | `POST /v1/assets/import` | pulls one search result into the asset store |
| `get_composition_example` | `GET /v1/schema/composition` | three JSON *shapes* (photo-led / assembled / exchange-led) to copy field names from, never flyers to remix |
| `compose_flyer` | `POST /v1/flyers/compose` | authored spec in, rendered + code-checked flyer out; response includes a `reminder` when the submission matches the named "safe stack" anti-pattern or repeats the prior revision's components unchanged |
| `revise_composition` | `PATCH /v1/flyers/{id}` | partial spec edit, re-renders |
| `review_flyer` | `POST /v1/flyers/{id}/review` | the agent's own G1/G2/G4 verdict after looking at the render; flips status to `done` or `below_bar` |
| `export_composed_flyer` | `GET …/export` | PNG/SVG; SVG keeps text as text |

### Server-authored path — needs `ANTHROPIC_API_KEY` on the server

Hands the whole job to a second, server-side model call. **Not registered as MCP tools at all when `ANTHROPIC_API_KEY` is unset** (the common case) — an agent that is already the model has nothing to gain from them and nothing to fail into.

| MCP tool | Calls | Notes |
|---|---|---|
| `create_flyer` | `POST /v1/flyers` + polls until terminal | returns idea + PNG preview (image content block) so the calling agent can *see* the result |
| `revise_flyer` | `POST /v1/flyers/{id}/revise` + polls | returns new preview image |
| `create_flyer_batch` | `POST /v1/batches` | for variety exploration from chat |

### Available either way

| MCP tool | Calls | Notes |
|---|---|---|
| `upload_asset` | `POST /v1/assets` | takes local file path or base64 `data`, uploads |
| `prepare_asset` | `POST /v1/assets/{id}/transform` | presets/ops; returns new assetId + preview |
| `get_flyer` | `GET /v1/flyers/{id}` | works for flyers made either path — same job store |
| `export_flyer` | `GET …/export` | works for flyers made either path |

## 8. curl smoke test (the loop we run daily during development)

```bash
# 1. upload
curl -s -H "Authorization: Bearer $KEY" -F "file=@resume.png" -F "kind=screenshot" \
  localhost:8080/v1/assets

# 2. create
curl -s -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"prompt":"Flyer for Vayami, an AI resume tool. Waitlist at vayami.ai/waitlist.","assetIds":["ast_…"]}' \
  localhost:8080/v1/flyers

# 3. poll
curl -s -H "Authorization: Bearer $KEY" localhost:8080/v1/flyers/fly_…

# 4. download
curl -s -H "Authorization: Bearer $KEY" -o out.svg \
  "localhost:8080/v1/flyers/fly_…/export?format=svg"

# 5. revise
curl -s -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"instruction":"less text, bigger product"}' \
  localhost:8080/v1/flyers/fly_…/revise
```
