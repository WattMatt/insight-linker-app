import { describe, expect, it } from "vitest";
import { describeCodeError, describeSendError, isRecoverySession } from "./recoveryFlow";

function tokenWith(payload: unknown): string {
  const b64url = (v: unknown) =>
    btoa(JSON.stringify(v)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256" })}.${b64url(payload)}.sig`;
}

describe("isRecoverySession", () => {
  it("is true for a session created from a recovery code or link", () => {
    const access_token = tokenWith({ sub: "u1", amr: [{ method: "recovery", timestamp: 1 }] });
    expect(isRecoverySession({ access_token })).toBe(true);
  });

  it("is false for a password or magic-link session", () => {
    expect(isRecoverySession({ access_token: tokenWith({ amr: [{ method: "password" }] }) })).toBe(false);
    expect(isRecoverySession({ access_token: tokenWith({ amr: [{ method: "otp" }] }) })).toBe(false);
  });

  it("is false for no session, no amr, or a malformed token", () => {
    expect(isRecoverySession(null)).toBe(false);
    expect(isRecoverySession({ access_token: tokenWith({ sub: "u1" }) })).toBe(false);
    expect(isRecoverySession({ access_token: "not-a-jwt" })).toBe(false);
    expect(isRecoverySession({ access_token: "a.%%%.c" })).toBe(false);
  });

  it("decodes base64url payloads that need padding and use - or _", () => {
    // A name with characters that encode to '-'/'_' in base64url.
    const access_token = tokenWith({ n: "??>>~~", amr: [{ method: "recovery" }] });
    expect(isRecoverySession({ access_token })).toBe(true);
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
