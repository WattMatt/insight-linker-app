/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  clearRecoveryMark,
  describeCodeError,
  describeSendError,
  isRecoverySession,
  markRecoverySession,
} from "./recoveryFlow";

function tokenWith(payload: unknown): string {
  const b64url = (v: unknown) =>
    btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256" })}.${b64url(payload)}.sig`;
}

// What Supabase actually issued on 2026-11-05 for a reset completed by typing
// the code: amr "otp" — indistinguishable from a magic-link sign-in.
const codeResetSession = (sessionId = "sess-reset") => ({
  access_token: tokenWith({ sub: "u1", session_id: sessionId, aal: "aal1", amr: [{ method: "otp", timestamp: 1 }] }),
});

afterEach(() => clearRecoveryMark());

describe("isRecoverySession", () => {
  it("does not treat an amr 'otp' session as a reset on the token alone", () => {
    expect(isRecoverySession(codeResetSession())).toBe(false);
  });

  it("is true for the session marked when its reset code was accepted", () => {
    const session = codeResetSession();
    markRecoverySession(session);
    expect(isRecoverySession(session)).toBe(true);
  });

  it("stops being true for a new session (the password sign-in after the reset)", () => {
    markRecoverySession(codeResetSession("sess-reset"));
    expect(isRecoverySession(codeResetSession("sess-after-password-sign-in"))).toBe(false);
  });

  it("stops being true once the mark is cleared", () => {
    const session = codeResetSession();
    markRecoverySession(session);
    clearRecoveryMark();
    expect(isRecoverySession(session)).toBe(false);
  });

  it("ignores a mark when the token has no session_id", () => {
    markRecoverySession({ access_token: tokenWith({ amr: [{ method: "otp" }] }) });
    expect(isRecoverySession({ access_token: tokenWith({ amr: [{ method: "otp" }] }) })).toBe(false);
  });

  it("still accepts an amr 'recovery' token (link verification)", () => {
    expect(isRecoverySession({ access_token: tokenWith({ amr: [{ method: "recovery" }] }) })).toBe(true);
  });

  it("is false for no session, a password session, or a malformed token", () => {
    expect(isRecoverySession(null)).toBe(false);
    expect(isRecoverySession({ access_token: tokenWith({ session_id: "s", amr: [{ method: "password" }] }) })).toBe(false);
    expect(isRecoverySession({ access_token: "not-a-jwt" })).toBe(false);
    expect(isRecoverySession({ access_token: "a.%%%.c" })).toBe(false);
  });
});

describe("describeCodeError", () => {
  it("does not call every rejected code 'expired'", () => {
    const d = describeCodeError({ code: "otp_expired", status: 403, message: "Token has expired or is invalid" });
    expect(d.ref).toBe("otp_expired");
    expect(d.message).toMatch(/mistyped, already used, or replaced/);
    expect(d.message).toMatch(/most recent email/);
  });

  it("recognises the Supabase message even without an error code", () => {
    expect(describeCodeError({ message: "Token has expired or is invalid" }).message).toMatch(/isn't valid any more/);
  });

  it("separates network failures and rate limits", () => {
    expect(describeCodeError({ name: "AuthRetryableFetchError", status: 0 }).message).toMatch(/couldn't reach the server/);
    expect(describeCodeError({ status: 429, code: "over_request_rate_limit" }).message).toMatch(/Too many attempts/);
  });

  it("passes other errors through with a reference", () => {
    const d = describeCodeError({ status: 500, message: "boom" });
    expect(d).toEqual({ ref: "http_500", message: "The code couldn't be checked: boom" });
  });
});

describe("describeSendError", () => {
  it("reads the wait time out of Supabase's 60-second limit", () => {
    const d = describeSendError({
      code: "over_email_send_rate_limit",
      status: 429,
      message: "For security purposes, you can only request this after 42 seconds.",
    });
    expect(d.retryAfterSeconds).toBe(42);
    expect(d.message).toMatch(/Use the code in that email/);
  });

  it("falls back to the full cooldown when no seconds are given", () => {
    expect(describeSendError({ code: "over_email_send_rate_limit" }).retryAfterSeconds).toBe(60);
  });

  it("reports SMTP and other failures as 'not sent'", () => {
    const d = describeSendError({ status: 500, code: "unexpected_failure", message: "Error sending recovery email" });
    expect(d.ref).toBe("unexpected_failure");
    expect(d.message).toBe("The email couldn't be sent: Error sending recovery email");
  });
});
