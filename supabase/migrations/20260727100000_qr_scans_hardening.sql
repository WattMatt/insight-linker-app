-- qr_scans hardening: the table has existed since 20251014140001 but nothing
-- ever wrote to it. Scan capture lands in the qr-redirect edge function
-- (service role), so the blanket anon INSERT policy is dropped — the only
-- client-side insert is the signed-in "landing" presence row.
-- PROD APPLY: Supabase Management API database/query (project oltzgidkjxwsukvkomof),
-- NOT supabase db push (prod schema is ahead of schema_migrations).
--
-- Idempotent: all policies are dropped-if-exists before (re)creation,
-- so this migration is safe to re-run.

ALTER TABLE public.qr_scans
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'redirect';

DO $$ BEGIN
  ALTER TABLE public.qr_scans
    ADD CONSTRAINT qr_scans_source_check CHECK (source IN ('redirect', 'landing'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Analytics access paths: per-subsection recency and global time-window scans.
CREATE INDEX IF NOT EXISTS idx_qr_scans_subsection_scanned
  ON public.qr_scans (subsection_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_scans_scanned_at
  ON public.qr_scans (scanned_at DESC);

-- Close the open spam surface: anon INSERT WITH CHECK (true) is unused once
-- the redirect writes via service role.
DROP POLICY IF EXISTS "Anyone can insert scans" ON public.qr_scans;
DROP POLICY IF EXISTS "Signed-in landing logs own scan" ON public.qr_scans;

CREATE POLICY "Signed-in landing logs own scan"
  ON public.qr_scans FOR INSERT TO authenticated
  WITH CHECK (scanned_by = auth.uid() AND source = 'landing');

-- Existing cleanup calls in SiteDetail/useSubsectionDetail were silent no-ops
-- (no DELETE policy). Make them real for Admins.
DROP POLICY IF EXISTS "Admins can delete scans" ON public.qr_scans;

CREATE POLICY "Admins can delete scans"
  ON public.qr_scans FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'Admin'::app_role));
