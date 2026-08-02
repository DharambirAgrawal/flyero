import { CONTENT_COMPONENTS } from "./content.js";
import { EVIDENCE_COMPONENTS } from "./evidence.js";
import { FIGURE_COMPONENTS } from "./figure.js";
import { PHOTO_COMPONENTS } from "./photo.js";
import { STRUCTURE_COMPONENTS } from "./structure.js";
import type { ComponentManifest, ComponentModule, Role } from "./types.js";
import type { TopologyId } from "../creative/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * The Component Library. The Composer may only choose from this registry — it
 * cannot invent raw shapes (ARCHITECTURE.md §4).
 */
const ALL: ComponentModule[] = [
  ...CONTENT_COMPONENTS,
  ...EVIDENCE_COMPONENTS,
  ...PHOTO_COMPONENTS,
  ...FIGURE_COMPONENTS,
  ...STRUCTURE_COMPONENTS,
];

const BY_ID = new Map<string, ComponentModule>(ALL.map((c) => [c.manifest.id, c]));

if (BY_ID.size !== ALL.length) {
  throw new Error("Duplicate component id in the registry");
}

export const COMPONENTS = ALL;
export const COMPONENT_IDS = ALL.map((c) => c.manifest.id);

export function getComponent(id: string): ComponentModule {
  const mod = BY_ID.get(id);
  if (!mod) throw new Error(`Unknown component ${JSON.stringify(id)}`);
  return mod;
}

export function hasComponent(id: string): boolean {
  return BY_ID.has(id);
}

export function manifestsFor(topology: TopologyId): ComponentManifest[] {
  return ALL.map((c) => c.manifest).filter(
    (m) => m.topologies === "any" || m.topologies.includes(topology),
  );
}

export function componentsWithRole(role: Role): ComponentModule[] {
  return ALL.filter((c) => c.manifest.roles.includes(role));
}

const ENGINE_OWNED_PROPS = new Set([
  "align",
  "maxLines",
  "pointTo",
  "side",
  "scrimBand",
  "bow",
  "tilt",
  "gutter",
  "radius",
  "columns",
  "rows",
  "points",
]);

/** Public, author-safe JSON Schema for agents that do not have this codebase. */
export function componentPropsSchema(id: string, includeEngineOwned = false): Record<string, unknown> {
  const schema = zodToJsonSchema(getComponent(id).props, {
    target: "openApi3",
    $refStrategy: "none",
  }) as Record<string, unknown>;
  if (includeEngineOwned) return schema;
  const properties = { ...((schema.properties ?? {}) as Record<string, unknown>) };
  for (const key of ENGINE_OWNED_PROPS) delete properties[key];
  const required = ((schema.required ?? []) as string[]).filter((key) => !ENGINE_OWNED_PROPS.has(key));
  return { ...schema, properties, ...(required.length > 0 ? { required } : {}) };
}

export function engineOwnedPropsFor(id: string): string[] {
  const full = componentPropsSchema(id, true) as { properties?: Record<string, unknown> };
  return Object.keys(full.properties ?? {}).filter((key) => ENGINE_OWNED_PROPS.has(key));
}

function propSummary(id: string): string {
  const schema = componentPropsSchema(id) as {
    properties?: Record<string, { enum?: unknown[]; type?: string; default?: unknown }>;
    required?: string[];
  };
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {})
    .map(([key, value]) => {
      const shape = value.enum?.join("|") ?? value.type ?? "value";
      const fallback = value.default === undefined ? "" : `=${String(value.default)}`;
      return `${key}${required.has(key) ? "!" : ""}:${shape}${fallback}`;
    })
    .join(",");
}

/** Compact catalogue handed to the Composer so it picks real components only. */
export function catalogueFor(topology: TopologyId): string {
  return manifestsFor(topology)
    .map((m) => {
      const limits = m.textLimits
        ? ` limits:{${Object.entries(m.textLimits)
            .map(([k, v]) => `${k}<=${v}`)
            .join(",")}}`
        : "";
      const props = propSummary(m.id);
      return `- ${m.id} [${m.category}] roles:${m.roles.join("|")} assets:${m.assetSlots}${limits}${props ? ` props:{${props}}` : ""}\n    ${m.purpose}`;
    })
    .join("\n");
}

export const COMPONENT_COUNT = ALL.length;
