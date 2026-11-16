/**
 * Runtime cache names. next.config.mjs (plain JS, read by Next before TS) repeats
 * these literally; cacheNames.contract.test.ts fails if the two drift.
 *
 * The `-v2` names replaced the originals on 2026-11-13: renaming starts every device
 * on empty, bounded caches, and the janitor deletes the old names outright.
 */
export const IMAGE_CACHE = 'supabase-images-v2';
export const API_CACHE = 'supabase-api-cache-v2';

/** Caches whose every entry must carry a workbox-expiration record. */
export const MANAGED_RUNTIME_CACHES = [IMAGE_CACHE, API_CACHE] as const;

/** Old names, deleted on sight. */
export const RETIRED_RUNTIME_CACHES = ['supabase-images', 'supabase-api-cache'] as const;
