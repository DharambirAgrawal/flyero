/**
 * BM25 — the ranking function real search engines (Elasticsearch, Lucene,
 * Postgres full-text search) use before anything neural gets added on top.
 * Not a placeholder for "real" search; this *is* what "search" means for
 * text matching, and it's what actually explains why one result outranks
 * another (term frequency, document length, how rare/informative a term is
 * across the collection) rather than an ad-hoc points system nobody could
 * predict the behaviour of as the collection grows.
 *
 * Deliberately not embeddings. Two independent reasons, not one excuse:
 * 1. This service already had a production OOM incident on a memory-capped
 *    box (`CHANGELOG.md` 2026-08-10) from an *unrelated* native cache being
 *    left on by default. A local embedding model (the only no-API-key way
 *    to get real semantic search) commonly holds 100-300MB+ once loaded —
 *    adding that blind, on the same box, in the same week that incident was
 *    fixed, is not a responsible trade to make without first knowing it's
 *    needed.
 * 2. It isn't needed yet at this collection size. BM25 already solves the
 *    actual complaint ("normal keyword" matching that can't rank relevance
 *    or handle a multi-word query well) — see `SYNONYMS` below for the
 *    other real gap (a query word that never literally appears in any
 *    description), which is a curated thesaurus problem, not a vector-math
 *    problem, for a domain this size.
 *
 * The seam for real embeddings later is exactly `search()`'s signature
 * (documents in, ranked ids out) — swap the body, not any caller.
 */

export type SearchDocument = {
  id: string;
  /** Weighted text fields — an id match should outrank a tag match. */
  fields: Array<{ text: string; weight: number }>;
};

export type SearchHit = { id: string; score: number };

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "in", "on", "for", "with", "to",
]);

/**
 * Small, hand-curated synonym table for this domain — the actual gap BM25
 * alone doesn't close: a query word ("birthday") that never literally
 * appears in a description ("celebration"). Expand deliberately, not
 * automatically; a bad synonym pollutes every query that touches it.
 */
export const SYNONYMS: Record<string, string[]> = {
  birthday: ["celebration", "party", "cake"],
  party: ["celebration"],
  celebrate: ["celebration"],
  wedding: ["celebration", "flower"],
  anniversary: ["celebration"],
  festive: ["celebration"],
  holiday: ["celebration"],
  plant: ["nature", "leaf"],
  floral: ["flower", "nature"],
  weather: ["nature", "sun", "cloud"],
  talk: ["communication", "speech"],
  chat: ["communication", "speech"],
  message: ["communication", "speech"],
  travel: ["objects", "plane", "suitcase"],
  drink: ["objects", "coffee"],
  food: ["objects", "cake"],
  animal: ["animals"],
  pet: ["animals", "dog", "cat"],
  sport: ["sports"],
  music: ["music", "guitar"],
  work: ["objects", "laptop"],
  home: ["house"],
  fashion: ["fashion"],
  bakery: ["cake", "cupcake", "cookie"],
  coffee: ["coffee-cup"],
  flight: ["plane", "travel"],
  map: ["travel", "pin"],
  ornament: ["flourish", "wreath", "corner"],
  flourish: ["ornament", "scroll"],
  wreath: ["laurel", "ornament"],
  corner: ["flourish", "ornament"],
  frame: ["ornament", "corner"],
  sunburst: ["rays", "poster"],
  background: ["sunburst", "wash", "ornament"],
  botanical: ["leaf", "spray", "wreath"],
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function expandQuery(terms: string[]): string[] {
  const expanded = new Set(terms);
  for (const term of terms) {
    for (const synonym of SYNONYMS[term] ?? []) expanded.add(synonym);
  }
  return [...expanded];
}

const K1 = 1.5;
const B = 0.75;

/**
 * Ranks `documents` against `query` with BM25 over each document's combined,
 * weighted field text. Pure function, re-scores the whole (small) collection
 * on every call — no index to build or keep in sync, which is the right
 * trade for a library of tens to low hundreds of items; see this file's own
 * header for when that stops being true.
 */
export function search(documents: SearchDocument[], query: string, limit = 8): SearchHit[] {
  const queryTerms = expandQuery(tokenize(query));
  if (queryTerms.length === 0 || documents.length === 0) return [];

  // Each document's fields, tokenized once, weight preserved per field so an
  // id-field hit and a tag-field hit don't count as the same evidence.
  const docTokens = documents.map((doc) => ({
    id: doc.id,
    fields: doc.fields.map((f) => ({ tokens: tokenize(f.text), weight: f.weight })),
  }));

  // BM25's document length is the whole document — fields are weighted by
  // repeating higher-weight field tokens `weight` times, so "term frequency"
  // and "document length" both naturally reflect field importance without a
  // separate per-field BM25 pass.
  const expandedDocs = docTokens.map((doc) => ({
    id: doc.id,
    tokens: doc.fields.flatMap((f) => Array(Math.max(1, Math.round(f.weight))).fill(f.tokens).flat()),
  }));

  const avgLen = expandedDocs.reduce((sum, d) => sum + d.tokens.length, 0) / expandedDocs.length || 1;

  const docFreq = new Map<string, number>();
  for (const term of new Set(queryTerms)) {
    let count = 0;
    for (const doc of expandedDocs) if (doc.tokens.includes(term)) count++;
    docFreq.set(term, count);
  }
  const N = expandedDocs.length;
  const idf = (term: string): number => {
    const n = docFreq.get(term) ?? 0;
    return Math.log((N - n + 0.5) / (n + 0.5) + 1);
  };

  const hits: SearchHit[] = expandedDocs.map((doc) => {
    const len = doc.tokens.length || 1;
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.tokens.filter((t) => t === term).length;
      if (tf === 0) continue;
      score += idf(term) * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * len) / avgLen)));
    }
    return { id: doc.id, score };
  });

  return hits
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}
