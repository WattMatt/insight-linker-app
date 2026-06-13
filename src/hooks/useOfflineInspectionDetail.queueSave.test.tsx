/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOfflineInspectionDetail } from './useOfflineInspectionDetail';
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
});
