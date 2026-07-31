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

| MCP tool | Calls | Notes |
|---|---|---|
| `upload_asset` | `POST /v1/assets` | takes local file path, reads, uploads |
| `prepare_asset` | `POST /v1/assets/{id}/transform` | presets/ops; returns new assetId + preview |
| `create_flyer` | `POST /v1/flyers` + polls until terminal | returns idea + PNG preview (image content block) so the calling agent can *see* the result |
| `get_flyer` | `GET /v1/flyers/{id}` | |
| `revise_flyer` | `POST /v1/flyers/{id}/revise` + polls | returns new preview image |
| `export_flyer` | `GET …/export` | writes file to user's workspace, returns path |
| `create_flyer_batch` | `POST /v1/batches` | for variety exploration from chat |

MCP server config: stdio transport for local Claude/Cursor use; streamable HTTP later. Tool descriptions must state what the tool does for the *user's goal* (goal-oriented, few tools — not `add_rectangle` style primitives).

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
