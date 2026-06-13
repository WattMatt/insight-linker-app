/**
 * @vitest-environment jsdom
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useOfflineSync } from './useOfflineSync';
import { setOnline } from '@/test/online';

// Harness smoke test for layer (b): renders the REAL useOfflineSync hook under jsdom
// (react-query provider + fake-indexeddb) and drives navigator.onLine. This is the
// exact path behind the "stuck on Offline" bug (PR #20) — proof the harness can now
// execute the offline runtime surface, not just pure logic.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useOfflineSync — online/offline state (jsdom harness smoke)', () => {
  beforeEach(() => {
    setOnline(true);
    localStorage.clear();
  });

  it('reads navigator.onLine on mount', () => {
    setOnline(true);
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    expect(result.current.isOnline).toBe(true);
  });

  it('flips to offline when the offline event fires', () => {
    setOnline(true);
    const { result } = renderHook(() => useOfflineSync(), { wrapper });
    expect(result.current.isOnline).toBe(true);

    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current.isOnline).toBe(false);

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current.isOnline).toBe(true);
  });
});
