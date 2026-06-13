/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOfflineInspectionDetail } from './useOfflineInspectionDetail';
import { offlineInspectionDB, type CachedInspection } from '@/lib/offlineInspectionDB';
import { setOnline } from '@/test/online';
import { OFFLINE_QUEUE_KEY } from '@/lib/offlineQueue';

// C3/H10: the real Save button must persist the WHOLE record offline, not just
// json_data. queueFullInspectionSave is the testable seam handleSave routes through
// when offline. (The component wiring is thin; the executor that consumes this is
// covered by useOfflineSync.syncInspection.test.tsx.)
describe('useOfflineInspectionDetail.queueFullInspectionSave (C3/H10)', () => {
  beforeEach(() => {
    setOnline(false);
    localStorage.clear();
  });

  it('enqueues a full-record SYNC_INSPECTION carrying all fields', async () => {
    const { result } = renderHook(() =>
      useOfflineInspectionDetail({ inspectionId: 'insp-9', autoCache: false })
    );

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.queueFullInspectionSave({
        status: 'Completed',
        quality_rating: 4,
        json_data: { a: 1 },
      });
    });

    expect(ok).toBe(true);
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!);
    expect(q).toHaveLength(1);
    expect(q[0]).toMatchObject({
      type: 'SYNC_INSPECTION',
      data: { id: 'insp-9', fields: { status: 'Completed', quality_rating: 4, json_data: { a: 1 } } },
    });
  });

  it('dedupes repeated offline saves to one pending push per inspection', async () => {
    const { result } = renderHook(() =>
      useOfflineInspectionDetail({ inspectionId: 'insp-9', autoCache: false })
    );

    await act(async () => {
      await result.current.queueFullInspectionSave({ status: 'Draft', json_data: { v: 1 } });
      await result.current.queueFullInspectionSave({ status: 'Completed', json_data: { v: 2 } });
    });

    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!);
    expect(q).toHaveLength(1);
    expect(q[0].data.fields.json_data.v).toBe(2);
    expect(q[0].data.fields.status).toBe('Completed');
  });

  it('reflects the saved status + quality_rating in the cache so an offline reload sticks (I-1/I-2)', async () => {
    // Inspection cached while online, Draft, no rating.
    const base: CachedInspection = {
      id: 'insp-cache', title: 't', status: 'Draft', quality_rating: null,
      inspection_date: null, site_id: 's1', subsection_id: null, inspector_name: null,
      json_data: {}, template: null, template_id: null, template_category: null,
      site_data: null, subsection_data: null, cached_at: '2026-06-13T00:00:00Z',
      last_modified: '2026-06-13T00:00:00Z', synced: true, pending_changes: false,
    };
    await offlineInspectionDB.cacheInspection(base);

    const { result } = renderHook(() =>
      useOfflineInspectionDetail({ inspectionId: 'insp-cache', autoCache: false })
    );

    await act(async () => {
      await result.current.queueFullInspectionSave({
        status: 'Completed',
        quality_rating: 5,
        json_data: { edited: true },
      });
    });

    const cached = await offlineInspectionDB.getCachedInspection('insp-cache');
    expect(cached?.status).toBe('Completed');
    expect(cached?.quality_rating).toBe(5);
    expect(cached?.pending_changes).toBe(true);
    expect(cached?.json_data).toEqual({ edited: true });
  });
});
