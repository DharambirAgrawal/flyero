// Single source of truth for the color-filter palette shared by every
// provider that supports recoloring or native color search (svgrepo,
// coloricons, undraw, shapes, qrcode, pixabay, unsplash, pexels).
export const COLOR_FILTERS = [
  { id: "red", hex: "ef4444", label: "Red" },
  { id: "orange", hex: "f97316", label: "Orange" },
  { id: "yellow", hex: "facc15", label: "Yellow" },
  { id: "green", hex: "22c55e", label: "Green" },
  { id: "blue", hex: "3b82f6", label: "Blue" },
  { id: "purple", hex: "a855f7", label: "Purple" },
  { id: "pink", hex: "ec4899", label: "Pink" },
  { id: "brown", hex: "92400e", label: "Brown" },
  { id: "black", hex: "000000", label: "Black" },
  { id: "gray", hex: "6b7280", label: "Gray" },
  { id: "white", hex: "ffffff", label: "White" },
] as const;

export type ColorFilterId = (typeof COLOR_FILTERS)[number]["id"];

export const COLOR_HEX: Record<ColorFilterId, string> = Object.fromEntries(
  COLOR_FILTERS.map((c) => [c.id, c.hex]),
) as Record<ColorFilterId, string>;

// Extra synonyms that map onto a canonical ColorFilterId.
export const COLOR_SYNONYMS: Record<string, ColorFilterId> = {
  grey: "gray",
  gold: "yellow",
  amber: "orange",
  cyan: "blue",
  emerald: "green",
  indigo: "purple",
  violet: "purple",
  rose: "pink",
  teal: "green",
};

export function resolveColorKeyword(word: string): ColorFilterId | undefined {
  if ((COLOR_HEX as Record<string, string>)[word]) return word as ColorFilterId;
  return COLOR_SYNONYMS[word];
}
