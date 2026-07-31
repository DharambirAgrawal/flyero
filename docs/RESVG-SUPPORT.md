# resvg feature support (measured, not assumed)

`@resvg/resvg-js` 2.6.2 documents nothing about its SVG coverage, so this was
measured with `scripts/probe-resvg.ts` and confirmed by eye
(`.scratch/tmp/probe-sheet.png`).

**Everything the decoration work needs renders correctly. No fallbacks required.**

| feature | status | used for |
|---|---|---|
| `<textPath>` | ✅ | arched headlines — and the text stays real `<text>`, so SVG editability survives |
| `<pattern>` | ✅ | tiled dot/check fields — replaces emitting ~1600 individual `<circle>`s |
| `<linearGradient>` / `<radialGradient>` | ✅ | ground washes, scrims, glows |
| `feGaussianBlur` | ✅ | soft shapes, depth |
| `feTurbulence` + `feColorMatrix` | ✅ | real paper grain, replacing 900 seeded circles |
| `feDropShadow` | ✅ | real shadows, replacing `Panel`'s fake offset rect |
| `mix-blend-mode` | ✅ | multiply/overlay ink effects |
| `<mask>` | ✅ | shaped reveals beyond the current `clipPath` set |
| dashed `<path>` on curves | ✅ | flight-path connectors |
| stroked (outline) text | ✅ | poster headline treatment |
| group `opacity` + `rotate` | ✅ | already in use |

## Two rules that are not optional

**1. `mix-blend-mode` must be a `style` declaration, never an attribute.**
Measured: `mix-blend-mode="multiply"` as a presentation attribute is *silently
dropped* — no warning, no error, and the layer renders opaque. Only
`style="mix-blend-mode:multiply"` works. React emits `style={{ mixBlendMode }}`
in the working form, so use that and never the JSX attribute.

**2. Do not use `feTurbulence` for grain.** It renders, and it is deterministic
*within this resvg build*, but its output is an implementation detail of
resvg's Perlin noise. A version bump would silently change every rendered PNG.
The golden test compares runs against each other, not against a stored
baseline, so it would not catch the change. Generate grain from the seeded
`Rng` or a `<pattern>` instead, and keep filters to `feGaussianBlur` and
`feDropShadow` where the geometry is analytic.

## Keeping this honest

`test/unit/resvg-capabilities.test.ts` re-checks every row above by sampling
real pixels, and asserts the blend-mode asymmetry explicitly. It turns "the
resvg upgrade broke patterns" from a visual regression into a red test.

Caution: a passing probe means resvg *draws* it, not that it is cheap. Prefer
`<pattern>` over thousands of nodes, and keep filter regions tight.
