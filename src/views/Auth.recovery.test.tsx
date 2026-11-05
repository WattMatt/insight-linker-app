/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";

// A session from an accepted reset code must reach /auth/reset-password from
// /auth and from / (Supabase's Site URL fallback), never the app. Tokens here
// are shaped like the live one: a typed reset code gives amr "otp", the same
// as a magic-link sign-in, so only the app's recovery mark tells them apart.
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
import { markRecoverySession } from "@/lib/auth/recoveryFlow";

function sessionWith(method: string, sessionId: string) {
  const b64url = (v: unknown) =>
    btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return {
    access_token: `${b64url({ alg: "HS256" })}.${b64url({ sub: "u1", session_id: sessionId, amr: [{ method }] })}.sig`,
    user: { id: "u1", user_metadata: {} },
  };
}

/** A session from a typed reset code, marked the way ForgotPassword marks it. */
function codeResetSession() {
  const s = sessionWith("otp", "sess-reset");
  markRecoverySession(s);
  return s;
}

beforeEach(() => {
  state.navigate = vi.fn();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/auth");
});

describe("recovery session landing", () => {
  it("/auth sends a code-reset session to the new-password screen, not login", async () => {
    state.session = codeResetSession();
    render(createElement(Auth));
    await waitFor(() => expect(state.navigate).toHaveBeenCalled());
    expect(state.navigate).toHaveBeenCalledWith("/auth/reset-password");
    expect(state.navigate).not.toHaveBeenCalledWith("/auth/login");
  });

  it("/auth still sends an ordinary session to login (which redirects by role)", async () => {
    state.session = sessionWith("password", "sess-normal");
    render(createElement(Auth));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/auth/login"));
  });

  it("/ sends a code-reset session to the new-password screen, not the dashboard", async () => {
    state.session = codeResetSession();
    render(createElement(Index));
    await waitFor(() => expect(state.navigate).toHaveBeenCalled());
    expect(state.navigate).toHaveBeenCalledWith("/auth/reset-password");
    expect(state.navigate).not.toHaveBeenCalledWith("/dashboard");
  });

  it("/ still routes a magic-link (amr otp, unmarked) session to the dashboard", async () => {
    state.session = sessionWith("otp", "sess-magic-link");
    render(createElement(Index));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/dashboard"));
  });

  it("/ routes the password sign-in that follows a reset to the dashboard", async () => {
    codeResetSession();
    state.session = sessionWith("password", "sess-after-reset");
    render(createElement(Index));
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/dashboard"));
  });
});
