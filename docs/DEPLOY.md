# Deploying Flyero, and using it as a connector

## Render

`render.yaml` is in the repo root, so **New → Blueprint** and point it at the
repo. If you configure by hand instead:

| Setting | Value |
|---|---|
| Build command | `npm install && npm run build` |
| Start command | `npm start` |
| Health check path | `/health` |

`npm run build` typechecks and downloads the fonts. It does **not** emit JS —
the app runs TypeScript directly through `tsx`, which is why `tsx` and
`typescript` are runtime dependencies rather than dev ones. Render installs with
`NODE_ENV=production` and skips devDependencies, so leaving them there produces
a green build and a start that fails with `tsx: not found`.

## Environment variables

Two matter. Everything else has a working default.

**`API_KEYS` — set this.** It defaults to `dev_key_change_me`, which is in the
repo and therefore public. A public URL plus a known key is an open service:
anyone can generate flyers on your instance and spend your Pexels quota. The
blueprint generates one for you; copy it out of the Render dashboard.

**`PEXELS_API_KEY` — set it if you want stock photo search.** Without it,
`/v1/assets/search` and `/v1/assets/import` return `503 not_configured` and
everything else works normally. Free key from https://www.pexels.com/api/.

Optional: `PORT` (Render sets it), `NODE_ENV`, `DEFAULT_RISK`,
`MAX_CONCURRENT_JOBS`, `LLM_*`. See `.env.example`.

## What the free plan costs you

- **It sleeps.** First request after idle takes ~30s to wake.
- **Disk is ephemeral.** The SQLite job store and rendered files live on the
  container filesystem, so a restart or redeploy loses previous flyers. Export
  what you want to keep. A persistent disk fixes this on a paid plan.
- **Fonts re-download on every cold build** (~50 files), which is why the build
  is slower than the code alone would suggest.

## Adding it as a connector

The server exposes remote MCP at **`/mcp`** over Streamable HTTP, alongside the
REST API. One deployment serves both.

Connector URL:

```
https://YOUR-SERVICE.onrender.com/mcp?key=YOUR_API_KEY
```

In Claude: **Settings → Connectors → Add custom connector**, paste that URL.
Same idea in any other MCP-capable client.

**On the key in the URL.** Many connector UIs cannot attach an `Authorization`
header, so `/mcp` accepts `?key=`. A URL carrying a credential leaks through
browser history, server logs and screen shares — fine for a personal instance,
not for one you share. The REST surface stays header-only for that reason. If
your client *can* send headers, use `Authorization: Bearer YOUR_API_KEY` and
drop the query parameter.

## Tools the connector exposes

`create_flyer`, `create_flyer_batch`, `upload_asset`, `prepare_asset`,
`get_flyer`, `revise_flyer`, `export_flyer`.

## Checking it works

```bash
curl https://YOUR-SERVICE.onrender.com/health
# {"ok":true}

curl -X POST "https://YOUR-SERVICE.onrender.com/mcp?key=YOUR_API_KEY" \
  -H "content-type: application/json" \
  -H "accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

The second should list the seven tools. If it returns 401 the key is wrong; if
it returns 404 the deployment predates the `/mcp` route.

## One thing to know before you rely on it

Flyer generation calls a language model for the brief, idea, composition and
vision critique. Without `ANTHROPIC_API_KEY` those stages fail and jobs return
an honest failure rather than a flyer. The MCP tools that do not generate —
uploading and preparing assets, exporting an existing flyer — work regardless.
