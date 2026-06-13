import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { offlineInspectionDB, type CachedInspection } from './offlineInspectionDB';

// C2/H13 was flagged by the sweep as "pending changes get evicted" — REFUTED.
// evictOldInspections already filters out pending_changes. This locks that in so a
// future change can't silently start evicting unsynced edits (real data loss).
function makeCached(id: string, cachedAt: string, pending: boolean): CachedInspection {
  return {
    id,
    title: id,
    status: 'Draft',
    inspection_date: null,
    site_id: 's1',
    subsection_id: null,
    inspector_name: null,
    json_data: {},
    template: null,
    template_id: null,
    template_category: null,
    site_data: null,
    subsection_data: null,
    cached_at: cachedAt,
    last_modified: cachedAt,
    synced: !pending,
    pending_changes: pending,
  };
}

describe('evictOldInspections — never evicts pending changes (C2/H13 lock-in)', () => {
  it('keeps an OLD pending inspection, evicts only old synced ones', async () => {
    await offlineInspectionDB.cacheInspection(makeCached('recent', '2026-06-13T12:00:00Z', false));
    await offlineInspectionDB.cacheInspection(makeCached('old-pending', '2026-06-01T00:00:00Z', true));
    await offlineInspectionDB.cacheInspection(makeCached('old-synced', '2026-05-01T00:00:00Z', false));

    const evicted = await offlineInspectionDB.evictOldInspections(1);

    expect(evicted).toBe(1); // only old-synced is eligible
    expect(await offlineInspectionDB.getCachedInspection('recent')).toBeTruthy();
    expect(await offlineInspectionDB.getCachedInspection('old-pending')).toBeTruthy(); // protected despite age
    expect(await offlineInspectionDB.getCachedInspection('old-synced')).toBeNull();
  });
});
