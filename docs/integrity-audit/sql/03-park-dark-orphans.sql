-- Stage 4b Phase 1 — park dark orphans (no recoverable shop info)
--
-- Run AFTER 01-create-proposal-table.sql and 02-discovery-fuzzy-match.sql.
--
-- These are the ~173 orphans Stage 1 audit identified as "completely dark"
-- (no shop_name, no shop_number anywhere — including json_data). Fuzzy
-- matching cannot recover them. This script files a proposal per dark
-- orphan with `source = 'needs_decision'` and `status = 'pending_review'`
-- so they're visible in the proposal table but won't be auto-applied.
--
-- Phase 3 (inspector outreach + archive) splits these into:
--   - Recent (90d) Completed at top-4 sites → inspector outreach
--   - Everything else                       → reversible archive
--
-- See 2026-05-27-remediation-strategy.md Phase 3 ("Dark orphan resolution").

WITH dark_orphans AS (
  SELECT i.id, i.site_id, i.status, i.created_at, i.inspector_name, i.title
    FROM inspections i
   WHERE i.subsection_id IS NULL
     AND COALESCE(
           NULLIF(btrim(i.shop_name), ''),
           i.json_data->'generalInfo'->>'shopName',
           NULLIF(btrim(i.shop_number), ''),
           i.json_data->'generalInfo'->>'shopNumber'
         ) IS NULL
)

INSERT INTO integrity.inspection_remediation_proposals (
  inspection_id,
  original_subsection_id, original_site_id,
  original_shop_name, original_shop_number,
  proposed_subsection_id, proposed_site_id,
  proposed_shop_name, proposed_shop_number,
  confidence, evidence, source, status
)
SELECT
  d.id,
  NULL, d.site_id,
  NULL, NULL,
  NULL, d.site_id,  -- proposed_site_id mirrors original_site_id (preserve)
  NULL, NULL,
  0,
  jsonb_build_object(
    'rule', 'no_recoverable_shop_info',
    'inspection_status', d.status,
    'created_at', d.created_at::text,
    'inspector_name', d.inspector_name,
    'inspection_title', d.title,
    'discovered_at', now()::text,
    'triage', CASE
      WHEN d.status = 'Completed'
       AND d.created_at > now() - interval '90 days'
       AND d.site_id IN (
         SELECT id FROM sites
          WHERE name ILIKE '%Evaton Mall%'
             OR name ILIKE '%Prince Buthelezi%'
             OR name ILIKE '%Fourways Value%'
             OR name ILIKE '%Palm Springs%'
       )
        THEN 'inspector_outreach'
      ELSE 'archive_candidate'
    END
  ),
  'needs_decision',
  'pending_review'
FROM dark_orphans d
WHERE NOT EXISTS (
  SELECT 1
    FROM integrity.inspection_remediation_proposals p
   WHERE p.inspection_id = d.id
     AND p.status NOT IN ('reverted','superseded')
);

-- ─────────────────────────────────────────────────────────────────────
-- Dark-orphan triage report.
-- ─────────────────────────────────────────────────────────────────────

SELECT
  evidence->>'triage' AS triage,
  evidence->>'inspection_status' AS status,
  count(*)            AS proposal_count
FROM integrity.inspection_remediation_proposals
WHERE source = 'needs_decision' AND status = 'pending_review'
GROUP BY 1, 2
ORDER BY 1, 2;

-- ─────────────────────────────────────────────────────────────────────
-- Inspector-outreach CSV export — feed this to ops.
-- Save the SELECT result as CSV from Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────

SELECT
  left(inspection_id::text, 8) AS insp_short,
  inspection_id,
  evidence->>'inspector_name'  AS inspector,
  evidence->>'inspection_status' AS status,
  evidence->>'inspection_title'  AS title,
  s.name                         AS site_name,
  (evidence->>'created_at')::timestamptz::date AS created_date
FROM integrity.inspection_remediation_proposals p
LEFT JOIN sites s ON s.id = p.original_site_id
WHERE source = 'needs_decision'
  AND status = 'pending_review'
  AND evidence->>'triage' = 'inspector_outreach'
ORDER BY (evidence->>'created_at')::timestamptz DESC;
