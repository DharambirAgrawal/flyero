# The Canvas Model — designing for an engine that cannot see

## The problem, stated properly

Every visual bug this project has hit lately is the same bug wearing a different
hat:

- the eyebrow drawn in white on a pale sky, invisible
- the QR drawn with white modules on a white backing, unscannable
- white type on a bright forest canopy, unreadable, while every gate passed
- a treeline growing up through the detail cluster
- the contrast gate comparing type against `brand.colors.bg` when a photograph
  or a gradient is what is actually underneath

Each was patched where it surfaced — a scrim here, a fixed colour pair there.
Then the next one appeared, because **the patch is not the fix**.

The fix is that *nothing in the system knows what is already on the canvas.*
A component is handed a box and a theme and draws. It cannot ask what is beneath
it, how bright that is, whether it is busy or calm, or whether anything else has
already claimed that space. It draws blind, and we discover the collision by
rendering a PNG and looking at it.

Rendering and looking does not scale, and it is not available to the engine at
the moment it must decide.

## The reframing that makes the design obvious

*Design as though you cannot see the output.* What would you need to be told, in
structured form, to place a headline well?

Not "here is a picture". You would need:

1. **What is underneath this region, and how bright is it?** — so ink can be
   chosen to contrast with the truth rather than with an assumption.
2. **Is that region calm or busy?** — flat colour will take fine type; a
   canopy of leaves will swallow it whatever the contrast ratio says.
3. **What space is already claimed, and by what?** — so nothing lands on
   anything else.
4. **Where are the quiet areas?** — so type can be *placed* well, not merely
   rescued after the fact.

That list is the specification. It is a **queryable model of the canvas**, built
as the composition is assembled and consulted before anything is drawn.

## The model

A coarse tone field over the canvas — cells of roughly 90px, so ~12 x 15 for a
1080x1350 page. Fine enough to distinguish a headline zone from a busy corner,
coarse enough to stay cheap and deterministic.

```ts
type ToneCell = {
  /** Mean relative luminance 0-1 of everything painted here so far. */
  luminance: number;
  /** Tonal spread within the cell. High = busy: a photo, a treeline, a pattern. */
  variance: number;
  /** Representative fill, for contrast arithmetic. */
  fill: string;
};

type CanvasModel = {
  /** What is under this rect? */
  sample(rect: Rect): { luminance: number; variance: number; fill: string };
  /** Is this rect calm enough to carry type at this size? */
  legibleFor(rect: Rect, ink: string, large: boolean): boolean;
  /** Regions calm enough to place type into. */
  quietZones(minW: number, minH: number): Rect[];
};
```

Contributors paint into it **in z-order**, exactly as the renderer will:

1. the ground plan — base wash, regions, gradient
2. under-layer decorations
3. elements in z-order

A **photograph contributes its real tone**, not a guess. That comes from a small
tone map (8x8 mean luminances) computed with `sharp` when the asset is created:
deterministic, free, no model call, stored on the asset alongside `palette`.
This is the missing fact that made every photo-related bug possible.

## What consumes it

| Consumer | Today | With the model |
|---|---|---|
| `inkFor` | an `onDark` boolean set from plate coverage | ink chosen against the measured tone underneath |
| scrim | all-or-nothing, `full` or one edge | placed and sized exactly where type needs it |
| contrast gate | compares against `brand.colors.bg` | compares against what is actually there |
| decoration placement | keep-out rects only | also avoids busy regions |
| headline placement | fixed recipe slot | can prefer a quiet zone |

The invisible eyebrow, the unscannable QR and the unreadable headline are then
all the *same* check in one place, rather than three special cases.

## Where it lives

`src/core/canvas/tone.ts`, built inside `solveLayout` immediately after the
ground is planned and before any ink decision — the same reasoning that forced
ground planning into the solver. It becomes part of `LayoutResult`, so the gates
can read the same numbers the solver used.

## Constraints it must not break

- **Deterministic.** A grid of numbers derived from fills and stored tone maps;
  no sampling of rendered output, so byte-identical SVG survives.
- **Cheap.** ~180 cells, arithmetic only. No rasterising during layout.
- **Honest.** It is a *coarse* model. It must not be trusted to sub-cell
  precision, and where it is uncertain the safe answer is "treat as busy".

## Why not just rasterise and measure

Because the engine must decide *before* it draws, and because rendering to
measure would make layout depend on the renderer — circular, slow, and fatal to
the determinism guarantee. The model is an estimate built from what the system
already knows: fills it chose, and tone maps measured once at upload.
