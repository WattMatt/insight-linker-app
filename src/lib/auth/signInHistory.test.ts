import { describe, expect, it } from "vitest";
import { accountWarnings, describeEvent, type HistoryAccount } from "./signInHistory";

const at = "2026-11-05T11:00:00Z";

describe("describeEvent", () => {
  it("names Supabase actions and credits the admin who acted", () => {
    expect(describeEvent({ at, source: "supabase", kind: "user_recovery_requested" })).toEqual({
      title: "Password reset email sent",
      notes: [],
      problem: false,
    });
    expect(
      describeEvent({ at, source: "supabase", kind: "user_modified", detail: { by_admin: true, actor_email: "admin@example.com" } }),
    ).toMatchObject({ title: "Account changed", notes: ["by admin@example.com"] });
  });

  it("falls back to a readable form of an unknown action", () => {
    expect(describeEvent({ at, source: "supabase", kind: "some_new_action" }).title).toBe("some new action");
  });

  it("flags a rejected code as a problem and keeps its ref", () => {
    expect(
      describeEvent({ at, source: "reported", kind: "password_reset_requested", detail: { reason: "code_rejected", error_code: "otp_expired" } }),
    ).toEqual({ title: "Reset code rejected", notes: ["ref: otp_expired"], problem: true });
  });

  it("describes admin actions with the admin's id", () => {
    const d = describeEvent({
      at,
      source: "app",
      kind: "password_reset_requested",
      detail: { reason: "admin_email_code", actor_id: "02847fd1-0cd1-42a7-b5d0-10122b74828e" },
    });
    expect(d).toEqual({ title: "Admin emailed a reset code", notes: ["admin id 02847fd1…"], problem: false });
  });

  it("says how a sign-in happened", () => {
    expect(describeEvent({ at, source: "app", kind: "login", detail: { method: "recovery" } }).title).toBe(
      "Signed in with a reset code",
    );
  });

  it("marks a failed re-sign-in after a password change as a problem", () => {
    expect(describeEvent({ at, source: "app", kind: "password_changed", detail: { reason: "resignin_failed" } }).problem).toBe(true);
  });
});

const base: HistoryAccount = {
  email: "a@example.com",
  created_at: at,
  invited_at: null,
  email_confirmed_at: at,
  last_sign_in_at: at,
  recovery_sent_at: null,
  has_password: true,
  requires_password_change: false,
  banned_until: null,
};

describe("accountWarnings", () => {
  it("is empty for a healthy account", () => {
    expect(accountWarnings(base)).toEqual([]);
  });

  it("spots the old-invite-link victim: signed in once, never set a password", () => {
    expect(accountWarnings({ ...base, has_password: false })[0]).toMatch(/No password has ever been set, but they have signed in before/);
  });

  it("lists a block, the forced change and an unconfirmed email", () => {
    const w = accountWarnings(
      { ...base, banned_until: "2099-01-01T00:00:00Z", requires_password_change: true, email_confirmed_at: null },
      new Date("2026-11-05T12:00:00Z"),
    );
    expect(w[0]).toMatch(/blocked until/);
    expect(w).toContain("Must choose a new password at their next sign-in.");
    expect(w).toContain("Email address not confirmed.");
  });

  it("ignores a ban that has already expired", () => {
    expect(accountWarnings({ ...base, banned_until: "2020-01-01T00:00:00Z" })).toEqual([]);
  });
});
