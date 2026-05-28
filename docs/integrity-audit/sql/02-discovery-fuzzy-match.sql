-- Stage 4b Phase 1 — populate proposals for orphans with recoverable shop info
--
-- Run AFTER 01-create-proposal-table.sql.
-- Run against: oltzgidkjxwsukvkomof (WM Compliance, production).
-- Idempotent: ON CONFLICT DO NOTHING on (inspection_id, status='pending_review').
--
-- Inserts one proposal per orphan inspection that has a candidate subsection
-- match at the same site. Each row carries a confidence band (60–100) and a
-- jsonb `evidence` blob describing which rule fired.
--
-- Expected output (from Stage 1 scorecard estimates — actual counts will vary):
--   confidence 100  → ~3   (the strict-equality matches already found by
--                           useSubsectionDetail.ts:366-399)
--   confidence  95  → ~25  ("Shop {n}" exact)
--   confidence  90  → ~15  (number exact)
--   confidence  70  → ~10  (substring)
--   confidence  60  → ~5   (regex on number-in-name)
--   Total           → ~55–60 of the 60 orphans with shop info
--   (The 173 dark orphans are handled by 03-park-dark-orphans.sql.)

WITH orphans AS (
  SELECT
    i.id,
    i.site_id,
    i.status,
    COALESCE(
      NULLIF(btrim(i.shop_name), ''),
      i.json_data->'generalInfo'->>'shopName'
    ) AS shop_name,
    COALESCE(
      NULLIF(btrim(i.shop_number), ''),
      i.json_data->'generalInfo'->>'shopNumber'
    ) AS shop_number
  FROM inspections i
  WHERE i.subsection_id IS NULL
),

candidates AS (
  SELECT
    o.id   AS inspection_id,
    o.site_id,
    o.shop_name,
    o.shop_number,
    o.status,
    s.id   AS subsection_id,
    s.name AS subsection_name,
    CASE
      WHEN o.shop_name IS NOT NULL
       AND lower(btrim(s.name)) = lower(btrim(o.shop_name))            THEN 100
      WHEN o.shop_number IS NOT NULL
       AND lower(btrim(s.name)) = lower('shop ' || btrim(o.shop_number)) THEN  95
      WHEN o.shop_number IS NOT NULL
       AND lower(btrim(s.name)) = lower(btrim(o.shop_number))           THEN  90
      WHEN o.shop_name IS NOT NULL
       AND lower(btrim(s.name)) LIKE '%' || lower(btrim(o.shop_name)) || '%'
                                                                        THEN  70
      WHEN o.shop_number IS NOT NULL
       AND s.name ~* ('\m' || regexp_replace(btrim(o.shop_number), '[^0-9A-Za-z]', '', 'g') || '\M')
                                                                        THEN  60
      ELSE 0
    END AS confidence,
    CASE
      WHEN o.shop_name IS NOT NULL
       AND lower(btrim(s.name)) = lower(btrim(o.shop_name))            THEN 'name_exact'
      WHEN o.shop_number IS NOT NULL
       AND lower(btrim(s.name)) = lower('shop ' || btrim(o.shop_number)) THEN 'shop_number_exact_with_prefix'
      WHEN o.shop_number IS NOT NULL
       AND lower(btrim(s.name)) = lower(btrim(o.shop_number))           THEN 'shop_number_exact'
      WHEN o.shop_name IS NOT NULL
       AND lower(btrim(s.name)) LIKE '%' || lower(btrim(o.shop_name)) || '%'
                                                                        THEN 'name_substring'
      WHEN o.shop_number IS NOT NULL
       AND s.name ~* ('\m' || regexp_replace(btrim(o.shop_number), '[^0-9A-Za-z]', '', 'g') || '\M')
                                                                        THEN 'shop_number_regex_in_name'
      ELSE 'no_match'
    END AS rule
  FROM orphans o
  JOIN subsections s ON s.site_id = o.site_id
),

best_per_orphan AS (
  SELECT DISTINCT ON (inspection_id)
    inspection_id, site_id, shop_name, shop_number, status,
    subsection_id, subsection_name, confidence, rule
  FROM candidates
  WHERE confidence > 0
  ORDER BY inspection_id, confidence DESC, subsection_name ASC
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
  b.inspection_id,
  NULL, b.site_id,
  b.shop_name, b.shop_number,
  b.subsection_id, b.site_id,
  b.subsection_name,
  COALESCE(b.shop_number, b.shop_name),
  b.confidence,
  jsonb_build_object(
    'rule', b.rule,
    'matched_subsection_name', b.subsection_name,
    'orphan_shop_name', b.shop_name,
    'orphan_shop_number', b.shop_number,
    'orphan_status_at_discovery', b.status,
    'discovered_at', now()::text
  ),
  'fuzzy_match',
  'pending_review'
FROM best_per_orphan b
WHERE NOT EXISTS (
  SELECT 1
    FROM integrity.inspection_remediation_proposals p
   WHERE p.inspection_id = b.inspection_id
     AND p.status NOT IN ('reverted','superseded')
);

-- ─────────────────────────────────────────────────────────────────────
-- Discovery report — confidence histogram.
-- ─────────────────────────────────────────────────────────────────────

SELECT
  confidence,
  count(*) AS proposal_count,
  array_agg(jsonb_extract_path_text(evidence, 'rule') ORDER BY (evidence->>'rule')) FILTER (WHERE evidence ? 'rule') AS rules_used
FROM integrity.inspection_remediation_proposals
WHERE source = 'fuzzy_match' AND status = 'pending_review'
GROUP BY confidence
ORDER BY confidence DESC;

-- ─────────────────────────────────────────────────────────────────────
-- Top-10 sample at each band — sanity check before approval.
-- ─────────────────────────────────────────────────────────────────────

SELECT
  confidence,
  left(inspection_id::text, 8) AS insp,
  evidence->>'rule'             AS rule,
  evidence->>'orphan_shop_name' AS orphan_name,
  evidence->>'orphan_shop_number' AS orphan_number,
  proposed_shop_name            AS proposed_name
FROM integrity.inspection_remediation_proposals
WHERE source = 'fuzzy_match' AND status = 'pending_review'
ORDER BY confidence DESC, inspection_id
LIMIT 30;
