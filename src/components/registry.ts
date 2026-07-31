import { CONTENT_COMPONENTS } from "./content.js";
import { EVIDENCE_COMPONENTS } from "./evidence.js";
import { PHOTO_COMPONENTS } from "./photo.js";
import { STRUCTURE_COMPONENTS } from "./structure.js";
import type { ComponentManifest, ComponentModule, Role } from "./types.js";
import type { TopologyId } from "../creative/types.js";

/**
 * The Component Library. The Composer may only choose from this registry — it
 * cannot invent raw shapes (ARCHITECTURE.md §4).
 */
const ALL: ComponentModule[] = [
  ...CONTENT_COMPONENTS,
  ...EVIDENCE_COMPONENTS,
  ...PHOTO_COMPONENTS,
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

/** Compact catalogue handed to the Composer so it picks real components only. */
export function catalogueFor(topology: TopologyId): string {
  return manifestsFor(topology)
    .map((m) => {
      const limits = m.textLimits
        ? ` limits:{${Object.entries(m.textLimits)
            .map(([k, v]) => `${k}<=${v}`)
            .join(",")}}`
        : "";
      return `- ${m.id} [${m.category}] roles:${m.roles.join("|")} assets:${m.assetSlots}${limits}\n    ${m.purpose}`;
    })
    .join("\n");
}

export const COMPONENT_COUNT = ALL.length;
