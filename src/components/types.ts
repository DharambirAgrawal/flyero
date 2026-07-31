import type { ReactElement } from "react";
import type { ZodTypeAny } from "zod";
import type { Palette } from "../creative/colorlogic.js";
import type { MaterialValue } from "../creative/materials.js";
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
};

export type AssetRef = {
  assetId: string;
  /**
   * Measured 8x8 luminance grid, if the store has one. Carried on the ref so
   * the solver can build its tone field without reaching into the asset store —
   * layout stays a pure function of what it is handed.
   */
  toneMap?: number[];
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
};

export type ComponentModule = {
  manifest: ComponentManifest;
  props: ZodTypeAny;
  /**
   * Height this component wants at a given width. The solver uses it to stack
   * and shrink content before committing geometry.
   */
  intrinsicHeight?: (props: any, theme: Theme, width: number) => number;
  render: (ctx: RenderContext) => ReactElement;
};
