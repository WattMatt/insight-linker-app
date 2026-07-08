-- Scope site_health_snapshots reads.
--
-- The original policy (20260616110000) was USING (true) for all authenticated users,
-- which let any signed-in client-portal or contractor account read EVERY site's health
-- scores across tenants. Now that the client portal displays these scores, reads must
-- be scoped:
--   * Staff (Admin / User / Moderator) read everything — powers the KPI dashboard.
--   * Clients read only rows for their own sites — powers the portal site cards.
--   * Contractors get no read path: no contractor surface consumes snapshots.
-- Deliberately an affirmative role allowlist rather than the NOT-Client pattern used
-- elsewhere: NOT-based policies silently include users with no role row at all.
-- Writes remain service-role only (the nightly capture job) — there are no write
-- policies on this table, unchanged.

DROP POLICY IF EXISTS "Authenticated users can read site health snapshots"
  ON public.site_health_snapshots;

CREATE POLICY "Staff can read site health snapshots"
  ON public.site_health_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Admin')
    OR public.has_role(auth.uid(), 'User')
    OR public.has_role(auth.uid(), 'Moderator')
  );

CREATE POLICY "Clients can read their own site health snapshots"
  ON public.site_health_snapshots
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'Client')
    AND site_id IN (
      SELECT id FROM public.sites
      WHERE client_id = public.get_user_client_id()
    )
  );
