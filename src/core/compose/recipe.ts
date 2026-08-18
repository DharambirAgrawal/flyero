import { manifestsFor, componentsWithRole, hasComponent } from "../../components/registry.js";
import { gestureById } from "../../creative/gestures.js";
import { isPhotoGround, photoFillsPage } from "../layout/recipes.js";
import { deriveSpecies, type PosterSpecies } from "../studio/species.js";
import type { AuthoredSpec } from "./assemble.js";
import type { Lineage } from "./spec.js";
import type { Role } from "../../components/types.js";

/**
 * The recipe-bound compose surface (plan item R3).
 *
 * `compose_flyer`'s `AuthoredSpec` still asks an author to invent element ids,
 * a full relationships graph, and a gesture purpose from a blank page — the
 * exact "author a complete DesignSpec in one shot" burden the design review
 * named as the actual interface problem, distinct from taste. Real designers
 * don't do that: they pick what the page is, place the subject, write three
 * lines.
 *
 * `RecipeFill` is that smaller thing. It's bound to named roles the recipe
 * (`TopologyRecipe.slots`) and the sampled lineage already define — evidence,
 * message, support, cta, brand — instead of open element/relationship
 * authoring. `compileRecipe` derives the rest (the message↔evidence
 * relationship that satisfies Gate G4, the gesture-required structural
 * element if the lineage's gesture needs one) and hands back the same
 * `AuthoredSpec` shape `assembleSpec` already validates — nothing downstream
 * of this module changes, and the full `compose_flyer` surface keeps working
 * unmodified for callers who want it.
 */

/**
 * Gesture-required components whose props are pure layout shape — nothing a
 * fabricated value could turn into an invented fact. Every other
 * `requires` id (`annotation-label`, `big-numeral`, `eyebrow-label` — real
 * words or a real figure) is deliberately absent: those need an author.
 */
const STRUCTURAL_GESTURE_DEFAULTS: Record<string, { role: Role; props: Record<string, unknown> }> = {
  "path-connector": {
    role: "structure",
    props: { points: [{ x: 0.1, y: 0 }, { x: 0.6, y: 0.6 }, { x: 0.95, y: 1 }] },
  },
  "oversized-letterform": { role: "structure", props: { character: "A" } },
  "rule-line": { role: "structure", props: { weight: "medium" } },
};

export type SlotFill = {
  component: string;
  /** Gate G3's delete test: what breaks if this element is removed? */
  whyHere: string;
  assets?: string[];
  props?: Record<string, unknown>;
};

export type ExtraOverlap = {
  kind?: "overlap" | "weave" | "annotate" | "connect" | "frame";
  /** Slot name on the "front" side — must be a slot actually filled below. */
  front: "message" | "support" | "cta" | "brand";
  /** Slot name on the "behind" side. */
  behind: "evidence" | "message" | "support" | "brand";
  overlap?: number;
  purpose: string;
};

export type RecipeFill = {
  productName: string;
  campaignArchetype?: AuthoredSpec["campaignArchetype"];
  idea: string;
  story: [string, string, string, string];
  sourceStatements?: string[];
  copy: AuthoredSpec["copy"];
  /** Which asset is the subject — the Intent layer. Omit when there is none to photograph. */
  groundAsset?: string;
  /** Secondary assets a collage-style evidence component can use alongside `groundAsset`. */
  extraAssets?: string[];
  slots: {
    evidence: SlotFill;
    message: SlotFill;
    support: SlotFill;
    cta: SlotFill;
    brand?: SlotFill;
  };
  /** Extra content elements beyond the four named slots, for a "rich" density lineage. Rare — most lineages don't need this. */
  extras?: Array<SlotFill & { role?: "support" | "structure" }>;
  /** One optional additional overlap beyond the derived message↔evidence one. */
  extraOverlap?: ExtraOverlap;
  gesturePurpose: string;
};

export type RecipeCompileResult =
  | { ok: true; authored: AuthoredSpec; species: PosterSpecies }
  | { ok: false; errors: string[] };

function toElement(
  id: string,
  role: string,
  fill: SlotFill,
  assets?: string[],
): AuthoredSpec["elements"][number] {
  return {
    id,
    component: fill.component,
    role,
    whyHere: fill.whyHere,
    ...(assets && assets.length > 0 ? { assets } : {}),
    ...(fill.props ? { props: fill.props } : {}),
  };
}

/**
 * The one structural check this module does itself, ahead of the schema:
 * naming which slot components are actually legal on this topology, so a
 * caller gets one clear list instead of guessing from the full ~40-component
 * library. Not a re-implementation of `specElementSchema`'s validation —
 * `assembleSpec` still runs that.
 */
export function legalComponentsFor(lineage: Pick<Lineage, "topology">, role: Role): string[] {
  const onTopology = new Set(manifestsFor(lineage.topology).map((m) => m.id));
  return componentsWithRole(role)
    .map((c) => c.manifest.id)
    .filter((id) => onTopology.has(id));
}

export function compileRecipe(lineage: Lineage, input: RecipeFill): RecipeCompileResult {
  const errors: string[] = [];
  const species = deriveSpecies(lineage);
  const photoGround = isPhotoGround(lineage.topology);
  const gesture = gestureById(lineage.gesture);

  for (const [slotName, fill] of Object.entries(input.slots) as [string, SlotFill | undefined][]) {
    if (fill && !hasComponent(fill.component)) {
      errors.push(`slots.${slotName}: unknown component "${fill.component}"`);
    }
  }
  for (const [i, extra] of (input.extras ?? []).entries()) {
    if (!hasComponent(extra.component)) errors.push(`extras[${i}]: unknown component "${extra.component}"`);
  }

  const evidenceAssets = [input.groundAsset, ...(input.extraAssets ?? [])].filter(
    (a): a is string => Boolean(a),
  );
  if (photoGround && evidenceAssets.length === 0) {
    errors.push(
      `this lineage's topology (${lineage.topology}) makes the photograph the page — ` +
        `groundAsset is required, not just a component choice`,
    );
  }

  const elements: AuthoredSpec["elements"] = [
    toElement("evidence", "evidence", input.slots.evidence, evidenceAssets),
    toElement("message", "message", input.slots.message),
    toElement("support", "support", input.slots.support),
    toElement("cta", "cta", input.slots.cta),
  ];
  if (input.slots.brand) elements.push(toElement("brand", "brand", input.slots.brand));

  (input.extras ?? []).forEach((extra, i) => {
    elements.push(toElement(`extra-${i + 1}`, extra.role ?? "support", extra));
  });

  // The gesture is already locked to the lineage (assembleSpec sets
  // gesture.type from it) — nothing to author. What's missing is only
  // ensuring a qualifying element exists when the gesture can't express
  // itself through any component already in the fill. Auto-inserting it here
  // (compose time) is sound in a way a post-hoc patch on a solved layout is
  // not — it's still just spec construction, validated the normal way — but
  // ONLY for components whose props are pure layout shape (a path's points, a
  // rule's weight). A component like `annotation-label` or `big-numeral`
  // needs real content tied to the brief; fabricating that text would be
  // exactly the invented-fact failure law 5 exists to stop, so those are
  // reported as an error asking the author to supply the element themselves
  // (via `extras`) instead of silently inserted.
  if (gesture.requires && !elements.some((e) => e.component === gesture.requires)) {
    const auto = STRUCTURAL_GESTURE_DEFAULTS[gesture.requires];
    if (auto) {
      elements.push({
        id: "structure",
        component: gesture.requires,
        role: auto.role,
        whyHere: `carries this lineage's signature gesture (${gesture.id})`,
        props: auto.props,
      });
    } else {
      errors.push(
        `this lineage's gesture (${gesture.id}) requires an element using "${gesture.requires}", which ` +
          `needs real authored content — add it via \`extras\` with real copy, it can't be auto-inserted`,
      );
    }
  }

  // Always give the headline a structural relationship — satisfies Gate G4
  // regardless of whether this lineage's typography behaviour already does,
  // and the solver clamps the actual overlap sensibly per topology (a
  // near-zero overlap on a hard-split topology still counts as "in a
  // relationship" without fighting the topology's own choreography).
  const relationships: AuthoredSpec["relationships"] = [
    {
      kind: "overlap",
      front: "message",
      behind: "evidence",
      overlap: photoGround ? (photoFillsPage(lineage.topology) ? 0.18 : 0.12) : 0.05,
      purpose:
        species === "P"
          ? "set the headline directly on the photograph so reading it means seeing the subject"
          : species === "S"
            ? "tie the message to the evidence slab instead of floating separately above it"
            : "give the headline a measured relationship to the page instead of sitting in empty space",
    },
  ];
  if (input.extraOverlap) {
    const { kind, front, behind, overlap, purpose } = input.extraOverlap;
    const knownIds = new Set(elements.map((e) => e.id));
    if (!knownIds.has(front) || !knownIds.has(behind)) {
      errors.push(`extraOverlap references a slot that wasn't filled: ${front} / ${behind}`);
    } else {
      relationships.push({ kind, front, behind, overlap, purpose });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    species,
    authored: {
      productName: input.productName,
      campaignArchetype: input.campaignArchetype,
      idea: input.idea,
      story: input.story,
      sourceStatements: input.sourceStatements,
      copy: input.copy,
      elements,
      relationships,
      gesturePurpose: input.gesturePurpose,
    },
  };
}
