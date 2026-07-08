-- An empty site (no subsections captured) has NO health score.
--
-- The capture job used to store a fabricated 100 for such sites (every factor's
-- denominator is empty, so each scored vacuously-100) — 920 rows as of 2026-07-08,
-- making 40 of 76 sites read as a perfect 100% on the site cards, dashboard and
-- reports. The job now stores NULL for empty sites (computeSiteHealth); align the
-- history so trends and portal badges stop serving the fabricated numbers.
UPDATE public.site_health_snapshots
SET health_score = NULL
WHERE total_subsections = 0
  AND health_score IS NOT NULL;
