/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";

// The real ForgotPassword screen with only Supabase, the router shim, the
// captcha widget, toasts and the audit call stubbed. Each case is one of the
// failure modes from docs/AUTH_PASSWORD_REVIEW_2026-10-29.md.
const { state } = vi.hoisted(() => ({
  state: {
    search: "",
    sendResult: { error: null } as { error: unknown },
    verifyResult: { data: { session: null }, error: null } as { data: { session: unknown }; error: unknown },
    navigate: vi.fn(),
    events: [] as Array<{ type: string; metadata: Record<string, unknown> }>,
    verifyCalls: [] as unknown[],
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: () => Promise.resolve(state.sendResult),
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
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children),
}));
vi.mock("@/components/CaptchaTurnstile", () => ({
  CAPTCHA_ENABLED: false,
  CaptchaTurnstile: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));
vi.mock("@/lib/auth-audit", () => ({
  recordAuthEvent: (type: string, metadata: Record<string, unknown> = {}) => state.events.push({ type, metadata }),
}));
vi.mock("@/views/auth/AuthLayout", () => ({
  AuthLayout: ({ subtitle, children }: { subtitle: string; children: ReactNode }) =>
    createElement("main", null, createElement("h1", null, subtitle), children),
}));

import ForgotPassword from "./ForgotPassword";

async function submitEmail(address: string) {
  fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: address } });
  fireEvent.click(screen.getByRole("button", { name: "Send Code" }));
}

beforeEach(() => {
  state.search = "";
  state.sendResult = { error: null };
  state.verifyResult = { data: { session: null }, error: null };
  state.navigate = vi.fn();
  state.events = [];
  state.verifyCalls = [];
});

describe("ForgotPassword — sending the code", () => {
  it("moves to the code screen, says only the latest code works, and holds resend for 60s", async () => {
    render(createElement(ForgotPassword));
    await submitEmail("Someone@Example.com ");

    expect(await screen.findByText(/Only the code in the most recent email works/, undefined, { timeout: 3000 })).toBeTruthy();
    expect((screen.getByLabelText("Email Address") as HTMLInputElement).value).toBe("someone@example.com");
    const resend = screen.getByRole("button", { name: /Send a new code \(\d+s\)/ }) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);
    expect(state.events).toContainEqual({ type: "password_reset_requested", metadata: { method: "recovery", reason: "sent" } });
  }, 10_000);

  it("shows a refused send instead of claiming an email is on its way", async () => {
    state.sendResult = { error: { status: 500, code: "unexpected_failure", message: "Error sending recovery email" } };
    render(createElement(ForgotPassword));
    await submitEmail("someone@example.com");

    const alert = await screen.findByRole("alert", undefined, { timeout: 3000 });
    expect(alert.textContent).toContain("The email couldn't be sent: Error sending recovery email (ref: unexpected_failure)");
    expect(screen.getByRole("button", { name: "Send Code" })).toBeTruthy(); // still on the email step
    expect(state.events[0].metadata).toMatchObject({ reason: "send_failed", error_code: "unexpected_failure" });
  }, 10_000);

  it("treats the 60-second limit as 'use the code you already have', not a dead end", async () => {
    state.sendResult = {
      error: { status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 42 seconds." },
    };
    render(createElement(ForgotPassword));
    await submitEmail("someone@example.com");

    expect(await screen.findByText(/A code was sent less than a minute ago/, undefined, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send a new code \(4[12]s\)/ })).toBeTruthy();
  }, 10_000);
});

describe("ForgotPassword — entering the code", () => {
  it("opens straight on the code screen from the email's button (?step=code)", () => {
    state.search = "step=code";
    render(createElement(ForgotPassword));
    expect(screen.getByLabelText("Verification Code")).toBeTruthy();
    expect(screen.getByLabelText("Email Address")).toBeTruthy();
  });

  it("keeps a pasted '123 456' instead of truncating it", () => {
    state.search = "step=code";
    render(createElement(ForgotPassword));
    const input = screen.getByLabelText("Verification Code") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "123 456" } });
    expect(input.value).toBe("123456");
  });

  it("explains a rejected code instead of always saying 'Code expired'", async () => {
    state.search = "step=code";
    state.verifyResult = {
      data: { session: null },
      error: { status: 403, code: "otp_expired", message: "Token has expired or is invalid" },
    };
    render(createElement(ForgotPassword));
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: "someone@example.com" } });
    fireEvent.change(screen.getByLabelText("Verification Code"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/mistyped, already used, or replaced by a newer email/);
    expect(alert.textContent).toContain("(ref: otp_expired)");
    expect(alert.textContent).not.toMatch(/^Code expired/);
    expect(state.events).toContainEqual({
      type: "password_reset_requested",
      metadata: { method: "recovery", reason: "code_rejected", error_code: "otp_expired" },
    });
    expect(state.navigate).not.toHaveBeenCalled();
  });

  it("verifies against the normalised email and goes to the new-password screen", async () => {
    state.search = "step=code";
    state.verifyResult = { data: { session: { access_token: "x" } }, error: null };
    render(createElement(ForgotPassword));
    fireEvent.change(screen.getByLabelText("Email Address"), { target: { value: " Someone@Example.com" } });
    fireEvent.change(screen.getByLabelText("Verification Code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));

    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith("/auth/reset-password"));
    expect(state.verifyCalls[0]).toEqual({ email: "someone@example.com", token: "654321", type: "recovery" });
    expect(state.events).toContainEqual({ type: "login", metadata: { method: "recovery" } });
  });
});
