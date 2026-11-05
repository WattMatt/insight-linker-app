/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// The real useUserRole → AdminOnlyRoute chain, with only Supabase and the
// router shim stubbed. useUserRole's query is DISABLED until getSession()
// supplies the user id; a disabled query reports isLoading=false with no data,
// which the gate used to read as "not an Admin" — bouncing every admin from
// /users to /dashboard on every visit (seen live 2026-11-05).
const { state } = vi.hoisted(() => ({
  state: {
    role: "Admin" as string | null,
    roleError: null as { message: string } | null,
    // Every redirect the gate ever renders. The real router leaves the page
    // on the first one, so a single entry is already a failure for an Admin.
    redirects: [] as string[],
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: "admin-1" } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve(
              state.roleError ? { data: null, error: state.roleError } : { data: state.role ? { role: state.role } : null, error: null },
            ),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/navigation", async () => {
  const { createElement: h } = await import("react");
  return {
    Navigate: ({ to }: { to: string }) => {
      state.redirects.push(to);
      return h("div", { "data-testid": "redirect" }, to);
    },
  };
});

import AdminOnlyRoute from "./AdminOnlyRoute";

function renderGate() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  return render(createElement(AdminOnlyRoute, null, createElement("div", { "data-testid": "page" }, "USERS")), { wrapper });
}

beforeEach(() => {
  state.role = "Admin";
  state.roleError = null;
  state.redirects = [];
});

describe("AdminOnlyRoute", () => {
  it("never redirects before the role is known", () => {
    renderGate();
    // First render: the session hasn't been read yet, so the role query is disabled.
    expect(screen.queryByTestId("redirect")).toBeNull();
  });

  it("lets an Admin through", async () => {
    renderGate();
    expect(await screen.findByTestId("page")).toBeTruthy();
    expect(state.redirects).toEqual([]);
  });

  it("sends a non-Admin to /dashboard", async () => {
    state.role = "User";
    renderGate();
    await waitFor(() => expect(screen.queryByTestId("redirect")?.textContent).toBe("/dashboard"));
    expect(screen.queryByTestId("page")).toBeNull();
  });

  it("fails closed when the role lookup errors", async () => {
    state.roleError = { message: "rls" };
    renderGate();
    await waitFor(() => expect(screen.queryByTestId("redirect")?.textContent).toBe("/dashboard"));
  });
});
