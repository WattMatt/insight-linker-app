/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

// The access-control chain end to end: the real useAuthSession → useUserRole →
// useOnboardingStatus → ProtectedRoute, with only the Supabase client and the
// Next router shim stubbed.
// Cases where the guard admits a user it arguably should not are named "…today" —
// they record current behaviour so an inversion to a positive allowlist has proof.
const { auth, roleRow, onboardingRow } = vi.hoisted(() => ({
  auth: {
    session: null as {
      user: { id: string; user_metadata?: Record<string, unknown> };
    } | null,
    pending: false,
  },
  roleRow: {
    data: null as { role: string } | null,
    error: null as { message: string } | null,
    gate: null as Promise<void> | null,
  },
  onboardingRow: {
    data: null as { onboarding_completed: boolean } | null,
    error: null as { message: string; code?: string } | null,
    inserted: [] as unknown[],
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () =>
        auth.pending
          ? new Promise(() => {})
          : Promise.resolve({ data: { session: auth.session } }),
      getUser: () => Promise.resolve({ data: { user: auth.session?.user ?? null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    // auth-audit (used by the onboarding self-heal) fires log-auth-event.
    functions: { invoke: () => Promise.resolve({ data: { success: true }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          // user_roles
          maybeSingle: async () => {
            if (roleRow.gate) await roleRow.gate;
            return { data: roleRow.data, error: roleRow.error };
          },
          // profiles (onboarding status)
          single: () =>
            Promise.resolve(
              onboardingRow.error
                ? { data: null, error: onboardingRow.error }
                : { data: onboardingRow.data, error: null },
            ),
        }),
      }),
      // profiles self-heal INSERT (missing-row failure mode, STANDARD D4)
      insert: (row: unknown) => {
        onboardingRow.inserted.push(row);
        return Promise.resolve({ error: null });
      },
    }),
  },
}));

// The real module wraps next/navigation, which needs an App Router runtime. Render the
// redirect target instead so the guard's routing decision is directly assertable.
vi.mock("@/lib/navigation", async () => {
  const { createElement: h } = await import("react");
  return {
    Navigate: ({ to }: { to: string }) => h("div", { "data-testid": "redirect" }, to),
    useLocation: () => ({
      pathname: "/dashboard",
      search: "?tab=open",
      hash: "",
      state: null,
      key: "default",
    }),
  };
});

import ProtectedRoute from "./ProtectedRoute";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = "TestQueryProvider";
  return Wrapper;
}

function renderGuard() {
  return render(
    createElement(
      ProtectedRoute,
      null,
      createElement("div", { "data-testid": "protected-content" }, "PROTECTED"),
    ),
    { wrapper: makeWrapper() },
  );
}

// Flush the session + role promise chains and the renders they schedule.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const redirectTarget = () => screen.queryByTestId("redirect")?.textContent ?? null;
const contentShown = () => screen.queryByTestId("protected-content") !== null;
const loaderShown = () => screen.queryByText("Loading...") !== null;

// Wait until the guard has stopped loading and has actually made a routing decision.
const waitForDecision = () => waitFor(() => expect(loaderShown()).toBe(false));

describe("ProtectedRoute", () => {
  beforeEach(() => {
    auth.session = { user: { id: "user-1" } };
    auth.pending = false;
    roleRow.data = { role: "Admin" };
    roleRow.error = null;
    roleRow.gate = null;
    onboardingRow.data = { onboarding_completed: true };
    onboardingRow.error = null;
    onboardingRow.inserted = [];
  });

  it("shows the auth loader while the session is still resolving", async () => {
    auth.pending = true;
    renderGuard();
    await settle();

    expect(loaderShown()).toBe(true);
    expect(contentShown()).toBe(false);
    expect(redirectTarget()).toBeNull();
  });

  it("redirects a signed-out visitor to login carrying the requested path as ?next", async () => {
    auth.session = null;
    renderGuard();
    await waitForDecision();

    expect(redirectTarget()).toBe("/auth/login?next=%2Fdashboard%3Ftab%3Dopen");
    expect(contentShown()).toBe(false);
  });

  it("renders the protected content for an Admin", async () => {
    roleRow.data = { role: "Admin" };
    renderGuard();
    await waitForDecision();

    expect(contentShown()).toBe(true);
    expect(redirectTarget()).toBeNull();
  });

  it("sends a Contractor to the contractor portal", async () => {
    roleRow.data = { role: "Contractor" };
    renderGuard();
    await waitForDecision();

    expect(redirectTarget()).toBe("/contractor");
    expect(contentShown()).toBe(false);
  });

  it("sends a Client to the client portal", async () => {
    roleRow.data = { role: "Client" };
    renderGuard();
    await waitForDecision();

    expect(redirectTarget()).toBe("/client-portal");
    expect(contentShown()).toBe(false);
  });

  it("holds on the loader while the role query is still in flight", async () => {
    let release!: () => void;
    roleRow.gate = new Promise<void>((r) => { release = r; });
    renderGuard();
    // Twice: the first flush resolves the session, so anything still loading after the
    // second is the role query alone.
    await settle();
    await settle();

    expect(loaderShown()).toBe(true);
    expect(contentShown()).toBe(false);

    roleRow.gate = null;
    await act(async () => { release(); });

    await waitFor(() => expect(contentShown()).toBe(true));
  });

  it("redirects a user who must change their password to /auth/set-password", async () => {
    auth.session = {
      user: { id: "user-1", user_metadata: { requires_password_change: true } },
    };
    renderGuard();
    await waitForDecision();

    expect(redirectTarget()).toBe("/auth/set-password");
    expect(contentShown()).toBe(false);
  });

  it("redirects an un-onboarded user to the dedicated /onboarding route", async () => {
    onboardingRow.data = { onboarding_completed: false };
    renderGuard();

    await waitFor(() => expect(redirectTarget()).toBe("/onboarding"));
    expect(contentShown()).toBe(false);
  });

  it("does not redirect to /onboarding when the status lookup errors (fail safe)", async () => {
    onboardingRow.error = { message: "permission denied for table profiles", code: "42501" };
    renderGuard();
    await waitForDecision();
    await settle();

    expect(contentShown()).toBe(true);
    expect(redirectTarget()).toBeNull();
  });

  it("self-heals a missing profiles row (PGRST116) and routes into onboarding", async () => {
    onboardingRow.data = null;
    onboardingRow.error = { message: "JSON object requested, 0 rows returned", code: "PGRST116" };
    renderGuard();

    await waitFor(() => expect(redirectTarget()).toBe("/onboarding"));
    expect(onboardingRow.inserted).toEqual([{ id: "user-1", email: "" }]);
    expect(contentShown()).toBe(false);
  });

  it("admits a signed-in user with NO user_roles row into the protected shell today", async () => {
    roleRow.data = null;
    renderGuard();
    await waitForDecision();

    expect(contentShown()).toBe(true);
    expect(redirectTarget()).toBeNull();
  });

  it("admits a signed-in user whose role lookup errored into the protected shell today", async () => {
    roleRow.error = { message: "permission denied for table user_roles" };
    renderGuard();
    await waitForDecision();

    expect(contentShown()).toBe(true);
    expect(redirectTarget()).toBeNull();
  });

  it("admits an unrecognised role into the protected shell today", async () => {
    // Only "Contractor" and "Client" are excluded; anything else falls through.
    roleRow.data = { role: "Visitor" };
    renderGuard();
    await waitForDecision();

    expect(contentShown()).toBe(true);
    expect(redirectTarget()).toBeNull();
  });
});
