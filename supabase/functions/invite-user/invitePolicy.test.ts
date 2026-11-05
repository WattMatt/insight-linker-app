import { describe, expect, it } from "vitest";
import { assertInviteCredentials } from "./invitePolicy.ts";

describe("assertInviteCredentials", () => {
  it("accepts an emailed, generated-length temporary password", () => {
    expect(() => assertInviteCredentials({ deliverByEmail: true, temporaryPassword: "Abcdefgh2345!@#$" })).not.toThrow();
  });

  it("refuses the retired single-use link invite (no password)", () => {
    expect(() => assertInviteCredentials({})).toThrow(/Invite links are no longer sent/);
    expect(() => assertInviteCredentials({ deliverByEmail: true })).toThrow(/Invite links are no longer sent/);
  });

  it("refuses the retired 'show the password to the admin' invite", () => {
    expect(() => assertInviteCredentials({ temporaryPassword: "Abcdefgh2345!@#$" })).toThrow(/must email a generated temporary password/);
  });

  it("refuses a short, typed password before anything changes", () => {
    expect(() => assertInviteCredentials({ deliverByEmail: true, temporaryPassword: "Welcome1" })).toThrow(
      /at least 12 characters\. Nothing was changed/,
    );
  });
});
