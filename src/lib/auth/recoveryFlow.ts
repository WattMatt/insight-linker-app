import type { Session } from "@supabase/supabase-js";

/**
 * Password-recovery helpers shared by the auth screens.
 *
 * Two problems these exist to solve (docs/AUTH_PASSWORD_REVIEW_2026-10-29.md):
 *
 * 1. Recognising a recovery session without a race. The SDK announces a
 *    recovery link through a PASSWORD_RECOVERY event fired on a timer after
 *    getSession() has already resolved, so pages that waited for the event
 *    routed the user to the dashboard first.
 *
 *    The token alone can't say it either: a reset completed by TYPING the code
 *    carries `amr: [{ method: "otp" }]` — the same as a magic-link sign-in
 *    (observed live 2026-11-05). So the app records the intent itself: when a
 *    reset code is accepted it stores that session's `session_id`, and a
 *    session is a recovery session while its id matches. The stored id stops
 *    matching once ResetPassword signs in again with the new password (a new
 *    session) and is cleared there too.
 *
 * 2. Telling the user what actually went wrong. Supabase answers a wrong,
 *    used, superseded AND expired code with one error, `otp_expired`, whose
 *    message contains "expired" — so every failure used to read "Code expired".
 */

/** Seconds Supabase makes a user wait between reset emails (Auth → SMTP max frequency). */
export const RESEND_COOLDOWN_SECONDS = 60;

interface AmrEntry {
  method?: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const RECOVERY_MARK_KEY = "wm_recovery_session_id";

function sessionIdOf(session: Pick<Session, "access_token"> | null | undefined): string | null {
  if (!session?.access_token) return null;
  const id = decodeJwtPayload(session.access_token)?.session_id;
  return typeof id === "string" && id ? id : null;
}

function readMark(): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(RECOVERY_MARK_KEY);
  } catch {
    return null;
  }
}

/**
 * Record that this session came from an accepted reset code or link. Call it
 * the moment the recovery session is established, before navigating.
 */
export function markRecoverySession(session: Pick<Session, "access_token"> | null | undefined): void {
  const id = sessionIdOf(session);
  if (!id) return;
  try {
    window.localStorage.setItem(RECOVERY_MARK_KEY, id);
  } catch {
    /* storage blocked: the direct navigation to /auth/reset-password still happens */
  }
}

/** Forget the recovery mark once the new password is set. */
export function clearRecoveryMark(): void {
  try {
    window.localStorage.removeItem(RECOVERY_MARK_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * True when the session was created by an accepted password-recovery code or
 * link and the new password hasn't been set yet. Such a session must go to
 * /auth/reset-password, never into the app.
 */
export function isRecoverySession(session: Pick<Session, "access_token"> | null | undefined): boolean {
  if (!session?.access_token) return false;
  const amr = decodeJwtPayload(session.access_token)?.amr;
  if (Array.isArray(amr) && amr.some((entry: AmrEntry) => entry?.method === "recovery")) return true;
  const id = sessionIdOf(session);
  return id !== null && readMark() === id;
}

export interface AuthErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

export interface DescribedAuthError {
  /** What the user should read. */
  message: string;
  /** Short reference shown under the message and stored in auth_events, so an admin can tell failures apart. */
  ref: string;
  /** Seconds to wait before another send is allowed, when Supabase said so. */
  retryAfterSeconds?: number;
}

function refFor(error: AuthErrorLike): string {
  return error.code || (error.status ? `http_${error.status}` : error.name || "unknown");
}

function isNetworkError(error: AuthErrorLike): boolean {
  return error.name === "AuthRetryableFetchError" || error.status === 0;
}

/** Explains a failed verifyOtp() call (reset code or sign-in code). */
export function describeCodeError(error: AuthErrorLike): DescribedAuthError {
  const ref = refFor(error);
  if (isNetworkError(error)) {
    return { ref, message: "We couldn't reach the server. Check your connection and try the same code again." };
  }
  if (error.code === "otp_expired" || /expired or is invalid/i.test(error.message ?? "")) {
    return {
      ref,
      message:
        "That code isn't valid any more. It may have been mistyped, already used, or replaced by a newer email. Use the code from the most recent email, or send a new one.",
    };
  }
  if (error.status === 429 || error.code?.startsWith("over_")) {
    return { ref, message: "Too many attempts. Wait a few minutes, then try the code from the most recent email." };
  }
  return { ref, message: `The code couldn't be checked: ${error.message ?? "unknown error"}` };
}

/** Explains a failed resetPasswordForEmail() / signInWithOtp() call. */
export function describeSendError(error: AuthErrorLike): DescribedAuthError {
  const ref = refFor(error);
  if (isNetworkError(error)) {
    return { ref, message: "We couldn't reach the server, so no email was sent. Check your connection and try again." };
  }
  const wait = /after (\d+) seconds?/i.exec(error.message ?? "");
  if (wait || error.code === "over_email_send_rate_limit") {
    const retryAfterSeconds = wait ? Number(wait[1]) : RESEND_COOLDOWN_SECONDS;
    return {
      ref,
      retryAfterSeconds,
      message: `A code was sent less than a minute ago. Use the code in that email, or send a new one in ${retryAfterSeconds} seconds.`,
    };
  }
  if (error.status === 429 || error.code?.startsWith("over_")) {
    return { ref, message: "Too many emails have been requested. Wait a few minutes and try again." };
  }
  return { ref, message: `The email couldn't be sent: ${error.message ?? "unknown error"}` };
}
