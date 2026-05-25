-- =============================================================================
-- Migration: 20260525120000_auth_events_audit.sql
-- Description: Auth audit trail. Captures login / logout / password-change /
--              lockout / mfa-enrol / account-deletion / email-change / user-
--              creation / magic-link / password-reset-request events.
--              POPIA §16 (accountability) + §24 (right-to-erasure paper trail).
--
-- Ported from ESITE.V1 migrations 00038_auth_events.sql + 00079 (event_type
-- whitelist extension). Adopted in ecompliance to close audit gap EC-3 of
-- the 2026-05-25 user-management gap analysis.
--
-- The audit row must persist after a user is deleted, so there is intentionally
-- no FK to auth.users(id) and user_id is nullable. Events are written from the
-- service-role only (Edge Functions, server actions). Affected users can
-- read their own rows via the SELECT policy below.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.auth_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID,
    event_type      TEXT NOT NULL CHECK (event_type IN (
        'login',
        'logout',
        'password_changed',
        'password_reset_requested',
        'magic_link_requested',
        'lockout',
        'mfa_enrolled',
        'mfa_unenrolled',
        'account_deleted',
        'account_email_changed',
        'user_created'
    )),
    ip_address      INET,
    user_agent      TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_id     ON public.auth_events(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_event_type  ON public.auth_events(event_type);
CREATE INDEX IF NOT EXISTS idx_auth_events_occurred_at ON public.auth_events(occurred_at DESC);

-- Read-only for the affected user; service-role writes only (no INSERT policy
-- for authenticated/anon — service-role bypasses RLS).
ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_events: user reads own" ON public.auth_events;
CREATE POLICY "auth_events: user reads own"
    ON public.auth_events
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
