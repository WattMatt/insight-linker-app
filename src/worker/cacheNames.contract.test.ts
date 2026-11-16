import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { MANAGED_RUNTIME_CACHES, RETIRED_RUNTIME_CACHES } from './cacheNames';

// next.config.mjs cannot import TS, so the runtime cache names live in two places.
// If they drift, the janitor treats the real caches as unmanaged (never cleaned) or
// deletes a live cache as "retired" on every activation.
const config = readFileSync(path.resolve(__dirname, '../../next.config.mjs'), 'utf8');
const configured = [...config.matchAll(/cacheName:\s*"([^"]+)"/g)].map((m) => m[1]);

describe('runtime cache names', () => {
  it('every managed cache is configured in next.config.mjs', () => {
    for (const name of MANAGED_RUNTIME_CACHES) expect(configured).toContain(name);
  });

  it('no retired name is still configured', () => {
    for (const name of RETIRED_RUNTIME_CACHES) expect(configured).not.toContain(name);
  });

  it('every supabase runtime cache is managed by the janitor', () => {
    const supabase = configured.filter((n) => n.startsWith('supabase-'));
    expect(supabase.sort()).toEqual([...MANAGED_RUNTIME_CACHES].sort());
  });
});
