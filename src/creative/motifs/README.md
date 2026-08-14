# Motif library

Hand-authored vector marks for `composed-figure` and ornament. Drop an SVG
anywhere in this tree and it is searchable and drawable with no code change.

Filename minus `.svg` is the id (unique across every subfolder). Folders are
for browsing and as the `category` search field.

## File convention

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-tags="cake,birthday,bakery">
  <title>One short sentence of what this looks like.</title>
  <desc>
    The paragraph an agent needs: what it looks like, when to reach for it,
    what it is not, which regions recolour. Searched the same as the title.
  </desc>
  <path data-tone="accent" d="…"/>
  <path data-tone="paper" d="…"/>
  <path data-tone="accent2" d="…"/>
</svg>
```

- `viewBox="0 0 100 100"`. Coordinates roughly inside that square.
- Colour is never baked in. No hex fills, no gradients, no `<image>`.
- **Multi-layer (preferred for filled marks):** every `<path>` has
  `data-tone="ink|accent|accent2|muted|paper|ground"`. Those names are the
  flyer's own palette slots — icing can be `paper`, a flame `accent2`, the
  body `accent` — so the same file works in every lineage.
- **Line art:** `fill="none"` on the paths, no `data-tone` (the two cannot
  mix). Drawn as a stroke in the caller's tone.
- `fill-rule="evenodd"` to punch a hole (a lens, a pin's eye).
- Directional marks (`plane`, `arrow`) point due right (+x).
- Original geometry only — no downloaded icon packs. Most consumer clipart
  licences forbid redistribution inside a product that lets other people
  generate designs.

Folders include subject matter (`celebration`, `nature`, …) and `ornament/`
for marks meant to sit *around* the content: corner flourishes, wreaths,
sunbursts, botanical sprays, divider rules. Graphic languages pick those
from a slot pool; they are not extra React components.

`<title>` and `<desc>` are required. An id-only file is how an agent picks
the wrong mark.
