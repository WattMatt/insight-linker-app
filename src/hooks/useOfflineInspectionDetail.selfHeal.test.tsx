/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOfflineInspectionDetail } from './useOfflineInspectionDetail';
import { setOnline } from '@/test/online';

// H14: this hook tracked online state from navigator.onLine but, unlike useOfflineSync
// (PR #20), only updated on 'online'/'offline' transition events — so a value that was
// stale at mount or a missed transition (service-worker swap, tab wake) left the offline
// indicator stuck. The self-heal re-reads on mount, focus/visibility, and an interval.
describe('useOfflineInspectionDetail — online self-heal (H14)', () => {
  beforeEach(() => setOnline(true));

  it('reads online on mount', () => {
    const { result } = renderHook(() => useOfflineInspectionDetail({ inspectionId: 'i1', autoCache: false }));
    expect(result.current.isOnline).toBe(true);
  });

  it('flips offline/online on transition events', () => {
    const { result } = renderHook(() => useOfflineInspectionDetail({ inspectionId: 'i1', autoCache: false }));
    act(() => { setOnline(false); window.dispatchEvent(new Event('offline')); });
    expect(result.current.isOnline).toBe(false);
    act(() => { setOnline(true); window.dispatchEvent(new Event('online')); });
    expect(result.current.isOnline).toBe(true);
  });

  it('self-heals a MISSED transition on focus (the stuck-indicator bug)', () => {
    const { result } = renderHook(() => useOfflineInspectionDetail({ inspectionId: 'i1', autoCache: false }));
    expect(result.current.isOnline).toBe(true);
    // Connectivity drops but NO 'offline' event fires. The old code stayed stuck on true.
    act(() => { setOnline(false); window.dispatchEvent(new Event('focus')); });
    expect(result.current.isOnline).toBe(false);
  });
});
