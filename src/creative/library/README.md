# Curated asset library

Drop your own full-colour images here and they become searchable through the
normal `search_images` → `import_image` flow (as `provider: "library"`),
permanently, on every future job — no upload step needed each time.

There is no database engine here. This folder *is* the store — read into
memory once at startup (or on demand via `reloadCuratedLibrary()`), the same
way `src/creative/motifs/` works. What `ls` shows you is everything there is.

This is different from **motifs** (`src/creative/motifs/`, vector marks
recoloured from the flyer's palette — single-layer or multi-layer via
`data-tone`) and different from a
**job's uploaded assets** (`POST /v1/assets`, ephemeral, per-job, not
searchable later). This folder is for real photographs and illustrations you
want available everywhere, indefinitely.

## Adding an image

Two files per image, same base name, in a subfolder for whatever subject
makes sense to you (subfolders are for browsing — they don't affect search):

```
src/creative/library/<subject>/<name>.png   (or .jpg / .jpeg / .webp)
src/creative/library/<subject>/<name>.json
```

The `.json` sidecar:

```json
{
  "title": "Watercolor peony bouquet",
  "tags": ["flower", "watercolor", "wedding", "floral"],
  "type": "png",
  "usage": "layer over any background — transparent cutout, not a full scene",
  "license": "optional — worth noting if you know it",
  "author": "optional — the artist/photographer, for credit"
}
```

Only **`title`** is required.

## How an agent knows what it's looking at

This is the part that matters, and most of it doesn't depend on you filling
in a field correctly:

- **Whether the image has a transparent background is measured, not
  declared.** The loader reads the actual pixels (`sharp`'s real alpha
  values, not just "does a PNG have an alpha channel") every time it loads,
  so it can never be wrong or go stale.
- **`type`** — the *role*, not the subject, and worth setting explicitly
  whenever the subject alone doesn't say it. A hundred images could all
  reasonably be titled "balloon" and mean completely different things: a
  full-bleed background texture, a small decorative cutout scattered as
  ornament, or the literal product photo an event-supply shop is selling —
  three different jobs in a composition. Same for "water": a background
  texture, a standalone product photo, a small droplet icon. Set `type` to
  one of `photo` (the depicted thing itself — usable as cover-test
  evidence), `background` (fills the whole canvas), `png` (a cutout accent,
  not the main evidence), `icon` (a small symbolic mark), `vector`/`svg`
  (an illustration), or `shape` (a divider/badge). Left unset, it defaults
  to `png` if the image is transparent or `photo` if it's opaque — a
  reasonable guess, not a substitute for saying so when that guess is wrong
  (a background texture is very often opaque, and would default to `photo`
  incorrectly if you don't set `type: "background"`).
- **`usage`** is the one thing neither pixels nor a type enum can capture —
  what this *specific* image is for ("layer over any background," "hero
  shot for the storefront," "full-bleed texture only"). Shown to the agent
  in the search result's own `description` field, alongside the measured
  transparency and the resolved role, so nothing has to be guessed from the
  filename alone.
- **Search** ranks by BM25 (`src/lib/search.ts`) over id, title, tags,
  `type`, `usage` and the subfolder name — real relevance ranking, with a
  small synonym table for near-miss queries ("birthday" also matches
  "celebration"). Pin a search to only this library with
  `provider: "library"`.

## License

Not enforced by code — nothing here can judge whether a license is actually
valid. Worth doing anyway, and writing the answer into `license` when you
do: the question that matters is "does this license cover Flyero embedding
the image in flyers generated for *other people*, not just my own personal
use" — and most downloaded stock/clipart licenses answer **no** to that
(checked one for real, `CHANGELOG.md` 2026-08-13 — a "Premium License" that
explicitly excludes "any platform that allows your end users to customize
and/or print their own products," which is what this product is). When in
doubt, don't add the file — a missing image is a quick fix; a license
problem in flyers already sent to people is not.
