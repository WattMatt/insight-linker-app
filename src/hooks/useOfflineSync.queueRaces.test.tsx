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
        return {
          eq: async () => {
            await state.gate.promise;
            // status:'fail' simulates a server rejection → the executor throws → retry.
            return (payload as { status?: string })?.status === 'fail'
              ? { error: { message: 'boom' } }
              : { error: null };
          },
        };
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

  it('does not burn a failed mutation\'s retry budget when new items keep the drain looping (I1)', async () => {
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    seed({ id: 'M', status: 'fail' }); // M will be rejected by the server

    await act(async () => {
      const draining = result.current.processQueue(); // M fails; awaits the gate
      // A new item arrives mid-drain → triggers a coalesced re-pass.
      enqueueOfflineMutation('SYNC_INSPECTION', { id: 'N', fields: { status: 'ok' } }, { dedupeKey: 'N' });
      state.gate.release();
      await draining;
    });

    // M must be attempted EXACTLY ONCE this cycle — not re-attempted in the re-pass.
    const failCalls = state.updateSpy.mock.calls.filter((c) => (c[0] as { status?: string }).status === 'fail');
    expect(failCalls).toHaveLength(1);
    // M survives with retries bumped to 1 (NOT discarded after a burst).
    const queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY)!) as Array<{ data: { id: string }; retries: number }>;
    const m = queue.find((x) => x.data.id === 'M');
    expect(m?.retries).toBe(1);
    // N was synced.
    expect(state.updateSpy.mock.calls.some((c) => (c[0] as { status?: string }).status === 'ok')).toBe(true);
  });

  it('shows syncing state on ALL mounted instances during a drain (I2)', async () => {
    const a = renderHook(() => useOfflineSync(), { wrapper });
    const b = renderHook(() => useOfflineSync(), { wrapper });
    seed({ id: 'A', status: 'a' });

    let draining!: Promise<void>;
    await act(async () => {
      draining = a.result.current.processQueue(); // A holds the lock, suspended at the gate
    });

    // Both instances reflect the in-flight drain, not just the lock holder.
    expect(a.result.current.isSyncing).toBe(true);
    expect(b.result.current.isSyncing).toBe(true);

    await act(async () => {
      state.gate.release();
      await draining;
    });

    expect(a.result.current.isSyncing).toBe(false);
    expect(b.result.current.isSyncing).toBe(false);
  });
});
