-- =============================================================================
-- Admin "Sign-in history" for one user (docs/AUTH_PASSWORD_REVIEW_2026-10-29.md,
-- Step 4). Read-only. Admin-only.
--
-- Returns { account, events } for p_user_id:
--   account — the auth.users facts that say whether someone can sign in at all:
--             has a password ever been set, email confirmed, last sign-in, last
--             reset email, forced-change flag, ban.
--   events  — one timeline, newest first, from three sources:
--     'supabase' — auth.audit_log_entries: what Supabase itself recorded
--                  (sign-ins, reset emails, password updates, admin changes).
--                  Authoritative. Token refresh/revoke noise is left out.
--     'app'      — public.auth_events rows tied to the user: written by the
--                  app for a signed-in user, or by invite-user for an admin
--                  action (metadata.actor_id names the admin).
--     'reported' — public.auth_events rows sent before sign-in (code rejected,
--                  email not sent), matched by a SHA-256 of the email the
--                  person typed. log-auth-event stores only that hash. Anyone
--                  can submit one (rate-limited), so these are reports, not
--                  proof — the UI labels them that way.
--
-- auth.audit_log_entries is written to Postgres on this project
-- (auth config audit_log_disable_postgres = false, checked 2026-11-05).
-- =============================================================================

-- Matches 'reported' rows without scanning the table.
CREATE INDEX IF NOT EXISTS idx_auth_events_email_sha256
    ON public.auth_events ((metadata->>'email_sha256'))
    WHERE user_id IS NULL;

CREATE OR REPLACE FUNCTION public.admin_user_sign_in_history(p_user_id uuid, p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user      auth.users%ROWTYPE;
    v_hash      text;
    v_limit     integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
    v_account   jsonb;
    v_events    jsonb;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'Admin'
    ) THEN
        RAISE EXCEPTION 'Only admins can view sign-in history' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_user FROM auth.users WHERE id = p_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No account with id %', p_user_id USING ERRCODE = 'P0002';
    END IF;

    v_hash := encode(sha256(convert_to(lower(btrim(v_user.email)), 'UTF8')), 'hex');

    v_account := jsonb_build_object(
        'email',                    v_user.email,
        'created_at',               v_user.created_at,
        'invited_at',               v_user.invited_at,
        'email_confirmed_at',       v_user.email_confirmed_at,
        'last_sign_in_at',          v_user.last_sign_in_at,
        'recovery_sent_at',         v_user.recovery_sent_at,
        'has_password',             COALESCE(v_user.encrypted_password, '') <> '',
        'requires_password_change', COALESCE((v_user.raw_user_meta_data->>'requires_password_change')::boolean, false),
        'banned_until',             v_user.banned_until
    );

    -- Sorted on the timestamptz itself, not its text form.
    SELECT COALESCE(jsonb_agg(limited.e ORDER BY limited.at DESC), '[]'::jsonb)
      INTO v_events
      FROM (
        SELECT unioned.at, unioned.e FROM (
            SELECT a.created_at AS at,
                   jsonb_build_object(
                       'at',      a.created_at,
                       'source',  'supabase',
                       'kind',    a.payload->>'action',
                       'detail',  jsonb_strip_nulls(jsonb_build_object(
                                      'actor_id',    a.payload->>'actor_id',
                                      'actor_email', a.payload->>'actor_username',
                                      'by_admin',    (a.payload->>'actor_id') IS DISTINCT FROM p_user_id::text,
                                      'traits',      a.payload->'traits')),
                       'ip',      NULLIF(a.ip_address, '')
                   ) AS e
              FROM auth.audit_log_entries a
             WHERE (a.payload->>'actor_id' = p_user_id::text
                    OR a.payload->'traits'->>'user_id' = p_user_id::text)
               AND COALESCE(a.payload->>'action', '') NOT IN ('token_refreshed', 'token_revoked')
            UNION ALL
            SELECT ev.occurred_at AS at,
                   jsonb_build_object(
                       'at',      ev.occurred_at,
                       'source',  CASE WHEN ev.user_id IS NULL THEN 'reported' ELSE 'app' END,
                       'kind',    ev.event_type,
                       'detail',  ev.metadata - 'email_sha256',
                       'ip',      host(ev.ip_address)
                   )
              FROM public.auth_events ev
             WHERE ev.user_id = p_user_id
                OR (ev.user_id IS NULL AND ev.metadata->>'email_sha256' = v_hash)
        ) unioned
        ORDER BY unioned.at DESC
        LIMIT v_limit
      ) limited;

    RETURN jsonb_build_object('account', v_account, 'events', v_events);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_user_sign_in_history(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_user_sign_in_history(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_user_sign_in_history(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.admin_user_sign_in_history(uuid, integer) IS
    'Admin-only sign-in history for one user: auth.users account state plus a merged timeline of auth.audit_log_entries and public.auth_events (incl. pre-sign-in reports matched by email SHA-256). See docs/AUTH_PASSWORD_REVIEW_2026-10-29.md Step 4.';

NOTIFY pgrst, 'reload schema';
