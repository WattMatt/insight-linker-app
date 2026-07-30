/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// Characterisation of the role lookup that every route guard branches on. These record
// what the hook returns TODAY for the states the guards handle badly — an absent role
// row, a failed role query, and an unresolved user id — so a later fail-closed rewrite
// has a before/after to point at.
const { auth, roleRow } = vi.hoisted(() => ({
  auth: { session: null as { user: { id: string } } | null, pending: false },
  roleRow: {
    data: null as { role: string } | null,
    error: null as { message: string } | null,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        auth.pending
          ? new Promise(() => {}) // never settles — the id stays unresolved
          : Promise.resolve({ data: { session: auth.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: roleRow.data, error: roleRow.error }),
        }),
      }),
    }),
  },
}));

import { useUserRole } from "./useUserRole";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = "TestQueryProvider";
  return Wrapper;
}

describe("useUserRole", () => {
  beforeEach(() => {
    auth.session = { user: { id: "user-1" } };
    auth.pending = false;
    roleRow.data = null;
    roleRow.error = null;
  });

  it("resolves the role row for a signed-in user", async () => {
    roleRow.data = { role: "Contractor" };
    const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toBe("Contractor"));
    expect(result.current.isLoading).toBe(false);
  });

  it("errors — rather than resolving to no-role — when the user has no role row", async () => {
    // maybeSingle() returns data null, so the queryFn returns `data?.role` === undefined,
    // which react-query rejects ("Query data cannot be undefined"). A role-less account
    // therefore lands in the same end state as a broken query: no data, not loading.
    roleRow.data = null;
    const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("surfaces the error and leaves data undefined when the role query fails", async () => {
    roleRow.error = { message: "permission denied for table user_roles" };
    const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    // A caller gating on isLoading gets a green light with no role in hand.
    expect(result.current.isLoading).toBe(false);
  });

  it("reports isLoading false with no data while the user id is still unresolved", async () => {
    // enabled: !!userId — before getSession settles the query is disabled, so it is
    // pending-but-not-fetching and isLoading reads false even though no role is known.
    auth.pending = true;
    const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper() });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("keeps the query disabled when there is no session at all", async () => {
    auth.session = null;
    const { result } = renderHook(() => useUserRole(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });
});
