-- Per-site daily health snapshots — powers the KPI dashboard "Trends" card.
-- Written by the scheduled capture job (service role bypasses RLS); read by authenticated users.
CREATE TABLE IF NOT EXISTS public.site_health_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  captured_at date NOT NULL DEFAULT current_date,
  health_score integer,
  completion_pct integer,
  outstanding_count integer,
  blocking_count integer,
  open_snags integer,
  ready_count integer,
  total_subsections integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, captured_at)
);

CREATE INDEX IF NOT EXISTS idx_site_health_snapshots_site_date
  ON public.site_health_snapshots (site_id, captured_at DESC);

ALTER TABLE public.site_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users (same visibility model as other site data).
CREATE POLICY "Authenticated users can read site health snapshots"
  ON public.site_health_snapshots
  FOR SELECT
  TO authenticated
  USING (true);
