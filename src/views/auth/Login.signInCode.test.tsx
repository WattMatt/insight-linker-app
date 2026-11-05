/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

// Login's "Sign-in code" tab with only Supabase, the router shim, captcha,
// toasts and the audit call stubbed. The sign-in email is code-only; these are
// the same failure modes the reset screen had.
const { state } = vi.hoisted(() => ({
  state: {
    search: "",
    sendResult: { error: null } as { error: unknown },
    verifyResult: { data: { session: null, user: null }, error: null } as { data: { session: unknown; user: unknown }; error: unknown },
    navigate: vi.fn(),
    redirectByRole: vi.fn(async () => {}),
    events: [] as Array<{ type: string; metadata: Record<string, unknown>; email?: string }>,
    verifyCalls: [] as unknown[],
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      signInWithOtp: () => Promise.resolve(state.sendResult),
      verifyOtp: (args: unknown) => {
        state.verifyCalls.push(args);
        return Promise.resolve(state.verifyResult);
      },
    },
  },
}));
vi.mock("@/lib/navigation", () => ({
  useNavigate: () => state.navigate,
  useSearchParams: () => [new URLSearchParams(state.search), () => {}],
}));
vi.mock("@/views/auth/useRoleRedirect", () => ({ useRoleRedirect: () => ({ redirectByRole: state.redirectByRole }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("@/components/CaptchaTurnstile", () => ({ CAPTCHA_ENABLED: false, CaptchaTurnstile: () => null }));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock("@/lib/auth-audit", () => ({
  recordAuthEvent: (type: string, metadata: Record<string, unknown> = {}, options: { email?: string } = {}) =>
    state.events.push({ type, metadata, email: options.email }),
}));
vi.mock("@/views/auth/AuthLayout", () => ({
  AuthLayout: ({ subtitle, children }: { subtitle: string; children: ReactNode }) =>
    createElement("main", null, createElement("h1", null, subtitle), children),
}));

import Login from "./Login";

async function requestCode(address: string) {
  fireEvent.click(screen.getByRole("button", { name: "Sign-in code" }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
}

beforeEach(() => {
  state.search = "";
  state.sendResult = { error: null };
  state.verifyResult = { data: { session: null, user: null }, error: null };
  state.navigate = vi.fn();
  state.redirectByRole = vi.fn(async () => {});
  state.events = [];
  state.verifyCalls = [];
});

describe("Login — sign-in code", () => {
  it("opens straight on the code screen from the email's button (?mode=code)", () => {
    state.search = "mode=code";
    render(createElement(Login));
    expect(screen.getByLabelText("Verification Code")).toBeTruthy();
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("moves to the code screen, says only the latest code works, holds resend for 60s, and records who asked", async () => {
    render(createElement(Login));
    await requestCode(" Someone@Example.com");

    expect(await screen.findByText(/Only the code in the most recent email works/, undefined, { timeout: 3000 })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Send a new code \(\d+s\)/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(state.events).toContainEqual({
      type: "magic_link_requested",
      metadata: { method: "magic_link", reason: "sent" },
      email: "someone@example.com",
    });
  }, 10_000);

  it("shows a refused send instead of claiming an email is on its way", async () => {
    state.sendResult = { error: { status: 500, code: "unexpected_failure", message: "Error sending magic link email" } };
    render(createElement(Login));
    await requestCode("someone@example.com");

    const alert = await screen.findByRole("alert", undefined, { timeout: 3000 });
    expect(alert.textContent).toBe("The email couldn't be sent: Error sending magic link email (ref: unexpected_failure)");
    expect(screen.getByRole("button", { name: "Send Code" })).toBeTruthy();
  }, 10_000);

  it("treats the 60-second limit as 'use the code you already have'", async () => {
    state.sendResult = {
      error: { status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 30 seconds." },
    };
    render(createElement(Login));
    await requestCode("someone@example.com");

    expect(await screen.findByText(/A code was sent less than a minute ago/, undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send a new code \((29|30)s\)/ })).toBeTruthy();
  }, 10_000);

  it("explains a rejected code and records it against the typed email", async () => {
    state.search = "mode=code";
    state.verifyResult = {
      data: { session: null, user: null },
      error: { status: 403, code: "otp_expired", message: "Token has expired or is invalid" },
    };
    render(createElement(Login));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "someone@example.com" } });
    fireEvent.change(screen.getByLabelText("Verification Code"), { target: { value: "123 456" } });
    expect((screen.getByLabelText("Verification Code") as HTMLInputElement).value).toBe("123456");
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign In" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/mistyped, already used, or replaced by a newer email/);
    expect(alert.textContent).toContain("(ref: otp_expired)");
    expect(state.events).toContainEqual({
      type: "magic_link_requested",
      metadata: { method: "magic_link", reason: "code_rejected", error_code: "otp_expired" },
      email: "someone@example.com",
    });
  });

  it("signs in with an accepted code", async () => {
    state.search = "mode=code";
    state.verifyResult = { data: { session: { access_token: "x" }, user: { id: "u1", user_metadata: {} } }, error: null };
    render(createElement(Login));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "Someone@Example.com" } });
    fireEvent.change(screen.getByLabelText("Verification Code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & Sign In" }));

    await waitFor(() => expect(state.redirectByRole).toHaveBeenCalledWith("u1"));
    expect(state.verifyCalls[0]).toEqual({ email: "someone@example.com", token: "654321", type: "email" });
  });
});
