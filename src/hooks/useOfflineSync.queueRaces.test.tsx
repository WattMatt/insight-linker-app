/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { setOnline } from '@/test/online';
import { OFFLINE_QUEUE_KEY, enqueueOfflineMutation } from '@/lib/offlineQueue';

// A controllable gate so a mutation's server write can be held mid-drain, giving us a
// window to enqueue during the drain and to fire concurrent drains.
function makeGate() {
  let release!: () => void;
  const promise = new Promise<void>((r) => { release = r; });
  return { promise, release };
}
const { state } = vi.hoisted(() => ({
  state: { updateSpy: null as unknown as ReturnType<typeof vi.fn>, gate: null as unknown as { promise: Promise<void>; release: () => void } },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      update: (payload: unknown) => {
        state.updateSpy(payload);
        return { eq: async () => { await state.gate.promise; return { error: null }; } };
      },
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { json_data: {} }, error: null }) }) }),
    }),
    storage: { from: () => ({ upload: vi.fn(), getPublicUrl: vi.fn() }) },
  },
}));

import { useOfflineSync } from './useOfflineSync';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

function seed(...mutations: Array<{ id: string; status: string }>) {
  localStorage.setItem(
    OFFLINE_QUEUE_KEY,
    JSON.stringify(
      mutations.map((m) => ({
        id: m.id,
        type: 'SYNC_INSPECTION',
        data: { id: m.id, fields: { status: m.status } }, // no json_data → skips the server-merge read
        timestamp: 1,
        retries: 0,
      })),
    ),
  );
}

describe('useOfflineSync — queue race safety (Phase 2)', () => {
  beforeEach(() => {
    setOnline(true);
    localStorage.clear();
    state.updateSpy = vi.fn();
    state.gate = makeGate();
  });

  it('does NOT lose a mutation enqueued DURING a drain (no clobber by saveQueue)', async () => {
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    seed({ id: 'A', status: 'a' }); // seed AFTER mount so the mount-effect drain is a no-op

    await act(async () => {
      const draining = result.current.processQueue(); // starts; A's write awaits the gate
      // Enqueue B while A is still in flight (fires offline-queue-updated → drain is locked).
      enqueueOfflineMutation('SYNC_INSPECTION', { id: 'B', fields: { status: 'b' } }, { dedupeKey: 'B' });
      state.gate.release(); // let A (and then B) complete
      await draining;
    });

    // Both A and B must have been written — B must not have been clobbered out of the queue.
    const statuses = state.updateSpy.mock.calls.map((c) => (c[0] as { status: string }).status);
    expect(statuses).toContain('a');
    expect(statuses).toContain('b');
    // Queue fully drained.
    expect(JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!)).toHaveLength(0);
  });

  it('does not double-process when two drains race (synchronous lock)', async () => {
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    seed({ id: 'A', status: 'a' }); // seed AFTER mount so the mount-effect drain is a no-op

    await act(async () => {
      const d1 = result.current.processQueue();
      const d2 = result.current.processQueue(); // concurrent — must coalesce, not double-drain
      state.gate.release();
      await Promise.all([d1, d2]);
    });

    const statuses = state.updateSpy.mock.calls.map((c) => (c[0] as { status: string }).status);
    expect(statuses.filter((s) => s === 'a')).toHaveLength(1); // A processed exactly once
  });

  it('updates queueSize immediately when a mutation is enqueued (even offline)', async () => {
    setOnline(false);
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    expect(result.current.queueSize).toBe(0);

    await act(async () => {
      enqueueOfflineMutation('SYNC_INSPECTION', { id: 'X', fields: { status: 'x' } }, { dedupeKey: 'X' });
    });

    expect(result.current.queueSize).toBe(1);
  });
});
