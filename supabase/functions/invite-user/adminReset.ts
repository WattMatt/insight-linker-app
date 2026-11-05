/**
 * Admin-assisted password reset — the two explicit actions behind the admin
 * "Reset Password" dialog (docs/AUTH_PASSWORD_REVIEW_2026-10-29.md, RC-4).
 *
 * The old dialog did two different things behind one button, and both could
 * fail silently: a typed temporary password that Supabase rejected was still
 * reported as "reset successfully", and leaving it blank sent a code email the
 * user had no screen for. It also rewrote the user's role and assignments.
 *
 * Here each action does exactly one thing, never touches roles or
 * assignments, and either succeeds or throws an Error whose message is shown
 * to the admin as-is.
 *
 * Pure apart from the injected deps, so it runs under vitest as well as Deno.
 */

export type AdminResetMethod = 'email_code' | 'temporary_password';

export interface AdminResetUser {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

export interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
}

export interface AdminResetDeps {
  findUserByEmail(email: string): Promise<AdminResetUser | undefined>;
  /** Supabase's own recovery email (the code-only template). */
  sendResetCode(email: string): Promise<{ error: AuthErrorLike | null }>;
  /** Set the password and flag requires_password_change. */
  setTemporaryPassword(user: AdminResetUser, password: string): Promise<{ error: AuthErrorLike | null }>;
  /** Branded email carrying the temporary password. Throws on failure. */
  emailTemporaryPassword(params: { email: string; fullName: string; password: string }): Promise<void>;
  /** Best-effort audit row tied to the user. Must not throw. */
  recordEvent(userId: string, metadata: Record<string, string>): Promise<void>;
}

export interface AdminResetInput {
  email: string;
  method: AdminResetMethod;
  temporaryPassword?: string;
  actorId: string;
}

/** Shortest temporary password accepted. The admin UI generates 16 characters. */
export const MIN_TEMPORARY_PASSWORD_LENGTH = 12;

export function normalizeEmail(email: string | undefined | null): string {
  return (email ?? '').trim().toLowerCase();
}

function refFor(error: AuthErrorLike): string {
  return error.code || (error.status ? `http_${error.status}` : 'unknown');
}

export async function adminResetPassword(
  input: AdminResetInput,
  deps: AdminResetDeps,
): Promise<{ message: string }> {
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error('No email address was supplied for the reset.');
  }
  if (input.method !== 'email_code' && input.method !== 'temporary_password') {
    throw new Error(`Unknown reset method "${String(input.method)}".`);
  }

  const user = await deps.findUserByEmail(email);
  if (!user) {
    throw new Error(`No account exists for ${email}. Use Invite User to create one.`);
  }

  if (input.method === 'email_code') {
    const { error } = await deps.sendResetCode(email);
    if (error) {
      const ref = refFor(error);
      await deps.recordEvent(user.id, {
        method: 'recovery',
        reason: 'admin_email_code_failed',
        error_code: ref,
        actor_id: input.actorId,
      });
      const wait = /after (\d+) seconds?/i.exec(error.message ?? '');
      if (wait || error.code === 'over_email_send_rate_limit') {
        throw new Error(
          `A reset code was emailed to ${email} less than a minute ago, and that code is still the valid one. Ask them to use it, or try again in ${wait ? wait[1] : 60} seconds.`,
        );
      }
      throw new Error(`The reset email to ${email} was not sent: ${error.message ?? 'unknown error'} (ref: ${ref}).`);
    }
    await deps.recordEvent(user.id, { method: 'recovery', reason: 'admin_email_code', actor_id: input.actorId });
    return {
      message: `Reset code emailed to ${email}. They open the email's "Enter your code" button (or Forgot password on the sign-in page) and type the code. It works for 1 hour; sending another cancels it.`,
    };
  }

  const password = input.temporaryPassword ?? '';
  if (password.length < MIN_TEMPORARY_PASSWORD_LENGTH) {
    throw new Error(
      `The temporary password must be at least ${MIN_TEMPORARY_PASSWORD_LENGTH} characters. Nothing was changed.`,
    );
  }

  const { error: setError } = await deps.setTemporaryPassword(user, password);
  if (setError) {
    const ref = refFor(setError);
    await deps.recordEvent(user.id, {
      method: 'recovery',
      reason: 'admin_temp_password_rejected',
      error_code: ref,
      actor_id: input.actorId,
    });
    throw new Error(
      `Supabase rejected the temporary password: ${setError.message ?? 'unknown error'} (ref: ${ref}). Nothing was changed - try again.`,
    );
  }

  const fullName = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
  try {
    await deps.emailTemporaryPassword({ email, fullName, password });
  } catch (err) {
    await deps.recordEvent(user.id, {
      method: 'recovery',
      reason: 'admin_temp_password_email_failed',
      actor_id: input.actorId,
    });
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `The password WAS changed, but the email to ${email} failed: ${detail}. Use "Email a temporary password" again to send a new one.`,
    );
  }

  await deps.recordEvent(user.id, { method: 'recovery', reason: 'admin_temp_password', actor_id: input.actorId });
  return {
    message: `A temporary password was emailed to ${email}. They must choose their own password the first time they sign in.`,
  };
}
