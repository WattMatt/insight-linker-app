/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { setOnline } from '@/test/online';
import { OFFLINE_QUEUE_KEY } from '@/lib/offlineQueue';

// Capture supabase.from('inspections').update(payload).eq('id', id) so we can assert
// the FULL record syncs. serverState.json_data is what select() returns — lets us
// simulate a photo already committed to the server by an earlier drain.
const { updateSpy, eqSpy, serverState } = vi.hoisted(() => ({
  updateSpy: vi.fn(),
  eqSpy: vi.fn(),
  serverState: { json_data: undefined as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        updateSpy(payload);
        return {
          eq: (col: string, val: string) => {
            eqSpy(col, val);
            return Promise.resolve({ error: null });
          },
        };
      },
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { json_data: serverState.json_data }, error: null }),
        }),
      }),
    }),
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
  },
}));

import { useOfflineSync } from './useOfflineSync';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

function seed(mutation: Record<string, unknown>) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify([mutation]));
}

describe('useOfflineSync — SYNC_INSPECTION applies the full record (C3/H10)', () => {
  beforeEach(() => {
    setOnline(true);
    localStorage.clear();
    updateSpy.mockClear();
    eqSpy.mockClear();
    serverState.json_data = undefined;
  });

  it('syncs ALL columns from a full-record offline save, not just json_data', async () => {
    const fields = {
      status: 'Completed',
      quality_rating: 5,
      project_name: 'Acme',
      json_data: { sectionA: { item1: { notes: 'ok' } } },
    };
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    seed({ id: 'm1', type: 'SYNC_INSPECTION', data: { id: 'insp-1', fields }, timestamp: 1, retries: 0 });

    await act(async () => {
      await result.current.processQueue();
    });

    // Every field must reach Supabase — otherwise an offline "mark complete" silently
    // drops status/quality_rating on sync (the C3/H10 data-loss bug).
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const payload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject(fields);
    expect(payload).toHaveProperty('updated_at');
    expect(eqSpy).toHaveBeenCalledWith('id', 'insp-1');
    expect(JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!)).toHaveLength(0);
  });

  it('still supports the legacy { id, json_data } shape', async () => {
    const json_data = { s: { i: { notes: 'legacy' } } };
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    seed({ id: 'm2', type: 'SYNC_INSPECTION', data: { id: 'insp-2', json_data }, timestamp: 1, retries: 0 });

    await act(async () => {
      await result.current.processQueue();
    });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][0]).toMatchObject({ json_data });
  });

  it('does NOT clobber a photo already committed to the server in an earlier drain (C-1)', async () => {
    // Server already has a photo from a prior reconnect's UPLOAD_INSPECTION_IMAGE.
    serverState.json_data = { sectionA: { item1: { photos: ['https://srv/p1.jpg'] } } };

    // The offline full-save snapshot does NOT include that photo.
    const fields = {
      status: 'Completed',
      json_data: { sectionA: { item1: { photos: [], notes: 'edited offline' } } },
    };
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    seed({ id: 'm3', type: 'SYNC_INSPECTION', data: { id: 'insp-3', fields }, timestamp: 1, retries: 0 });

    await act(async () => {
      await result.current.processQueue();
    });

    const payload = updateSpy.mock.calls[0][0] as { json_data: { sectionA: { item1: { photos: string[]; notes: string } } }; status: string };
    // The server photo survives; the offline edit is preserved; the status syncs.
    expect(payload.json_data.sectionA.item1.photos).toEqual(['https://srv/p1.jpg']);
    expect(payload.json_data.sectionA.item1.notes).toBe('edited offline');
    expect(payload.status).toBe('Completed');
  });
});
