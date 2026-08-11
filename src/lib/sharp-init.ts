/**
 * Applies sharp/libvips memory tuning as a process-startup side effect.
 *
 * `sharp` is a singleton module — calling `sharp.cache()`/`sharp.concurrency()`
 * anywhere configures every `sharp(...)` call in the process, regardless of
 * which file constructed it. Import this module once, for its side effect,
 * before any image work happens — `src/api/server.ts` does so first thing.
 *
 * Why this exists: Render's memory-limit alert traced (by process of
 * elimination — every module-level cache in this codebase is either fixed-size
 * or correctly capped) to sharp's own native cache and thread pool, which had
 * never been tuned and were left at sharp's aggressive-by-default settings.
 * See `src/config.ts`'s `sharpCacheMb`/`sharpConcurrency` for the knobs.
 */
import sharp from "sharp";
import { config } from "../config.js";

if (config.sharpCacheMb > 0) {
  sharp.cache({ memory: config.sharpCacheMb });
} else {
  sharp.cache(false);
}
sharp.concurrency(config.sharpConcurrency);
