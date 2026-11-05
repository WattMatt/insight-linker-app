import type { Session } from "@supabase/supabase-js";

/**
 * Password-recovery helpers shared by the auth screens.
 *
 * Two problems these exist to solve (docs/AUTH_PASSWORD_REVIEW_2026-10-29.md):
 *
 * 1. Recognising a recovery session without a race. The SDK announces a
 *    recovery link through a PASSWORD_RECOVERY event fired on a timer after
 *    getSession() has already resolved, so pages that waited for the event
 *    routed the user to the dashboard first. The session's own access token
 *    says how it was obtained (the `amr` claim), which is there synchronously.
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

/**
 * True when the session was created by verifying a password-recovery code or
 * link. Such a session must go to /auth/reset-password, never the dashboard.
 * ResetPassword replaces it with a password sign-in once the new password is
 * set, so this stops being true after a completed reset.
 */
export function isRecoverySession(session: Pick<Session, "access_token"> | null | undefined): boolean {
  if (!session?.access_token) return false;
  const amr = decodeJwtPayload(session.access_token)?.amr;
  return Array.isArray(amr) && amr.some((entry: AmrEntry) => entry?.method === "recovery");
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
