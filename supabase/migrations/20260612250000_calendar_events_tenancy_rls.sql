-- C2: give calendar_events real tenancy + attribution and replace the permissive
-- "any authenticated user full access" policy with role-aware RLS.
-- Before this, any authenticated user (incl. Client/Contractor) could read/update/delete
-- every tenant's events, and the client portal "scoped" only by a free-text site_name match.

-- 1. Identity / attribution columns
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS site_id    uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- 2. Backfill site_id from the free-text label (best-effort exact match; ~9/41 have no
--    matching site and stay NULL — those are orphans staff should re-link).
UPDATE public.calendar_events ce
   SET site_id = s.id
  FROM public.sites s
 WHERE s.name = ce.site_name AND ce.site_id IS NULL;

-- 3. Value constraints (M1) — existing data already conforms.
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_status_check
  CHECK (status IS NULL OR status IN ('Scheduled','In Progress','Completed'));
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_priority_check
  CHECK (priority IS NULL OR priority IN ('Low','Medium','High'));

-- 4. Role-aware RLS (replaces the single permissive policy)
DROP POLICY IF EXISTS "All authenticated users full access to calendar_events" ON public.calendar_events;

-- Staff (Admin / User) — full CRUD on all events.
CREATE POLICY "Staff manage calendar events"
  ON public.calendar_events FOR ALL
  USING (has_role(auth.uid(), 'Admin'::app_role) OR has_role(auth.uid(), 'User'::app_role))
  WITH CHECK (has_role(auth.uid(), 'Admin'::app_role) OR has_role(auth.uid(), 'User'::app_role));

-- Clients — read-only, scoped to events for their own sites (deliberately NOT a
-- loose USING(true) read policy, so the scoping actually holds at the DB layer).
CREATE POLICY "Clients view their calendar events"
  ON public.calendar_events FOR SELECT
  USING (
    has_role(auth.uid(), 'Client'::app_role)
    AND site_id IN (SELECT id FROM public.sites WHERE client_id = get_user_client_id())
  );

NOTIFY pgrst, 'reload schema';
