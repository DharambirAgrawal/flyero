/**
 * In-memory TTL cache for search responses only — never for asset bytes or
 * anything durable. A search is idempotent and cheap to redo, so losing this
 * on restart is fine; that's what makes a plain Map safe here instead of
 * pulling in a cache dependency for what is a 1-hour speed-up.
 */

const TTL_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 500;
const CACHE_VERSION = "v1";

type Entry = { value: object; expires: number };

const cache = new Map<string, Entry>();

export function getCached<T extends object>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    cache.delete(key);
    return undefined;
  }
  // Refresh recency so it survives eviction while still hot (LRU-ish).
  cache.delete(key);
  cache.set(key, entry);
  return entry.value as T;
}

export function setCached<T extends object>(key: string, value: T): void {
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + TTL_MS });
}

export function cacheKey(...parts: (string | number | undefined)[]): string {
  return [CACHE_VERSION, ...parts.filter((p) => p !== undefined && p !== "")].join("::");
}
