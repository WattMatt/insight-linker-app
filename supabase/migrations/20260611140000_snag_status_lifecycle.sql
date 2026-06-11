-- Snag lifecycle: Open -> Rectified -> Closed. Replaces the original
-- ('Open','Closed') constraint and reconciles the code/schema mismatch where the
-- app filtered a 'rectified' status the constraint never allowed.
-- See docs/superpowers/specs/2026-06-11-site-health-marking-redesign-design.md
--
-- PRE-AUDIT (run before applying, then adjust the CASE below if needed):
--   SELECT status, count(*) FROM public.snags GROUP BY status ORDER BY 2 DESC;

ALTER TABLE public.snags DROP CONSTRAINT IF EXISTS snags_status_check;

-- Normalise any legacy/casing values before re-applying the constraint.
UPDATE public.snags
SET status = CASE
  WHEN lower(status) = 'rectified' THEN 'Rectified'
  WHEN lower(status) = 'closed'    THEN 'Closed'
  WHEN lower(status) = 'open'      THEN 'Open'
  ELSE status
END;

-- Snags that were marked done but carry a rectified_at timestamp are treated as Rectified.
UPDATE public.snags
SET status = 'Rectified'
WHERE rectified_at IS NOT NULL AND status NOT IN ('Rectified', 'Closed');

ALTER TABLE public.snags
  ADD CONSTRAINT snags_status_check CHECK (status IN ('Open', 'Rectified', 'Closed'));

NOTIFY pgrst, 'reload schema';
