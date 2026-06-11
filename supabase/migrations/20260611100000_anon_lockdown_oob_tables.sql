-- =============================================================================
-- 20260611100000_anon_lockdown_oob_tables.sql
-- Close anon (unauthenticated) READ + WRITE on two tables that BOTH the tier-2
-- read lockdown (docs/security/APPLIED-2026-06-11-tier2-anon-read-lockdown.sql)
-- AND the write lockdown (20260610120000) missed — because these tables were
-- created out-of-band (via the dashboard, not in supabase/migrations) and so were
-- never in either lockdown's table list.  See GAPS.md G-SEC-11 (hole) + G-OPS-01
-- (schema-drift root cause).
--
-- Evidence (2026-06-11, anon REST with the public anon key):
--   contractor_coc_uploads : SELECT -> 200 []   ; INSERT {} -> 23502 (passed RLS)
--   inspection_relink_audit: SELECT -> 200 []   ; INSERT {} -> 23502 (passed RLS)
-- All other tables correctly returned 42501 (RLS denied). Both tables are empty
-- (no data exposed yet) and have ZERO read/write call sites in src/ or
-- supabase/functions/ (referenced only in generated types.ts), so revoking all
-- anon access breaks nothing. authenticated / service_role are unaffected.
--
-- PostgREST connects as the `anon` role, so REVOKE ALL ... FROM anon is sufficient
-- and policy-name-independent: anon hits permission-denied before RLS is evaluated.
-- (Full policy reconciliation to the tier-2 authenticated-only model is tracked
-- under G-OPS-01 alongside the rest of the out-of-band drift.)
-- =============================================================================

REVOKE ALL ON public.contractor_coc_uploads  FROM anon;
REVOKE ALL ON public.inspection_relink_audit FROM anon;

NOTIFY pgrst, 'reload schema';
