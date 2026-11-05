/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";

const { state } = vi.hoisted(() => ({
  state: {
    calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    reply: { data: null as unknown, error: null as { message: string } | null },
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args });
      return Promise.resolve(state.reply);
    },
  },
}));

import { SignInHistoryDialog } from "./SignInHistoryDialog";

function renderDialog() {
  return render(
    createElement(SignInHistoryDialog, {
      user: { id: "u-1", email: "stuck@example.com", full_name: "Stuck User" },
      open: true,
      onOpenChange: () => {},
    }),
  );
}

beforeEach(() => {
  state.calls = [];
  state.reply = {
    data: {
      account: {
        email: "stuck@example.com",
        created_at: "2026-08-01T08:00:00Z",
        invited_at: "2026-08-01T08:00:00Z",
        email_confirmed_at: "2026-08-01T08:05:00Z",
        last_sign_in_at: "2026-08-01T08:05:00Z",
        recovery_sent_at: null,
        has_password: false,
        requires_password_change: false,
        banned_until: null,
      },
      events: [
        { at: "2026-11-05T11:10:00Z", source: "reported", kind: "password_reset_requested", detail: { reason: "code_rejected", error_code: "otp_expired" }, ip: "41.0.0.9" },
        { at: "2026-11-05T11:00:00Z", source: "supabase", kind: "user_recovery_requested", detail: {}, ip: null },
      ],
    },
    error: null,
  };
});

describe("SignInHistoryDialog", () => {
  it("asks the admin-only function for this user's history", async () => {
    renderDialog();
    await screen.findAllByTestId("history-event");
    expect(state.calls).toEqual([{ fn: "admin_user_sign_in_history", args: { p_user_id: "u-1", p_limit: 200 } }]);
  });

  it("leads with why they can't sign in", async () => {
    renderDialog();
    const warning = await screen.findByRole("status");
    expect(warning.textContent).toMatch(/No password has ever been set, but they have signed in before/);
  });

  it("lists the timeline with plain-language titles and sources", async () => {
    renderDialog();
    const rows = await screen.findAllByTestId("history-event");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Reset code rejected");
    expect(rows[0].textContent).toContain("Reported by sign-in page");
    expect(rows[0].textContent).toContain("ref: otp_expired");
    expect(rows[1].textContent).toContain("Password reset email sent");
    expect(rows[1].textContent).toContain("Supabase");
  });

  it("shows the function's refusal instead of an empty history", async () => {
    state.reply = { data: null, error: { message: "Only admins can view sign-in history" } };
    renderDialog();
    expect((await screen.findByRole("alert")).textContent).toContain("Only admins can view sign-in history");
    expect(screen.queryAllByTestId("history-event")).toHaveLength(0);
  });
});
