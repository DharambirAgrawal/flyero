/**
 * Decoration element ids.
 *
 * Two constraints, both learned the hard way:
 *
 * 1. **Positional, never counter-based.** A module-level `let n = 0` would drift
 *    between two `renderSpec` calls in the same process and break byte-identical
 *    output. The index into the decoration array is the only source of
 *    uniqueness.
 *
 * 2. **Never name a `<path>` after text.** `checkEditability`
 *    (`src/core/export/index.ts:54`) fails any export containing a `<path>`
 *    whose id matches `headline|copy|text|label`. The guide path an arched
 *    headline is set along is exactly the thing one would naturally call
 *    `…-textpath`, and doing so would fail every export. Guides are called
 *    `-guide`.
 */

/** Reserved words that would trip the editability check if used in a path id. */
const FORBIDDEN = /(headline|copy|text|label)/i;

export function decorId(index: number, kind: string): string {
  const id = `d${index}-${kind}`;
  if (FORBIDDEN.test(id)) {
    throw new Error(
      `Decoration id "${id}" contains a word that fails checkEditability; ` +
        `name path guides "-guide" instead.`,
    );
  }
  return id;
}

/** Id for a `<pattern>` belonging to decoration `index`. */
export const patternId = (index: number, kind: string): string => `${decorId(index, kind)}-pat`;

/** Id for an invisible path that text is set along. Never "-textpath". */
export const guideId = (index: number, kind: string): string => `${decorId(index, kind)}-guide`;

/** Ground-level ids live in their own namespace so they cannot collide. */
export const groundId = (kind: string): string => `ground-${kind}`;
