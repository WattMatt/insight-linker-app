-- PENDING — apply via the Supabase dashboard SQL editor (project oltzgidkjxwsukvkomof,
-- account arno@wmeng.co.za), same as the tier-2 lockdown. Then move/rename to
-- APPLIED-… and verify with the anon probe in GAPS.md G-SEC-11.
--
-- Closes a live anon READ+WRITE hole on two out-of-band tables (G-SEC-11).
-- Safe: both tables are empty and have no read/write call sites in the app.
-- Mirror of supabase/migrations/20260611100000_anon_lockdown_oob_tables.sql.

REVOKE ALL ON public.contractor_coc_uploads  FROM anon;
REVOKE ALL ON public.inspection_relink_audit FROM anon;

NOTIFY pgrst, 'reload schema';

-- Verify after applying (should both flip from open to denied):
--   anon SELECT contractor_coc_uploads   -> expect 401 (was 200 [])
--   anon INSERT contractor_coc_uploads {} -> expect 401/42501 (was 400 23502)
--   anon SELECT inspection_relink_audit  -> expect 401
--   anon INSERT inspection_relink_audit {} -> expect 401/42501
