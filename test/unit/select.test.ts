import { describe, expect, it } from "vitest";
import { fixtureLineages, fixtureSpec } from "../fixtures.js";
import { selectPassingCandidate } from "../../src/core/select/index.js";
import type { GateResult } from "../../src/core/gates/index.js";

const cleanGates = (notes: string[] = []): GateResult => ({
  passed: true,
  detail: { G1: true, G2: true, G3: true, G4: true, G5: true, G6: true },
  mechanical: {
    overflow: true,
    contrast: true,
    margins: true,
    ctaPresent: true,
    assetsUsedOrReported: true,
    bannedListClear: true,
    coverage: true,
    noCollisions: true,
  },
  notes,
  bannedHits: [],
  unusedAssets: [],
  visualReview: "model",
});

const ctx = { jobId: null, apiKey: "test", stage: "select" };

describe("comparative winner selection", () => {
  it("returns the only passing candidate without spending a jury call", async () => {
    const spec = fixtureSpec(fixtureLineages("select-one", 1)[0]!);
    const decision = await selectPassingCandidate(
      [{ spec, png: Buffer.alloc(0), gates: cleanGates(), revisions: 1 }],
      ctx,
      false,
    );
    expect(decision.index).toBe(0);
    expect(decision.method).toBe("single-passer");
  });

  it("falls back deterministically to the least revised clean passer", async () => {
    const specs = fixtureLineages("select-many", 3).map(fixtureSpec);
    const decision = await selectPassingCandidate(
      [
        { spec: specs[0]!, png: Buffer.alloc(0), gates: cleanGates(), revisions: 2 },
        { spec: specs[1]!, png: Buffer.alloc(0), gates: cleanGates(["unused asset"]), revisions: 0 },
        { spec: specs[2]!, png: Buffer.alloc(0), gates: cleanGates(), revisions: 0 },
      ],
      ctx,
      false,
    );
    expect(decision.index).toBe(2);
    expect(decision.method).toBe("deterministic-fallback");
  });
});
