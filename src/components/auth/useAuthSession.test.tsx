/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// H19/H20: if the session can't be read, the guard must fail CLOSED (treat as signed out
// → redirect to login), never leave the app stuck on the auth loader (isLoading true).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.reject(new Error("network down")),
    },
  },
}));

import { useAuthSession } from "./useAuthSession";

describe("useAuthSession — fail closed (H19/H20)", () => {
  it("resolves to no-session, not-loading when getSession rejects", async () => {
    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toBeNull();
  });
});
