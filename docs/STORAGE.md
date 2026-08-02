# Storage on a small budget

A free Postgres tier is 0.5GB. Measured on real test usage, Flyero was using
**274MB for 52 flyers** — about 5MB each. At that rate the budget is gone after
a hundred flyers. After the changes below the same 52 flyers use **31MB**, and a
new flyer costs roughly 150KB.

## Where it was going

```
renders   220.8MB   81%
assets     52.0MB   19%
specs       0.25MB   <1%
```

## Two changes, both large

### 1. Renders are not stored

Rendering is deterministic: the same spec, seed and assets always produce
identical bytes (AGENTS.md law 3). A stored PNG is therefore a **cache**, not
data — and it was 81% of everything.

`exportFlyer` now writes only `spec.json`. Exports re-render on demand, which is
guaranteed to give the same bytes the cache would have held. Set
`PERSIST_RENDERS=true` to cache anyway, where CPU costs more than disk.

The spec is always kept. It is what the flyer *is*, it is ~8KB, and losing one
destroys work that cannot be recovered.

### 2. Photographs are stored as WebP, not PNG

The downscale path rasterised through resvg and emitted PNG — lossless, and
therefore catastrophic for a photograph. Measured on one image:

```
old: PNG,  long edge 2400   6656KB
new: WebP, long edge 1600    142KB     47x smaller
```

Images with transparency stay PNG; WebP-ing a logo's alpha away would put a
white box on the flyer. The long edge dropped to 1600 because the canvas is
1080x1350 — anything beyond that is detail the renderer cannot use.

## Keeping an eye on it

```
GET /v1/storage
```

Returns total MB, the split between specs, assets and renders, and the flyer
count.

```
npm run prune              # report what could be reclaimed
npm run prune -- --apply   # reclaim it
```

Deletes cached renders and assets no surviving spec references. Never touches a
spec.

## Rough capacity at 0.5GB

| | size | fits in 0.5GB |
|---|---|---|
| spec | ~8KB | ~65,000 |
| imported photo (WebP) | ~150KB | ~3,400 |
| flyer with 3 photos | ~460KB | ~1,100 |

Assets dominate. If it ever gets tight, the next move is to stop storing bytes
for *imported stock* at all — the provenance already records the source URL, so
those can be re-fetched — and keep bytes only for images a user uploaded, which
cannot be recovered from anywhere else.

## What `DATABASE_URL` does today: nothing

**Setting `DATABASE_URL` has no effect.** There is no Postgres driver in the
project; the job store is SQLite (`better-sqlite3`) and objects are files on
disk. Both live on the container filesystem.

On Render's free plan that filesystem is **ephemeral** — a restart, a redeploy
or a sleep/wake cycle wipes it, and every flyer with it. The changes above make
storage far cheaper but do not make it survive a restart.

Two honest options:

1. **A Render persistent disk** (paid). Nothing in the code changes; mount it at
   `STORAGE_DIR` and the SQLite file and objects both persist.
2. **Wire Postgres properly.** A real piece of work: a driver, a migration of
   the `jobs`/`revisions`/`assets` tables, and a decision about whether image
   bytes live in the database (expensive at 0.5GB) or in object storage such as
   S3/R2 with only metadata in Postgres. The object-store key shape already
   anticipates this — see `src/store/objects.ts`.

Option 2 is the right end state; option 1 is the one that works this afternoon.
