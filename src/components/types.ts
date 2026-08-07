import type { ReactElement } from "react";
import type { ZodTypeAny } from "zod";
import type { Palette } from "../creative/colorlogic.js";
import type { MaterialValue } from "../creative/materials.js";
import type { LightSource } from "../core/canvas/light.js";
import type { TypographyValue } from "../creative/typebehaviors.js";
import type { FontPair } from "../creative/fontpairs.js";
import type { TopologyId } from "../creative/types.js";
import type { Rng } from "../lib/rng.js";

export type Role = "evidence" | "message" | "support" | "cta" | "brand" | "structure";

export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  /** Degrees; only ever non-zero when the signature gesture asks for it. */
  rotate?: number;
  /**
   * Where this sits between the far wall (0) and the lens (1).
   *
   * Distinct from `zIndex`, which only answers what covers what. Scale, haze,
   * contrast and blur are all derived from this one number so they cannot
   * disagree — inconsistency between those cues is what the eye reads as
   * "pasted on" without being able to name it.
   */
  depth?: number;
  /** Set by the layout solver for text-bearing components. */
  fontSize?: number;
  lines?: string[];
  /**
   * True when this element sits on top of a photographic plate, so its ink must
   * switch to something light. Decided by the solver, which is the only place
   * that knows the final stacking.
   */
  onDark?: boolean;
  /**
   * The actual fill this box sits on, when the solver knows it — a saturated
   * ground region rather than the flat page colour. Lets ink hold contrast
   * against the real colour instead of guessing at a generic dark plate.
   */
  ground?: string;
  /**
   * Props the solver must decide because they depend on final geometry — a
   * connector's waypoints, an annotation's leader target. The spec stays the
   * source of truth for *what*; geometry stays the solver's job.
   */
  propsOverride?: Record<string, unknown>;
};

/** Everything a component needs to draw itself. Fully derived from spec + seed. */
export type Theme = {
  palette: Palette;
  fonts: FontPair;
  material: MaterialValue;
  typography: TypographyValue;
  /**
   * One light for the whole poster. Every shadow is derived from it, rather
   * than each component inventing its own — which is what made composited
   * elements read as pasted on instead of sharing a scene.
   */
  light: LightSource;
};

export type AssetRef = {
  assetId: string;
  /**
   * Measured 8x8 luminance grid, if the store has one. Carried on the ref so
   * the solver can build its tone field without reaching into the asset store —
   * layout stays a pure function of what it is handed.
   */
  toneMap?: number[];
  /** Normalised visual centre used by SVG cover crops. */
  focalPoint?: { x: number; y: number };
  /** Normalised subject bounds, available to future silhouette-aware recipes. */
  subjectBox?: { x: number; y: number; w: number; h: number } | null;
  textSafeZones?: Array<{ x: number; y: number; w: number; h: number }>;
  /** data: URI, so exported SVG is self-contained and portable into Figma. */
  href: string;
  width: number;
  height: number;
};

/**
 * Copy lives on the spec, not on elements, so the same words can be referenced by
 * whichever component owns them. Structurally identical to the zod `Copy` in
 * core/compose/spec.ts — declared here to keep components free of a schema import.
 */
export type Copy = {
  eyebrow: string | null;
  headline: string;
  body: string | null;
  cta: { label: string; url: string | null; qr: boolean };
  /**
   * Small labelled facts — date, place, time, price, phone. Rendered as a
   * cluster by one element, so a poster can carry a dozen text objects without
   * spending a dozen elements against the 4-7 budget Gate G3 enforces.
   */
  details?: { label: string; value: string }[];
};

export type RenderContext = {
  id: string;
  box: Box;
  theme: Theme;
  copy: Copy;
  productName: string;
  props: Record<string, unknown>;
  assets: AssetRef[];
  /** Derived per element, so adding a component never shifts another's randomness. */
  rng: Rng;
};

export type ComponentManifest = {
  id: string;
  category: "content" | "evidence" | "structure";
  /** What this component is for — this text is shown to the Composer LLM. */
  purpose: string;
  roles: Role[];
  minSize: { w: number; h: number };
  maxSize: { w: number; h: number };
  /** Topologies this component reads well in; "any" when it is universally safe. */
  topologies: TopologyId[] | "any";
  assetSlots: number;
  /** Recorded now, used when the motion compiler lands (ROADMAP L3). */
  motion: string;
  /** Character budgets the Composer must respect, by prop name. */
  textLimits?: Record<string, number>;
  /**
   * What the component actually *looks like*.
   *
   * `purpose` says when to reach for something; it says nothing about what
   * appears on the page. An agent choosing between components — and then
   * deciding how they sit together, which one carries the dark, whether two of
   * them will fight — is reasoning about appearance, and had nothing to reason
   * from. It could pick `photo-cluster` for a journey without knowing it lays
   * down a wide horizontal band of circles that will crowd a headline beside it.
   *
   * **Required, and that is the point.** For a while only the seven photo
   * components carried one, so those were the only components an agent could
   * picture — and every flyer came back built from the same two or three of
   * them while twenty-eight others sat unreachable in the registry. The library
   * was never the limit; the description of it was. A new component without a
   * `visual` is a component nobody will ever choose, so the type refuses it.
   */
  visual: {
    /** The silhouette a viewer registers before reading anything. */
    shape:
      | "rectangle"
      | "circle-row"
      | "stack"
      | "grid"
      | "arch"
      | "band"
      | "line"
      | "freeform"
      | "text-only";
    /** Natural width:height it wants. 1 is square; >1 is wide. */
    aspect: number;
    /** How much ink it lays down over its box. */
    density: "sparse" | "medium" | "heavy";
    /**
     * Whether it brings its own tone. A photograph or a filled panel darkens
     * whatever it covers; type and rules leave the ground showing through.
     */
    carriesTone: boolean;
    /** One line describing the finished thing, as a viewer would see it. */
    reads: string;
  };
};

export type ComponentModule = {
  manifest: ComponentManifest;
  props: ZodTypeAny;
  /**
   * Height this component wants at a given width. The solver uses it to stack
   * and shrink content before committing geometry.
   *
   * `copy` is optional and most components ignore it — height is usually a
   * function of `props` and `width` alone. It exists for the rare component
   * whose row/line count depends on data that lives in `copy`, not `props`
   * (`detail-cluster`'s fact count): without it, a fixed-count assumption
   * silently breaks the moment the count differs, and nothing catches it
   * because layout in isolation still "succeeds" — it just overlaps once
   * the wrong number of rows are drawn into a box sized for the guess.
   */
  intrinsicHeight?: (props: any, theme: Theme, width: number, copy?: Copy) => number;
  render: (ctx: RenderContext) => ReactElement;
};
