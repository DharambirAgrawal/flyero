import { describe, expect, it } from "vitest";
import { search, type SearchDocument } from "../../src/lib/search.js";

const DOCS: SearchDocument[] = [
  {
    id: "cake",
    fields: [
      { text: "cake", weight: 3 },
      { text: "Sketched two-tier cake with three lit candles", weight: 2 },
      { text: "celebration", weight: 1 },
    ],
  },
  {
    id: "party-hat",
    fields: [
      { text: "party-hat", weight: 3 },
      { text: "Conical party hat, wavy brim, pom-pom tip", weight: 2 },
      { text: "celebration", weight: 1 },
    ],
  },
  {
    id: "leaf",
    fields: [
      { text: "leaf", weight: 3 },
      { text: "Single curved leaf silhouette, pointed tip", weight: 2 },
      { text: "nature", weight: 1 },
    ],
  },
  {
    id: "sun",
    fields: [
      { text: "sun", weight: 3 },
      { text: "Disc plus eight rays", weight: 2 },
      { text: "nature", weight: 1 },
    ],
  },
];

describe("search — BM25 ranking", () => {
  it("ranks an exact id/title match top", () => {
    const hits = search(DOCS, "cake");
    expect(hits[0]?.id).toBe("cake");
  });

  it("matches on a shared category word across multiple documents", () => {
    const hits = search(DOCS, "nature");
    expect(hits.map((h) => h.id).sort()).toEqual(["leaf", "sun"]);
  });

  it("expands a query term through the synonym table", () => {
    // "birthday" appears in no document's text at all — this only passes if
    // the synonym table (birthday -> celebration, party) actually fires.
    const hits = search(DOCS, "birthday");
    expect(hits.map((h) => h.id)).toContain("party-hat");
    expect(hits.map((h) => h.id)).toContain("cake");
  });

  it("returns nothing for a query with no real match", () => {
    expect(search(DOCS, "qwqwqwnomatch")).toEqual([]);
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(search(DOCS, "")).toEqual([]);
    expect(search(DOCS, "   ")).toEqual([]);
  });

  it("respects the limit", () => {
    expect(search(DOCS, "celebration", 1)).toHaveLength(1);
  });

  it("weights an id-field match above a description-only match", () => {
    // "sun" is only in sun's id/title; "eight" only appears in sun's
    // description. Both should surface sun, but the id match should score
    // higher given identical field weights are applied consistently.
    const idHit = search(DOCS, "sun").find((h) => h.id === "sun")!;
    const descHit = search(DOCS, "eight").find((h) => h.id === "sun")!;
    expect(idHit.score).toBeGreaterThan(descHit.score);
  });

  it("never throws on an empty document collection", () => {
    expect(search([], "anything")).toEqual([]);
  });
});
