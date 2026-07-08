-- Product decision (2026-07-08): an unpopulated site (zero subsections) scores 0% —
-- the health score measures progress toward a fully captured, compliant site, so
-- "nothing captured yet" is zero progress. Supersedes the interim backfill
-- (20260708150000) that set these rows to NULL ("no data"); the capture job now
-- stores 0 for empty sites.
UPDATE public.site_health_snapshots
SET health_score = 0
WHERE total_subsections = 0
  AND health_score IS DISTINCT FROM 0;
