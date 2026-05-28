-- Stage 4b Phase 1 — proposal table for safe orphan remediation
--
-- Run against: oltzgidkjxwsukvkomof (WM Compliance, production).
-- Run as: postgres role (Supabase SQL Editor "service" connection).
-- Idempotent: safe to re-run. Schema and table use IF NOT EXISTS.
--
-- See 2026-05-27-remediation-strategy.md "The proposal table — schema sketch".
--
-- This script creates ONLY structure. Discovery and population come from
-- 02-discovery-fuzzy-match.sql and 03-park-dark-orphans.sql.

CREATE SCHEMA IF NOT EXISTS integrity;

-- ─────────────────────────────────────────────────────────────────────
-- Proposal table — one row per orphan inspection candidate.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integrity.inspection_remediation_proposals (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The orphan we're proposing to fix.
  inspection_id           uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,

  -- Snapshot of the live row at discovery time. Apply uses these to verify
  -- the row hasn't drifted; revert restores from these exact values.
  original_subsection_id  uuid,        -- always NULL for the Stage 4b cohort
  original_site_id        uuid,
  original_shop_name      text,
  original_shop_number    text,

  -- What we propose to write to the live row.
  proposed_subsection_id  uuid REFERENCES subsections(id),
  proposed_site_id        uuid REFERENCES sites(id),
  proposed_shop_name      text,
  proposed_shop_number    text,

  -- Why we propose this.
  confidence              int NOT NULL CHECK (confidence BETWEEN 0 AND 100),
  evidence                jsonb NOT NULL,
  source                  text NOT NULL
    CHECK (source IN ('fuzzy_match','inspector_outreach','manual','needs_decision')),

  -- Workflow state.
  status                  text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','approved','rejected','applied','reverted','superseded')),
  reviewed_by             text,
  reviewed_at             timestamptz,
  applied_at              timestamptz,
  reverted_at             timestamptz,
  notes                   text,

  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS irp_status_idx
  ON integrity.inspection_remediation_proposals (status);

CREATE INDEX IF NOT EXISTS irp_inspection_idx
  ON integrity.inspection_remediation_proposals (inspection_id);

CREATE INDEX IF NOT EXISTS irp_confidence_idx
  ON integrity.inspection_remediation_proposals (confidence DESC)
  WHERE status IN ('pending_review','approved');

COMMENT ON TABLE integrity.inspection_remediation_proposals IS
  'Stage 4b remediation proposals — see insight-linker-app/docs/integrity-audit/2026-05-27-remediation-strategy.md';

-- ─────────────────────────────────────────────────────────────────────
-- Apply function — idempotent, audited.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION integrity.apply_remediation_proposal(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r integrity.inspection_remediation_proposals%ROWTYPE;
BEGIN
  SELECT * INTO r
    FROM integrity.inspection_remediation_proposals
   WHERE id = p_id AND status = 'approved'
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % is not in status=approved (cannot apply)', p_id;
  END IF;

  UPDATE inspections
     SET subsection_id = COALESCE(r.proposed_subsection_id, subsection_id),
         site_id       = COALESCE(r.proposed_site_id,       site_id),
         shop_name     = COALESCE(r.proposed_shop_name,     shop_name),
         shop_number   = COALESCE(r.proposed_shop_number,   shop_number),
         updated_at    = now()
   WHERE id = r.inspection_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inspection % not found (proposal %)', r.inspection_id, p_id;
  END IF;

  UPDATE integrity.inspection_remediation_proposals
     SET status = 'applied', applied_at = now()
   WHERE id = p_id;
END;
$$;

COMMENT ON FUNCTION integrity.apply_remediation_proposal(uuid) IS
  'Apply an approved remediation proposal to the live inspections row. Use integrity.revert_remediation_proposal to undo.';

-- ─────────────────────────────────────────────────────────────────────
-- Revert function — symmetric undo for any applied proposal.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION integrity.revert_remediation_proposal(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r integrity.inspection_remediation_proposals%ROWTYPE;
BEGIN
  SELECT * INTO r
    FROM integrity.inspection_remediation_proposals
   WHERE id = p_id AND status = 'applied'
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % is not in status=applied (cannot revert)', p_id;
  END IF;

  UPDATE inspections
     SET subsection_id = r.original_subsection_id,
         site_id       = r.original_site_id,
         shop_name     = r.original_shop_name,
         shop_number   = r.original_shop_number,
         updated_at    = now()
   WHERE id = r.inspection_id;

  UPDATE integrity.inspection_remediation_proposals
     SET status = 'reverted', reverted_at = now()
   WHERE id = p_id;
END;
$$;

COMMENT ON FUNCTION integrity.revert_remediation_proposal(uuid) IS
  'Undo a previously applied remediation proposal. Restores the live row to original_* values.';

-- ─────────────────────────────────────────────────────────────────────
-- Convenience batch-apply: every approved proposal at >= a confidence floor.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION integrity.apply_approved_at_or_above(min_confidence int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pid uuid;
  applied_count int := 0;
BEGIN
  FOR pid IN
    SELECT id FROM integrity.inspection_remediation_proposals
     WHERE status = 'approved' AND confidence >= min_confidence
     ORDER BY confidence DESC, created_at ASC
  LOOP
    PERFORM integrity.apply_remediation_proposal(pid);
    applied_count := applied_count + 1;
  END LOOP;
  RETURN applied_count;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Verification: row count + index list.
-- ─────────────────────────────────────────────────────────────────────

SELECT 'integrity.inspection_remediation_proposals' AS object,
       (SELECT count(*) FROM integrity.inspection_remediation_proposals) AS row_count;

SELECT indexname FROM pg_indexes WHERE schemaname = 'integrity';
