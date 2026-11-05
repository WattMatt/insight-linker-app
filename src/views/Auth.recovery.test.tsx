/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";

// A recovery link lands on /auth (allowed redirect) or / (Supabase's Site URL
// fallback). getSession() resolves before the SDK's PASSWORD_RECOVERY event,
// so both pages must route on the session itself — never into the app.
const { state } = vi.hoisted(() => ({
  state: {
    session: null as unknown,
    navigate: vi.fn(),
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: state.session } }),
      // The event never arrives in time — that is the race being guarded.
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { role: "Admin" }, error: null }) }) }),
    }),
  },
}));
vi.mock("@/lib/navigation", () => ({ useNavigate: () => state.navigate }));
vi.mock("@/components/LoadingState", () => ({ LoadingState: () => null }));

import Auth from "./Auth";
import Index from "./Index";

function sessionWithAmr(method: string) {
  const b64url = (v: unknown) =>
    btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return {
    access_token: `${b64url({ alg: "HS256" })}.${b64url({ sub: "u1", amr: [{ method }] })}.sig`,
    user: { id: "u1", user_metadata: {} },
  };
}

beforeEach(() => {
  state.navigate = vi.fn();
  window.history.replaceState({}, "", "/auth");
});

describe("recovery session landing", () => {
  it("/auth sends a recovery session to the new-password screen, not login", async () => {
    state.session = sessionWithAmr("recovery");
    render(createElement(Auth));
    await waitFor(() => expect(state.navigate).toHaveBeenCalled());
    expect(state.navigate).toHaveBeenCalledWith("/auth/reset-password");
    expect(state.navigate).not.toHaveBeenCalledWith("/auth/login");
  });

  it("/auth still sends an ordinary session to login (which redirects by role)", async () => {
    state.session = sessionWithAmr("password");
    render(createElement(Auth));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/auth/login"));
  });

  it("/ sends a recovery session to the new-password screen, not the dashboard", async () => {
    state.session = sessionWithAmr("recovery");
    render(createElement(Index));
    await waitFor(() => expect(state.navigate).toHaveBeenCalled());
    expect(state.navigate).toHaveBeenCalledWith("/auth/reset-password");
    expect(state.navigate).not.toHaveBeenCalledWith("/dashboard");
  });

  it("/ still routes an ordinary admin session to the dashboard", async () => {
    state.session = sessionWithAmr("password");
    render(createElement(Index));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/dashboard"));
  });
});
