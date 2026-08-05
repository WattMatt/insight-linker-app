/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Deep-URL bounce: on a hard load of /client-portal/...?preview=<id>, the role
// query is disabled until getSession supplies a userId. A disabled query
// reports isLoading=false while its data is still undefined, so the guard fell
// through to `userRole !== "Client"` and sent admins to /dashboard. The guard
// must treat isPending (which covers the disabled phase) as "still loading".

const mockRole = vi.fn();
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => mockRole() }));
vi.mock("@/components/auth/useAuthSession", () => ({
  useAuthSession: () => ({ session: { user: { id: "admin-1" } }, isLoading: false }),
}));
vi.mock("@/components/auth/useOnboardingStatus", () => ({
  useOnboardingStatus: () => ({ data: undefined, refetch: () => {} }),
}));
vi.mock("@/components/auth/AuthLoading", () => ({
  AuthLoading: () => <div data-testid="auth-loading" />,
}));
vi.mock("@/components/auth/OnboardingGate", () => ({
  OnboardingGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/navigation", () => ({
  Navigate: ({ to }: { to: string }) => <div data-testid="navigate">{to}</div>,
  useSearchParams: () => [new URLSearchParams("preview=client-1"), () => {}],
  useLocation: () => ({ pathname: "/client-portal", search: "?preview=client-1" }),
}));

import ClientProtectedRoute from "./ClientProtectedRoute";

describe("ClientProtectedRoute — admin preview hard load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading (not /dashboard redirect) while the role query is disabled pre-userId", () => {
    // Disabled query: no data yet, isPending true, isLoading false.
    mockRole.mockReturnValue({ data: undefined, isPending: true, isLoading: false });
    render(
      <ClientProtectedRoute>
        <div data-testid="portal" />
      </ClientProtectedRoute>
    );
    expect(screen.getByTestId("auth-loading")).toBeTruthy();
    expect(screen.queryByTestId("navigate")).toBeNull();
  });

  it("renders the portal once the role resolves to Admin with ?preview set", () => {
    mockRole.mockReturnValue({ data: "Admin", isPending: false, isLoading: false });
    render(
      <ClientProtectedRoute>
        <div data-testid="portal" />
      </ClientProtectedRoute>
    );
    expect(screen.getByTestId("portal")).toBeTruthy();
    expect(screen.queryByTestId("navigate")).toBeNull();
  });

  it("still redirects non-client, non-admin roles to /dashboard once resolved", () => {
    mockRole.mockReturnValue({ data: "Contractor", isPending: false, isLoading: false });
    render(
      <ClientProtectedRoute>
        <div data-testid="portal" />
      </ClientProtectedRoute>
    );
    expect(screen.getByTestId("navigate").textContent).toBe("/dashboard");
  });
});
