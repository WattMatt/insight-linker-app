/**
 * Turns admin_user_sign_in_history() output into plain language for the admin
 * "Sign-in history" dialog (docs/AUTH_PASSWORD_REVIEW_2026-10-29.md, Step 4).
 *
 * Three sources, labelled so an admin knows how far to trust each line:
 *   supabase — recorded by Supabase Auth itself (authoritative)
 *   app      — recorded by the app for a signed-in user or an admin action
 *   reported — sent by the sign-in page before sign-in, matched by a hash of
 *              the email typed; anyone can send one, so it's a report
 */

export type HistorySource = "supabase" | "app" | "reported";

export interface HistoryEvent {
  at: string;
  source: HistorySource;
  kind: string;
  detail?: Record<string, unknown> | null;
  ip?: string | null;
}

export interface HistoryAccount {
  email: string | null;
  created_at: string | null;
  invited_at: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  recovery_sent_at: string | null;
  has_password: boolean;
  requires_password_change: boolean;
  banned_until: string | null;
}

export interface SignInHistory {
  account: HistoryAccount;
  events: HistoryEvent[];
}

export const SOURCE_LABEL: Record<HistorySource, string> = {
  supabase: "Supabase",
  app: "App",
  reported: "Reported by sign-in page",
};

const SUPABASE_ACTIONS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  user_recovery_requested: "Password reset email sent",
  user_updated_password: "Password changed",
  user_modified: "Account changed",
  user_invited: "Invited",
  user_signedup: "Account created",
  user_confirmation_requested: "Confirmation email sent",
  user_reauthenticate_requested: "Re-authentication requested",
  user_deleted: "Account deleted",
  identity_linked: "Sign-in method linked",
  identity_unlinked: "Sign-in method removed",
  factor_in_progress: "Two-factor setup started",
  factor_unenrolled: "Two-factor removed",
  challenge_created: "Two-factor challenge",
  verification_attempted: "Two-factor code entered",
  factor_deleted: "Two-factor removed",
  recovery_codes_deleted: "Two-factor recovery codes removed",
  factor_updated: "Two-factor changed",
};

const REASON_LABELS: Record<string, string> = {
  sent: "Asked for a reset code",
  send_failed: "Reset code email NOT sent",
  code_rejected: "Reset code rejected",
  admin_email_code: "Admin emailed a reset code",
  admin_email_code_failed: "Admin reset code NOT sent",
  admin_temp_password: "Admin emailed a temporary password",
  admin_temp_password_rejected: "Admin temporary password rejected — nothing changed",
  admin_temp_password_email_failed: "Admin set a temporary password but the email failed",
  verified: "Password changed and confirmed by signing in",
  resignin_failed: "Password changed, but signing in with it failed",
  flag_clear_failed: "Password changed, but the must-change flag stuck",
};

const APP_KINDS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  password_changed: "Password changed",
  password_reset_requested: "Password reset",
  magic_link_requested: "Asked for a sign-in code",
  lockout: "Locked out",
  user_created: "Account created",
  account_deleted: "Account deleted",
  account_email_changed: "Email changed",
  mfa_enrolled: "Two-factor added",
  mfa_unenrolled: "Two-factor removed",
};

const METHOD_LABELS: Record<string, string> = {
  recovery: "with a reset code",
  password: "with a password",
  magic_link: "with a sign-in code",
  invite: "from an invite",
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

export interface DescribedEvent {
  title: string;
  /** Error code, admin, or other specifics; empty when there is nothing to add. */
  notes: string[];
  /** True for lines that mean something failed. */
  problem: boolean;
}

export function describeEvent(event: HistoryEvent): DescribedEvent {
  const d = event.detail ?? {};
  const notes: string[] = [];
  const errorCode = str(d.error_code);
  if (errorCode) notes.push(`ref: ${errorCode}`);

  if (event.source === "supabase") {
    const title = SUPABASE_ACTIONS[event.kind] ?? event.kind.replace(/_/g, " ");
    if (d.by_admin === true) notes.push(`by ${str(d.actor_email) ?? "an admin"}`);
    return { title, notes, problem: false };
  }

  const reason = str(d.reason);
  const method = str(d.method);
  let title = (reason && REASON_LABELS[reason]) || APP_KINDS[event.kind] || event.kind.replace(/_/g, " ");
  if (!reason && method && METHOD_LABELS[method] && (event.kind === "login" || event.kind === "password_changed")) {
    title = `${title} ${METHOD_LABELS[method]}`;
  }
  if (str(d.actor_id) && reason?.startsWith("admin_")) notes.push(`admin id ${str(d.actor_id)!.slice(0, 8)}…`);
  const problem = Boolean(errorCode) || /failed|rejected|NOT sent|stuck/i.test(title);
  return { title, notes, problem };
}

/** The account facts that most often explain "can't sign in", worst first. */
export function accountWarnings(account: HistoryAccount, now: Date = new Date()): string[] {
  const out: string[] = [];
  if (account.banned_until && new Date(account.banned_until) > now) {
    out.push(`Account is blocked until ${new Date(account.banned_until).toLocaleString()}.`);
  }
  if (!account.has_password) {
    out.push(
      account.last_sign_in_at
        ? "No password has ever been set, but they have signed in before (an old invite or reset link). They can't sign in with a password — send a reset code."
        : "No password has been set yet. They can't sign in with a password — send a reset code.",
    );
  }
  if (account.requires_password_change) {
    out.push("Must choose a new password at their next sign-in.");
  }
  if (!account.email_confirmed_at) {
    out.push("Email address not confirmed.");
  }
  return out;
}
