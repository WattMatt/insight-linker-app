import { describe, expect, it, vi } from "vitest";
import { adminResetPassword, type AdminResetDeps, type AdminResetUser } from "./adminReset.ts";

const ALICE: AdminResetUser = { id: "u-alice", email: "alice@example.com", user_metadata: { full_name: "Alice A", role: "Client" } };

function deps(overrides: Partial<AdminResetDeps> = {}) {
  const d = {
    findUserByEmail: vi.fn(async (email: string) => (email === "alice@example.com" ? ALICE : undefined)),
    sendResetCode: vi.fn(async () => ({ error: null })),
    setTemporaryPassword: vi.fn(async () => ({ error: null })),
    emailTemporaryPassword: vi.fn(async () => {}),
    recordEvent: vi.fn(async () => {}),
    ...overrides,
  };
  return d as typeof d & AdminResetDeps;
}

const PASSWORD = "Abcdefgh2345!@#$";

describe("adminResetPassword — shared", () => {
  it("finds the account whatever case or spacing the admin's address has", async () => {
    const d = deps();
    await adminResetPassword({ email: "  Alice@Example.COM ", method: "email_code", actorId: "admin-1" }, d);
    expect(d.findUserByEmail).toHaveBeenCalledWith("alice@example.com");
    expect(d.sendResetCode).toHaveBeenCalledWith("alice@example.com");
  });

  it("refuses an address with no account and sends nothing", async () => {
    const d = deps();
    await expect(
      adminResetPassword({ email: "bob@example.com", method: "email_code", actorId: "admin-1" }, d),
    ).rejects.toThrow("No account exists for bob@example.com");
    expect(d.sendResetCode).not.toHaveBeenCalled();
    expect(d.setTemporaryPassword).not.toHaveBeenCalled();
  });

  it("rejects an unknown method before doing anything", async () => {
    const d = deps();
    await expect(
      adminResetPassword({ email: "alice@example.com", method: "magic" as never, actorId: "admin-1" }, d),
    ).rejects.toThrow('Unknown reset method "magic"');
    expect(d.findUserByEmail).not.toHaveBeenCalled();
  });
});

describe("adminResetPassword — email a reset code", () => {
  it("sends Supabase's code email and records who asked", async () => {
    const d = deps();
    const { message } = await adminResetPassword({ email: "alice@example.com", method: "email_code", actorId: "admin-1" }, d);
    expect(message).toMatch(/Reset code emailed to alice@example.com/);
    expect(d.recordEvent).toHaveBeenCalledWith("u-alice", { method: "recovery", reason: "admin_email_code", actor_id: "admin-1" });
    expect(d.setTemporaryPassword).not.toHaveBeenCalled();
  });

  it("explains the 60-second limit instead of reporting success", async () => {
    const d = deps({
      sendResetCode: vi.fn(async () => ({
        error: { code: "over_email_send_rate_limit", status: 429, message: "For security purposes, you can only request this after 37 seconds." },
      })),
    });
    await expect(
      adminResetPassword({ email: "alice@example.com", method: "email_code", actorId: "admin-1" }, d),
    ).rejects.toThrow(/less than a minute ago.*try again in 37 seconds/);
    expect(d.recordEvent).toHaveBeenCalledWith("u-alice", expect.objectContaining({ reason: "admin_email_code_failed", error_code: "over_email_send_rate_limit" }));
  });

  it("reports any other send failure with its reference", async () => {
    const d = deps({ sendResetCode: vi.fn(async () => ({ error: { status: 500, message: "Error sending recovery email" } })) });
    await expect(
      adminResetPassword({ email: "alice@example.com", method: "email_code", actorId: "admin-1" }, d),
    ).rejects.toThrow("was not sent: Error sending recovery email (ref: http_500)");
  });
});

describe("adminResetPassword — email a temporary password", () => {
  it("sets the password, emails it with the user's name, and records it", async () => {
    const d = deps();
    const { message } = await adminResetPassword(
      { email: "alice@example.com", method: "temporary_password", temporaryPassword: PASSWORD, actorId: "admin-1" },
      d,
    );
    expect(d.setTemporaryPassword).toHaveBeenCalledWith(ALICE, PASSWORD);
    expect(d.emailTemporaryPassword).toHaveBeenCalledWith({ email: "alice@example.com", fullName: "Alice A", password: PASSWORD });
    expect(d.recordEvent).toHaveBeenCalledWith("u-alice", { method: "recovery", reason: "admin_temp_password", actor_id: "admin-1" });
    expect(message).not.toContain(PASSWORD);
  });

  it("refuses a short password without touching the account", async () => {
    const d = deps();
    await expect(
      adminResetPassword({ email: "alice@example.com", method: "temporary_password", temporaryPassword: "Welcome1", actorId: "a" }, d),
    ).rejects.toThrow(/at least 12 characters\. Nothing was changed/);
    expect(d.setTemporaryPassword).not.toHaveBeenCalled();
  });

  it("stops — and says nothing changed — when Supabase rejects the password", async () => {
    // The old path logged this as a warning and told the admin it had worked.
    const d = deps({
      setTemporaryPassword: vi.fn(async () => ({ error: { code: "weak_password", status: 422, message: "Password is known to be weak" } })),
    });
    await expect(
      adminResetPassword({ email: "alice@example.com", method: "temporary_password", temporaryPassword: PASSWORD, actorId: "a" }, d),
    ).rejects.toThrow("Supabase rejected the temporary password: Password is known to be weak (ref: weak_password). Nothing was changed");
    expect(d.emailTemporaryPassword).not.toHaveBeenCalled();
  });

  it("says the password WAS changed when only the email fails", async () => {
    const d = deps({ emailTemporaryPassword: vi.fn(async () => { throw new Error("Resend 503"); }) });
    await expect(
      adminResetPassword({ email: "alice@example.com", method: "temporary_password", temporaryPassword: PASSWORD, actorId: "a" }, d),
    ).rejects.toThrow("The password WAS changed, but the email to alice@example.com failed: Resend 503");
    expect(d.recordEvent).toHaveBeenCalledWith("u-alice", expect.objectContaining({ reason: "admin_temp_password_email_failed" }));
  });
});
