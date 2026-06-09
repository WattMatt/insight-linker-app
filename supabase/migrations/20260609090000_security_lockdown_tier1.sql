-- Security lockdown — IMMEDIATE wave (QR-SAFE)  2026-06-09
-- Safe to apply NOW. Deliberately does NOT touch the anonymous TABLE READS that
-- the actively-used QR landing page (/public/subsections/:id -> PublicSubsection)
-- depends on (settings, subsections, document_categories, snags, coc_validations).
-- The anon-read closure (Tier 2) is HELD until the get_public_subsection RPC ships
-- and PublicSubsection is repointed at it -- see
-- docs/security/PENDING-tier2-anon-read-lockdown.sql
-- Atomic (single transaction) + idempotent.

BEGIN;

-- C3: stop anonymous harvesting of client share-link tokens.
DROP POLICY IF EXISTS "Public can select access_links for validation" ON public.client_access_links;

-- H1: contractor_coc_uploads was anon read + insert + update.
DROP POLICY IF EXISTS "allow read"   ON public.contractor_coc_uploads;
DROP POLICY IF EXISTS "allow insert" ON public.contractor_coc_uploads;
DROP POLICY IF EXISTS "allow update" ON public.contractor_coc_uploads;
DROP POLICY IF EXISTS "Authenticated manage contractor_coc_uploads" ON public.contractor_coc_uploads;
CREATE POLICY "Authenticated manage contractor_coc_uploads" ON public.contractor_coc_uploads
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- M1: stop anon enumerating the RLS model / probing API tokens (guarded).
DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_rls_policies_for_role(text) FROM PUBLIC';
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'get_rls_policies_for_role(text) absent - skipped'; END $$;
DO $$ BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.validate_api_token(text) FROM PUBLIC';
EXCEPTION WHEN undefined_function THEN RAISE NOTICE 'validate_api_token(text) absent - skipped'; END $$;

-- H4: restore tenant-assignment scoping (was: any authenticated user full access).
-- QR pages are anonymous and never touch these tables, so this is QR-safe.
DROP POLICY IF EXISTS "All authenticated users full access to user_clients" ON public.user_clients;
DROP POLICY IF EXISTS "All authenticated users full access to user_sites"   ON public.user_sites;
DROP POLICY IF EXISTS "Admins manage user_clients"    ON public.user_clients;
DROP POLICY IF EXISTS "Users read own client mapping" ON public.user_clients;
DROP POLICY IF EXISTS "Admins manage user_sites"      ON public.user_sites;
DROP POLICY IF EXISTS "Users read own site mapping"   ON public.user_sites;
CREATE POLICY "Admins manage user_clients" ON public.user_clients
  FOR ALL TO authenticated USING (has_role(auth.uid(),'Admin'::app_role)) WITH CHECK (has_role(auth.uid(),'Admin'::app_role));
CREATE POLICY "Users read own client mapping" ON public.user_clients
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Admins manage user_sites" ON public.user_sites
  FOR ALL TO authenticated USING (has_role(auth.uid(),'Admin'::app_role)) WITH CHECK (has_role(auth.uid(),'Admin'::app_role));
CREATE POLICY "Users read own site mapping" ON public.user_sites
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- STORAGE: remove ANONYMOUS WRITE / UPDATE / DELETE (zero breakage; nothing
-- public writes files). Anon READ left in place so QR images keep loading.
DROP POLICY IF EXISTS "Anyone can upload to all storage"   ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update all storage"      ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete from all storage" ON storage.objects;
DROP POLICY IF EXISTS "auth_insert_objects" ON storage.objects;
DROP POLICY IF EXISTS "auth_update_objects" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_objects" ON storage.objects;
CREATE POLICY "auth_insert_objects" ON storage.objects FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_objects" ON storage.objects FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete_objects" ON storage.objects FOR DELETE TO authenticated USING (true);

COMMIT;
