import { supabase } from "@/integrations/supabase/client";

// auth-audit — thin client-side helper for the auth_events table.
//
// Calls the log-auth-event Edge Function (which writes via service role
// after validating the JWT and rate-limiting per IP). Fire-and-forget by
// design — auth UX must never block on a failed audit write.
//
// MED #9 of the security-review: failed calls are queued in localStorage
// and replayed on the next successful call OR on next module load. Cap
// at 50 to prevent storage abuse. Errors are warned-in-dev / silent-in-prod.

const QUEUE_KEY = "wm_auth_audit_retry_queue";
const MAX_QUEUE = 50;

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
  method?: "password" | "magic_link" | "oauth" | "invite" | "recovery" | "self";
  reason?: string;
  error_code?: string;
}

interface QueuedEvent {
  event_type: AuthEventType;
  metadata: AuthEventMetadata;
  queued_at: number;
}

function readQueue(): QueuedEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedEvent[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  } catch {
    /* quota / privacy mode — drop */
  }
}

async function sendOne(event_type: AuthEventType, metadata: AuthEventMetadata): Promise<boolean> {
  try {
    const { error } = await supabase.functions.invoke("log-auth-event", {
      body: { event_type, metadata },
    });
    return !error;
  } catch {
    return false;
  }
}

async function drainQueue(): Promise<void> {
  const queue = readQueue();
  if (queue.length === 0) return;
  const remaining: QueuedEvent[] = [];
  for (const item of queue) {
    const ok = await sendOne(item.event_type, item.metadata);
    if (!ok) remaining.push(item);
  }
  writeQueue(remaining);
}

// Drain on module load (idempotent). Failures stay queued for next time.
if (typeof window !== "undefined") {
  void drainQueue().catch(() => {});
}

export function recordAuthEvent(
  event_type: AuthEventType,
  metadata: AuthEventMetadata = {},
): void {
  void (async () => {
    const ok = await sendOne(event_type, metadata);
    if (ok) {
      // Opportunistically retry anything that piled up while we were down.
      void drainQueue().catch(() => {});
      return;
    }
    if (process.env.NODE_ENV === "development") {
      console.warn("[auth-audit] failed to record event; queued for retry", event_type);
    }
    const queue = readQueue();
    queue.push({ event_type, metadata, queued_at: Date.now() });
    writeQueue(queue);
  })();
}
