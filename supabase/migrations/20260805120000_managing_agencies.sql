-- Managing agencies: split a client's portfolio between managing agencies and
-- scope client-portal visibility accordingly.
--
-- Client request (Fortress): the fund's buildings are run by two managing
-- agencies (Broll and JHI). Agency-assigned portal users must see only their
-- agency's slice of the portfolio; fund-level representatives (no agency on
-- their mapping) keep the whole portfolio. The site list additionally gains a
-- sector grouping (Retail / Logistics / Office), carried in sites.site_type.
--
-- What this migration does, in order:
--   1. public.managing_agencies — per-client agency register.
--   2. managing_agency_id (nullable FK) on sites, user_clients and
--      client_access_links, each with a composite FK onto
--      managing_agencies (id, client_id) so an assignment can never point at
--      another client's agency. NULL always means "not agency-scoped".
--   3. Drops UNIQUE(client_id) from user_clients — it capped every client at
--      exactly ONE portal user system-wide (the second Fortress invite is
--      sitting role-mapped but unlinked in prod because of it).
--      UNIQUE(user_id) stays: a user still belongs to exactly one client.
--   4. Read-path lockdown that the emergency triage phase deferred:
--      drops the USING(true) authenticated read policies auth_read_sites and
--      auth_read_client_access_links, and the blanket ALL policy on
--      user_clients. Without this, any signed-in account can read every
--      client's sites and every share-link token, and rewrite its own client
--      mapping — which would let a user undo the very scoping this feature
--      adds. Staff (User role) keep SELECT via explicit policies; writes on
--      these tables are Admin/service-role only from here on.
--   5. public.get_user_visible_site_ids() — the one visibility predicate
--      (client sites, narrowed by the user's agency when set) — and a rewrite
--      of all 11 Client RLS policies onto it. All 11 move together: narrowing
--      sites alone would still leak the fund's snags/inspections/documents.
--   6. get_public_portfolio() honours an agency-scoped share link and returns
--      each site's agency name for grouping on the public page.
--   7. agency_assignment_history + triggers — every agency (re)assignment on
--      sites/user_clients is auditable, so "user sees wrong buildings"
--      reports are answerable from data, not redeploys.
--   8. Data: Broll + JHI under Fortress_Fund; sector + agency backfill for
--      all 40 Fortress sites (reconciled against the client's "Building
--      Metadata for Ops Reports" workbook, 2026-08-05: 28 Broll / 12 JHI;
--      Retail 33, Logistics 6, Office 1); repairs the orphaned
--      delanged@fortressfund.co.za mapping as a fund-level (all-agency) user.
--
-- Applied to production via the Management API on 2026-08-05 and recorded in
-- supabase_migrations.schema_migrations (rollback in the row's rollback
-- column). Do NOT re-apply via `supabase db push` — prod's migration history
-- is intentionally sparse (see review/08-prod-probe.md).

-- ---------------------------------------------------------------------------
-- 1. Agency register
-- ---------------------------------------------------------------------------

CREATE TABLE public.managing_agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, name),
  -- target for the composite FKs in §2
  UNIQUE (id, client_id)
);

ALTER TABLE public.managing_agencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage managing agencies"
  ON public.managing_agencies
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'Admin'))
  WITH CHECK (public.has_role(auth.uid(), 'Admin'));

CREATE POLICY "Staff can view managing agencies"
  ON public.managing_agencies
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'User'));

CREATE POLICY "Clients can view their agencies"
  ON public.managing_agencies
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND client_id = public.get_user_client_id()
  );

-- ---------------------------------------------------------------------------
-- 2. Assignment columns. The composite FKs reference (id, client_id) so a
--    row's agency must belong to the same client as the row itself; with
--    MATCH SIMPLE a NULL managing_agency_id skips the check entirely.
--    Deleting an agency that still has assignments is refused (NO ACTION) —
--    unassign first.
-- ---------------------------------------------------------------------------

ALTER TABLE public.sites
  ADD COLUMN managing_agency_id uuid,
  ADD CONSTRAINT sites_agency_matches_client_fkey
    FOREIGN KEY (managing_agency_id, client_id)
    REFERENCES public.managing_agencies (id, client_id);

CREATE INDEX idx_sites_managing_agency ON public.sites (managing_agency_id);

ALTER TABLE public.user_clients
  ADD COLUMN managing_agency_id uuid,
  ADD CONSTRAINT user_clients_agency_matches_client_fkey
    FOREIGN KEY (managing_agency_id, client_id)
    REFERENCES public.managing_agencies (id, client_id);

ALTER TABLE public.client_access_links
  ADD COLUMN managing_agency_id uuid,
  ADD CONSTRAINT client_access_links_agency_matches_client_fkey
    FOREIGN KEY (managing_agency_id, client_id)
    REFERENCES public.managing_agencies (id, client_id);

-- ---------------------------------------------------------------------------
-- 3. A client may have many portal users. A user still maps to one client.
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_clients DROP CONSTRAINT user_clients_client_id_key;

-- ---------------------------------------------------------------------------
-- 4. Read-path lockdown deferred from the triage phase.
-- ---------------------------------------------------------------------------

-- Any authenticated account could read every client's site inventory.
-- Admin/User keep ALL via their own policies; Client/Contractor keep their
-- scoped SELECTs. Accounts with no role row see nothing, which is correct.
DROP POLICY IF EXISTS "auth_read_sites" ON public.sites;

-- Any authenticated account could read every share-link access token — i.e.
-- mint itself a link into any client's portfolio. Writes were already
-- Admin-only; reads now are staff-only.
DROP POLICY IF EXISTS "auth_read_client_access_links" ON public.client_access_links;

CREATE POLICY "Staff can read access links"
  ON public.client_access_links
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'User')
  );

-- Any authenticated account could rewrite its own (or anyone's) client
-- mapping — a self-service tenancy switch. Reads: Admin (existing policy),
-- staff, and own row (existing policy). Writes: Admin / service role only.
DROP POLICY IF EXISTS "All authenticated users full access to user_clients" ON public.user_clients;

CREATE POLICY "Staff can view user-client mappings"
  ON public.user_clients
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'User'));

-- ---------------------------------------------------------------------------
-- 5. The single visibility predicate, and all 11 Client policies moved onto
--    it. SECURITY DEFINER: reads sites/user_clients without recursing into
--    their RLS; scoped strictly by auth.uid(). user_clients is UNIQUE(user_id)
--    so at most one mapping row feeds this.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_visible_site_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.id
  FROM public.sites s
  JOIN public.user_clients uc ON uc.client_id = s.client_id
  WHERE uc.user_id = auth.uid()
    AND (uc.managing_agency_id IS NULL
         OR s.managing_agency_id = uc.managing_agency_id);
$$;

DROP POLICY IF EXISTS "Clients can view their sites" ON public.sites;
CREATE POLICY "Clients can view their sites"
  ON public.sites
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND id IN (SELECT public.get_user_visible_site_ids())
  );

DROP POLICY IF EXISTS "Clients view their calendar events" ON public.calendar_events;
CREATE POLICY "Clients view their calendar events"
  ON public.calendar_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND site_id IN (SELECT public.get_user_visible_site_ids())
  );

DROP POLICY IF EXISTS "clients read own site coc_certificates" ON public.coc_certificates;
CREATE POLICY "clients read own site coc_certificates"
  ON public.coc_certificates
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND site_id IN (SELECT public.get_user_visible_site_ids())
  );

DROP POLICY IF EXISTS "clients read own site coc_db_schedule" ON public.coc_db_schedule;
CREATE POLICY "clients read own site coc_db_schedule"
  ON public.coc_db_schedule
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND site_id IN (SELECT public.get_user_visible_site_ids())
  );

DROP POLICY IF EXISTS "Clients can view inspections for their sites" ON public.inspections;
CREATE POLICY "Clients can view inspections for their sites"
  ON public.inspections
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND site_id IN (SELECT public.get_user_visible_site_ids())
  );

DROP POLICY IF EXISTS "Clients can view site documents for their sites" ON public.site_documents;
CREATE POLICY "Clients can view site documents for their sites"
  ON public.site_documents
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND site_id IN (SELECT public.get_user_visible_site_ids())
  );

DROP POLICY IF EXISTS "Clients can read their own site health snapshots" ON public.site_health_snapshots;
CREATE POLICY "Clients can read their own site health snapshots"
  ON public.site_health_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND site_id IN (SELECT public.get_user_visible_site_ids())
  );

DROP POLICY IF EXISTS "Clients can view subsections for their sites" ON public.subsections;
CREATE POLICY "Clients can view subsections for their sites"
  ON public.subsections
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND site_id IN (SELECT public.get_user_visible_site_ids())
  );

DROP POLICY IF EXISTS "Clients can view snags for their sites" ON public.snags;
CREATE POLICY "Clients can view snags for their sites"
  ON public.snags
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND subsection_id IN (
      SELECT sub.id FROM public.subsections sub
      WHERE sub.site_id IN (SELECT public.get_user_visible_site_ids())
    )
  );

DROP POLICY IF EXISTS "Clients can view their subsection documents" ON public.subsection_documents;
CREATE POLICY "Clients can view their subsection documents"
  ON public.subsection_documents
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND subsection_id IN (
      SELECT sub.id FROM public.subsections sub
      WHERE sub.site_id IN (SELECT public.get_user_visible_site_ids())
    )
  );

DROP POLICY IF EXISTS "Clients can view subsection floor plans for their sites" ON public.subsection_floor_plans;
CREATE POLICY "Clients can view subsection floor plans for their sites"
  ON public.subsection_floor_plans
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND subsection_id IN (
      SELECT sub.id FROM public.subsections sub
      WHERE sub.site_id IN (SELECT public.get_user_visible_site_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Agency-scoped share links. Body matches prod's current definition with
--    two changes: the agency filter, and each site carries its agency name.
-- ---------------------------------------------------------------------------

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
        'managing_agency', (SELECT ma.name FROM managing_agencies ma WHERE ma.id = s.managing_agency_id),
        'total_subsections', (SELECT count(*) FROM subsections sub WHERE sub.site_id = s.id),
        'open_snags', (SELECT count(*) FROM snags sn JOIN subsections sub ON sub.id = sn.subsection_id
                       WHERE sub.site_id = s.id AND lower(coalesce(sn.status,'')) NOT IN ('rectified','closed'))
      ) ORDER BY s.name)
      FROM sites s
      WHERE s.client_id = v_link.client_id
        AND (v_link.managing_agency_id IS NULL
             OR s.managing_agency_id = v_link.managing_agency_id)), '[]'::jsonb)
  );
END; $function$;

-- ---------------------------------------------------------------------------
-- 7. Audit trail. Inserts happen only inside the SECURITY DEFINER trigger —
--    there is deliberately no INSERT policy. changed_by is NULL for changes
--    applied outside a user session (service role / migrations).
-- ---------------------------------------------------------------------------

CREATE TABLE public.agency_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  old_agency_id uuid,
  new_agency_id uuid,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_assignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read agency assignment history"
  ON public.agency_assignment_history
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'User')
  );

CREATE OR REPLACE FUNCTION public.log_agency_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.managing_agency_id IS NOT NULL THEN
      INSERT INTO public.agency_assignment_history
        (table_name, record_id, old_agency_id, new_agency_id, changed_by)
      VALUES (TG_TABLE_NAME, NEW.id, NULL, NEW.managing_agency_id, auth.uid());
    END IF;
  ELSIF NEW.managing_agency_id IS DISTINCT FROM OLD.managing_agency_id THEN
    INSERT INTO public.agency_assignment_history
      (table_name, record_id, old_agency_id, new_agency_id, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, OLD.managing_agency_id, NEW.managing_agency_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sites_agency_audit
  AFTER INSERT OR UPDATE OF managing_agency_id ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.log_agency_assignment();

CREATE TRIGGER trg_user_clients_agency_audit
  AFTER INSERT OR UPDATE OF managing_agency_id ON public.user_clients
  FOR EACH ROW EXECUTE FUNCTION public.log_agency_assignment();

-- ---------------------------------------------------------------------------
-- 8. Fortress data.
-- ---------------------------------------------------------------------------

INSERT INTO public.managing_agencies (client_id, name)
SELECT c.id, a.name
FROM public.clients c
CROSS JOIN (VALUES ('Broll'), ('JHI')) AS a(name)
WHERE c.name = 'Fortress_Fund';

-- Sector + agency for all 40 Fortress sites, keyed by prod site id
-- (reconciled 1:1 against the client workbook; 28 Broll, 12 JHI).
UPDATE public.sites s
SET site_type = v.sector,
    managing_agency_id = ma.id
FROM (VALUES
    ('16729bf2-d71b-40d1-b8c6-b57d1cadd46a'::uuid, 'Retail', 'Broll'),
    ('d4bca5d1-d963-4cac-bcc5-292fb6095cf1'::uuid, 'Retail', 'Broll'),
    ('5b618cee-4c8b-468e-b798-009748d0b698'::uuid, 'Retail', 'Broll'),
    ('1fc2bf7e-a044-471f-8833-0b3da43db107'::uuid, 'Retail', 'Broll'),
    ('eb4e1052-d8fd-43fc-94c2-2cb7e86403a7'::uuid, 'Retail', 'Broll'),
    ('2327f587-1d65-44f0-947c-7cf7b5f7eb32'::uuid, 'Retail', 'Broll'),
    ('b60ba713-9216-4ead-90cd-fd83f1567200'::uuid, 'Retail', 'Broll'),
    ('ef460dee-8a5c-4234-ade8-e3a8978f03e8'::uuid, 'Retail', 'Broll'),
    ('659455eb-ca60-49a0-97b0-0b28bcd82002'::uuid, 'Retail', 'Broll'),
    ('bec27946-5691-4e5e-bb02-4dec3969e120'::uuid, 'Retail', 'Broll'),
    ('835bccac-ac6a-49e6-8d17-8d07ebd4c5ec'::uuid, 'Retail', 'Broll'),
    ('8c840f67-ccde-452f-aa18-c1acf1130e65'::uuid, 'Retail', 'Broll'),
    ('4bb5e71c-d264-414f-af8a-eea11294daed'::uuid, 'Retail', 'Broll'),
    ('0053aa4c-7aed-42dd-abf6-2bd9ab2e9676'::uuid, 'Retail', 'Broll'),
    ('1a9462d8-6ab8-4934-8783-fbb51806b4a6'::uuid, 'Retail', 'Broll'),
    ('79e8cacd-9b97-4991-b7b4-874656677b78'::uuid, 'Retail', 'Broll'),
    ('c5e1048d-d8d2-476d-bbc2-693ba9b6ee0d'::uuid, 'Retail', 'Broll'),
    ('a8772009-c38a-4690-9a50-75546e0defab'::uuid, 'Retail', 'Broll'),
    ('7bb16eeb-7321-4c52-b21f-8d46216a7b65'::uuid, 'Retail', 'Broll'),
    ('4af30183-fdaf-4b78-8367-abf89e77234f'::uuid, 'Retail', 'Broll'),
    ('54e4c958-8749-48e1-8972-a0430af0e783'::uuid, 'Retail', 'Broll'),
    ('d2146674-0010-4af0-b66a-99dd69a69b55'::uuid, 'Retail', 'Broll'),
    ('c318ba55-801e-492d-82f9-cb9c1db08e8e'::uuid, 'Retail', 'Broll'),
    ('5a62373c-a051-4d73-aac9-be6302477cde'::uuid, 'Retail', 'Broll'),
    ('1d7bb958-bd19-4292-bba5-57214c67e5c8'::uuid, 'Retail', 'Broll'),
    ('82d25ae1-6541-4a64-a036-ac14a6460991'::uuid, 'Retail', 'Broll'),
    ('ade5256f-419e-4860-bfd4-2f38dc3cb21a'::uuid, 'Retail', 'Broll'),
    ('c70acee6-5528-41a4-ac07-9ae7e75135ff'::uuid, 'Retail', 'Broll'),
    ('4a0d11fb-e08e-47dd-bde5-5fc7849d9310'::uuid, 'Logistics', 'JHI'),
    ('dba098a6-d3ca-422a-97da-9fde6a8df3f9'::uuid, 'Logistics', 'JHI'),
    ('81a1ec73-9fd4-4368-8394-60da34338263'::uuid, 'Logistics', 'JHI'),
    ('bc5cfd1f-a3f7-458f-961b-6aadc592ef6a'::uuid, 'Logistics', 'JHI'),
    ('5d472374-66d1-499f-89bb-e6bb405995e4'::uuid, 'Logistics', 'JHI'),
    ('6b31b9bd-81e4-4a0e-9134-716fdfbf4a73'::uuid, 'Logistics', 'JHI'),
    ('59e0256e-6b67-43c2-ae62-824996e13a31'::uuid, 'Office', 'JHI'),
    ('45c4171e-b4b6-4aa4-a563-d71314c2db4b'::uuid, 'Retail', 'JHI'),
    ('2e959108-a9f6-4c27-8ea7-dd2a50c23a13'::uuid, 'Retail', 'JHI'),
    ('6d60f106-b07d-4372-8278-e1e834a87409'::uuid, 'Retail', 'JHI'),
    ('66de070d-7e3b-4790-865b-f926b8e3a294'::uuid, 'Retail', 'JHI'),
    ('34ebd3a5-8d7e-4919-8f12-da507d5760e4'::uuid, 'Retail', 'JHI')
) AS v(site_id, sector, agency)
JOIN public.managing_agencies ma
  ON ma.name = v.agency
WHERE s.id = v.site_id
  AND ma.client_id = s.client_id;

-- Repair the Fortress portal user stranded by the old UNIQUE(client_id):
-- Client role, no mapping, so their portal is empty. Fund-level user — sees
-- the whole portfolio (managing_agency_id stays NULL).
INSERT INTO public.user_clients (id, user_id, client_id)
SELECT gen_random_uuid(), p.id, c.id
FROM public.profiles p
CROSS JOIN public.clients c
WHERE p.email = 'delanged@fortressfund.co.za'
  AND c.name = 'Fortress_Fund'
  AND EXISTS (SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = p.id AND ur.role = 'Client')
  AND NOT EXISTS (SELECT 1 FROM public.user_clients uc
                  WHERE uc.user_id = p.id);
