-- Rollback for supabase/migrations/20260805120000_managing_agencies.sql.
-- Restores the exact pre-migration state captured from production on
-- 2026-08-05 (policy quals, function body, site_type values). Stored under
-- docs/rollbacks/ so the CLI never treats it as a forward migration; also
-- recorded in the migration's supabase_migrations.schema_migrations.rollback
-- column. Apply via the Management API only.

BEGIN;

-- --- data ------------------------------------------------------------------

-- Remove the repaired mapping (must precede restoring UNIQUE(client_id):
-- Fortress would otherwise have two mapped users).
DELETE FROM public.user_clients uc
USING public.profiles p
WHERE uc.user_id = p.id AND p.email = 'delanged@fortressfund.co.za';

-- Restore pre-migration site_type on the 40 Fortress sites: NULL except the
-- four below ('' on three, 'Retail' on YARONA CENTRE).
UPDATE public.sites s SET site_type = NULL
FROM public.clients c
WHERE c.id = s.client_id AND c.name = 'Fortress_Fund';
UPDATE public.sites SET site_type = '' WHERE id IN
  ('45c4171e-b4b6-4aa4-a563-d71314c2db4b',   -- 204 Oxford
   '4a0d11fb-e08e-47dd-bde5-5fc7849d9310',   -- 36 Houer Road City Deep
   '66de070d-7e3b-4790-865b-f926b8e3a294'); -- Mayville Mall
UPDATE public.sites SET site_type = 'Retail'
WHERE id = 'ade5256f-419e-4860-bfd4-2f38dc3cb21a'; -- YARONA CENTRE

-- --- audit trail -----------------------------------------------------------

DROP TRIGGER IF EXISTS trg_sites_agency_audit ON public.sites;
DROP TRIGGER IF EXISTS trg_user_clients_agency_audit ON public.user_clients;
DROP FUNCTION IF EXISTS public.log_agency_assignment();
DROP TABLE IF EXISTS public.agency_assignment_history;

-- --- get_public_portfolio: pre-migration production definition -------------

CREATE OR REPLACE FUNCTION public.get_public_portfolio(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_link public.client_access_links;
BEGIN
  v_link := public._share_link(p_token);
  IF v_link.id IS NULL OR v_link.client_id IS NULL THEN
    RETURN NULL;  -- invalid/expired token or not a client-scoped link
  END IF;
  RETURN jsonb_build_object(
    'settings', (SELECT jsonb_build_object('company_name', company_name, 'company_logo_url', company_logo_url)
                 FROM settings ORDER BY created_at LIMIT 1),
    'client', (SELECT jsonb_build_object('id', id, 'name', name, 'company_name', company_name, 'logo_url', logo_url)
               FROM clients WHERE id = v_link.client_id),
    'sites', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'address', s.address, 'site_type', s.site_type, 'site_image_url', s.site_image_url,
        'total_subsections', (SELECT count(*) FROM subsections sub WHERE sub.site_id = s.id),
        'open_snags', (SELECT count(*) FROM snags sn JOIN subsections sub ON sub.id = sn.subsection_id
                       WHERE sub.site_id = s.id AND lower(coalesce(sn.status,'')) NOT IN ('rectified','closed'))
      ) ORDER BY s.name)
      FROM sites s WHERE s.client_id = v_link.client_id), '[]'::jsonb)
  );
END; $function$;

-- --- the 11 Client policies: pre-migration quals and roles ------------------

DROP POLICY IF EXISTS "Clients can view their sites" ON public.sites;
CREATE POLICY "Clients can view their sites"
  ON public.sites FOR SELECT TO public
  USING (has_role(auth.uid(), 'Client'::app_role) AND (client_id = get_user_client_id()));

DROP POLICY IF EXISTS "Clients view their calendar events" ON public.calendar_events;
CREATE POLICY "Clients view their calendar events"
  ON public.calendar_events FOR SELECT TO public
  USING (has_role(auth.uid(), 'Client'::app_role) AND (site_id IN (
    SELECT sites.id FROM sites WHERE sites.client_id = get_user_client_id())));

DROP POLICY IF EXISTS "clients read own site coc_certificates" ON public.coc_certificates;
CREATE POLICY "clients read own site coc_certificates"
  ON public.coc_certificates FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'Client'::app_role) AND (site_id IN (
    SELECT sites.id FROM sites WHERE sites.client_id = get_user_client_id())));

DROP POLICY IF EXISTS "clients read own site coc_db_schedule" ON public.coc_db_schedule;
CREATE POLICY "clients read own site coc_db_schedule"
  ON public.coc_db_schedule FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'Client'::app_role) AND (site_id IN (
    SELECT sites.id FROM sites WHERE sites.client_id = get_user_client_id())));

DROP POLICY IF EXISTS "Clients can view inspections for their sites" ON public.inspections;
CREATE POLICY "Clients can view inspections for their sites"
  ON public.inspections FOR SELECT TO public
  USING (has_role(auth.uid(), 'Client'::app_role) AND (site_id IN (
    SELECT sites.id FROM sites WHERE sites.client_id = get_user_client_id())));

DROP POLICY IF EXISTS "Clients can view site documents for their sites" ON public.site_documents;
CREATE POLICY "Clients can view site documents for their sites"
  ON public.site_documents FOR SELECT TO public
  USING (has_role(auth.uid(), 'Client'::app_role) AND (site_id IN (
    SELECT sites.id FROM sites WHERE sites.client_id = get_user_client_id())));

DROP POLICY IF EXISTS "Clients can read their own site health snapshots" ON public.site_health_snapshots;
CREATE POLICY "Clients can read their own site health snapshots"
  ON public.site_health_snapshots FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'Client'::app_role) AND (site_id IN (
    SELECT sites.id FROM sites WHERE sites.client_id = get_user_client_id())));

DROP POLICY IF EXISTS "Clients can view subsections for their sites" ON public.subsections;
CREATE POLICY "Clients can view subsections for their sites"
  ON public.subsections FOR SELECT TO public
  USING (has_role(auth.uid(), 'Client'::app_role) AND (site_id IN (
    SELECT sites.id FROM sites WHERE sites.client_id = get_user_client_id())));

DROP POLICY IF EXISTS "Clients can view snags for their sites" ON public.snags;
CREATE POLICY "Clients can view snags for their sites"
  ON public.snags FOR SELECT TO public
  USING (has_role(auth.uid(), 'Client'::app_role) AND (subsection_id IN (
    SELECT s.id FROM subsections s JOIN sites st ON st.id = s.site_id
    WHERE st.client_id = get_user_client_id())));

DROP POLICY IF EXISTS "Clients can view their subsection documents" ON public.subsection_documents;
CREATE POLICY "Clients can view their subsection documents"
  ON public.subsection_documents FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'Client'::app_role) AND (subsection_id IN (
    SELECT subsections.id FROM subsections WHERE subsections.site_id IN (
      SELECT sites.id FROM sites WHERE sites.client_id = get_user_client_id()))));

DROP POLICY IF EXISTS "Clients can view subsection floor plans for their sites" ON public.subsection_floor_plans;
CREATE POLICY "Clients can view subsection floor plans for their sites"
  ON public.subsection_floor_plans FOR SELECT TO public
  USING (has_role(auth.uid(), 'Client'::app_role) AND (subsection_id IN (
    SELECT s.id FROM subsections s JOIN sites st ON st.id = s.site_id
    WHERE st.client_id = get_user_client_id())));

-- --- blanket policies: restore pre-migration state -------------------------

DROP POLICY IF EXISTS "Staff can view user-client mappings" ON public.user_clients;
CREATE POLICY "All authenticated users full access to user_clients"
  ON public.user_clients FOR ALL TO public
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Staff can read access links" ON public.client_access_links;
CREATE POLICY "auth_read_client_access_links"
  ON public.client_access_links FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_read_sites"
  ON public.sites FOR SELECT TO authenticated USING (true);

-- --- constraint, helper, columns, table ------------------------------------

ALTER TABLE public.user_clients ADD CONSTRAINT user_clients_client_id_key UNIQUE (client_id);

DROP FUNCTION public.get_user_visible_site_ids();

ALTER TABLE public.sites DROP COLUMN managing_agency_id;
ALTER TABLE public.user_clients DROP COLUMN managing_agency_id;
ALTER TABLE public.client_access_links DROP COLUMN managing_agency_id;
DROP TABLE public.managing_agencies;

COMMIT;
