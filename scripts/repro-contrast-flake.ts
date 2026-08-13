/**
 * Reproduces and characterises the intermittent contrast-gate failure on
 * `test/acceptance/examples.test.ts`'s "assembled" example.
 *
 * Not a flaky test to silence — `docs/GAP-ANALYSIS.md`'s 2026-08-05 entry
 * (working order item 8, last bullet) already root-caused one mechanism:
 * `composed-figure` only paints ink where it actually draws marks
 * (`figureInk`), so a `size: "huge"` decorative part leaves parts of its own
 * box unpainted, and text placed near/over that unevenness can land on a
 * region the tone field correctly reports as busier than the ink choice
 * assumed.
 *
 * Run on 2026-08-13 (40 samples): 13-28% failure rate across two runs — the
 * doc's own "1 in 5-8" estimate holds, but the failures don't all match the
 * composed-figure theory. `layered-depth-stack` failures do (facts/action/
 * who — elements plausibly near the figure). `banded-masthead` failures hit
 * "message" (the headline) instead, which the composed-figure-adjacency
 * theory doesn't explain — headline placement in that topology's recipe has
 * no obvious relationship to the figure's ink map. That suggests a second,
 * broader mechanism: possibly a general small mismatch between how ink is
 * chosen and how the mechanical gate measures tone, not exclusive to
 * composed-figure. Not root-caused further than that — this script exists
 * so the next pass can gather more samples/geometry dumps instead of
 * re-deriving the repro from scratch.
 *
 *   npx tsx scripts/repro-contrast-flake.ts
 */
import { buildServer } from "../src/api/server.js";
import { config } from "../src/config.js";
import { COMPOSITION_EXAMPLE_ASSEMBLED } from "../src/api/agent.js";

const app = buildServer();
await app.ready();
const auth = { authorization: `Bearer ${config.apiKeys[0]}` };

async function lineageFor(fitsDensity: readonly string[], elementCount: number) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/studio/assignments",
      headers: auth,
      payload: { runs: 3 },
    });
    for (const assignment of res.json().assignments) {
      const density = assignment.direction.artDirection.density;
      const requires = assignment.direction.gesture.requiresComponent ?? null;
      const budget = { quiet: [4, 5], balanced: [5, 6], rich: [6, 7] }[density as "quiet" | "balanced" | "rich"]!;
      const fits = fitsDensity.includes(density) && elementCount >= budget[0]! && elementCount <= budget[1]! && !requires;
      if (fits) return assignment.lineage;
    }
  }
  throw new Error("no fit");
}

const total = Number(process.argv[2]) || 40;
let fails = 0;
for (let i = 0; i < total; i++) {
  const lineage = await lineageFor(["balanced", "rich"], COMPOSITION_EXAMPLE_ASSEMBLED.elements.length);
  const res = await app.inject({
    method: "POST",
    url: "/v1/flyers/compose",
    headers: auth,
    payload: { ...COMPOSITION_EXAMPLE_ASSEMBLED, lineage },
  });
  const body = res.json();
  if (!body.codeCheckedGates?.mechanical?.contrast) {
    fails++;
    console.log(
      `FAIL #${fails} (topology: ${lineage.topology}, material: ${lineage.material}, artDirection: ${lineage.artDirection}):`,
    );
    console.log(`  notes: ${JSON.stringify(body.notes)}`);
  }
}
console.log(`\n${fails}/${total} failed (${((fails / total) * 100).toFixed(0)}%)`);
await app.close();
