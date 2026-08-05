/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Admin preview race: useClientInfo's queryFn branches on the role from a
// SEPARATE query. If it runs before that role resolves it takes the
// normal-client branch (admins have no user_clients row → null) and, with the
// role absent from the queryKey, the null is cached forever — blank client
// name, empty sites. The fix gates the query on the role having settled and
// keys it by role.

const ADMIN_ID = "admin-user-1";
const CLIENT_ID = "eec20f09-6a02-42de-b151-cbe5c7b665c8";
const CLIENT_ROW = {
  id: CLIENT_ID,
  name: "Fortress_Fund",
  logo_url: null,
  company_name: "Fortress Fund",
};

// Deferred so the test controls exactly when the role query resolves —
// reproducing the window where useClientInfo mounts before the role exists.
let resolveRole: (v: { data: { role: string } | null; error: null }) => void;
const rolePromise = new Promise((res) => {
  resolveRole = res as typeof resolveRole;
});

const userClientsQueried = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: ADMIN_ID } } } }),
      getUser: () => Promise.resolve({ data: { user: { id: ADMIN_ID } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
    },
    from: (table: string) => {
      if (table === "user_roles") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => rolePromise }) }),
        };
      }
      if (table === "clients") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: CLIENT_ROW, error: null }),
            }),
          }),
        };
      }
      if (table === "user_clients") {
        userClientsQueried();
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

import { useClientInfo } from "./useUserRole";

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("useClientInfo — admin preview race", () => {
  it("waits for the role, then resolves the previewed client (never caches the client-branch null)", async () => {
    const { result } = renderHook(() => useClientInfo(CLIENT_ID), { wrapper });

    // Role still unresolved → the client-info query must not have produced a
    // result (the old code would have already cached null here).
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(result.current.data).toBeUndefined();

    await act(async () => {
      resolveRole!({ data: { role: "Admin" }, error: null });
    });

    await waitFor(() =>
      expect(result.current.data).toEqual({
        client_id: CLIENT_ID,
        clients: CLIENT_ROW,
        managing_agency_id: null,
        managing_agency_name: null,
      })
    );
    // The admin branch was taken — the normal-client mapping was never hit.
    expect(userClientsQueried).not.toHaveBeenCalled();
  });
});
