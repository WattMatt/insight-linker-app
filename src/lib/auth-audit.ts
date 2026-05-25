import { supabase } from "@/integrations/supabase/client";

// auth-audit — thin client-side helper for the auth_events table.
//
// Calls the log-auth-event Edge Function (which writes via service role so
// browser code doesn't need INSERT on auth_events). Fire-and-forget by
// design — auth UX must never block on a failed audit write. Errors are
// logged in dev only; production swallows them silently.

export type AuthEventType =
  | "login"
  | "logout"
  | "password_changed"
  | "password_reset_requested"
  | "magic_link_requested"
  | "lockout"
  | "mfa_enrolled"
  | "mfa_unenrolled"
  | "account_deleted"
  | "account_email_changed"
  | "user_created";

export interface AuthEventMetadata {
  method?: "password" | "magic_link" | "oauth" | "invite" | "recovery";
  error_code?: string;
  [key: string]: unknown;
}

export function recordAuthEvent(
  event_type: AuthEventType,
  metadata: AuthEventMetadata = {},
): void {
  void supabase.functions
    .invoke("log-auth-event", {
      body: { event_type, metadata },
    })
    .catch((err) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("[auth-audit] failed to record event", event_type, err);
      }
    });
}
