-- QR platform: public verdict exposure.
--
-- Part A extends get_public_subsection (20260610113000_public_rpcs_phase1.sql) with a
-- single new top-level 'verdict' key so the anon QR landing page can show COC pass/fail
-- state. Part B adds get_public_site_register, a new curated RPC that rolls up COC
-- compliance counts for an entire site (for a future public site-level QR/portfolio view).
--
-- Fully-public verdict exposure per user decision 2026-07-27 — the anon-readable payload
-- is limited to: coc_required, status, cert_number, issue_date, expiry_date.
-- Raw failure reasons (subsections.coc_failure_reasons), the certifying issuer, and SANS
-- rule detail (coc_certificates.*) are deliberately NOT exposed by either RPC below.
-- reviewed_at is also NOT exposed — subsections.coc_reviewed_at has zero writers in the
-- codebase today, so it is dropped from the public contract rather than shipped dead.
--
-- PROD APPLY: via Management API only. Go-live must happen AFTER
-- 20260725100000_coc_register_truth is applied — that migration owns the normalised
-- coc_status vocabulary (Missing|Pending|Pass|Fail|N/A) and the rollup this file reads.
--
-- Idempotent: CREATE OR REPLACE throughout; safe to re-run.

-- ── Part A: add 'verdict' to the existing QR landing page RPC ────────────────────────
-- Entire body reproduced verbatim from 20260610113000_public_rpcs_phase1.sql:22-50;
-- settings/subsection/site/categories/snags keys are unchanged. Only 'verdict' is new.
CREATE OR REPLACE FUNCTION public.get_public_subsection(p_subsection_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM subsections WHERE id = p_subsection_id) THEN NULL
    ELSE jsonb_build_object(
      'settings', (SELECT jsonb_build_object('company_name', company_name, 'company_logo_url', company_logo_url)
                   FROM settings ORDER BY created_at LIMIT 1),
      'subsection', (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'tenant_name', s.tenant_name)
                     FROM subsections s WHERE s.id = p_subsection_id),
      'site', (SELECT jsonb_build_object('id', si.id, 'name', si.name)
               FROM subsections s JOIN sites si ON si.id = s.site_id WHERE s.id = p_subsection_id),
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', dc.id, 'name', dc.name, 'order_index', dc.order_index,
          'subsection_documents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('id', sd.id, 'file_name', sd.file_name,
                   'file_url', sd.file_url, 'uploaded_at', sd.uploaded_at) ORDER BY sd.uploaded_at)
            FROM subsection_documents sd WHERE sd.category_id = dc.id), '[]'::jsonb)
        ) ORDER BY dc.order_index)
        FROM document_categories dc WHERE dc.subsection_id = p_subsection_id), '[]'::jsonb),
      'snags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', sn.id, 'title', sn.title, 'description', sn.description,
               'status', sn.status, 'risk_level', sn.risk_level, 'created_at', sn.created_at) ORDER BY sn.created_at DESC)
        FROM snags sn WHERE sn.subsection_id = p_subsection_id), '[]'::jsonb),
      -- cert/issue/expiry come from the governing COC document (same classification as
      -- the rollup) — subsections.coc_number/coc_issue_date are legacy-backfill columns
      -- and NOT authoritative.
      'verdict', (
        SELECT CASE WHEN s.is_coc_required THEN jsonb_build_object(
          'coc_required', s.is_coc_required,
          'status', s.coc_status,
          'cert_number', gov.coc_number,
          'issue_date', gov.coc_issue_date,
          'expiry_date', gov.coc_expiry_date
        ) ELSE NULL END
        FROM subsections s
        LEFT JOIN LATERAL (
          SELECT sd.coc_number, sd.coc_issue_date, sd.coc_expiry_date
          FROM subsection_documents sd
          JOIN document_categories c ON c.id = sd.category_id
          WHERE sd.subsection_id = s.id
            AND c.name ILIKE '%coc%'
            AND c.name NOT ILIKE '%validation%'
            AND c.name NOT ILIKE '%report%'
          ORDER BY (sd.coc_status IN ('Pass','Approved','Valid')) DESC,
                   sd.coc_issue_date DESC NULLS LAST,
                   sd.uploaded_at DESC
          LIMIT 1
        ) gov ON true
        WHERE s.id = p_subsection_id)
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.get_public_subsection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_subsection(uuid) TO anon, authenticated;

-- ── Part B: site-level register rollup (new) ─────────────────────────────────────────
-- Pass/Fail synonym sets below are copied verbatim from the register-truth rollup
-- (rollup_subsection_coc_status in 20260725100000_coc_register_truth.sql:14-18):
--   Fail ∈ ('Fail','Failed','Rejected'), Pass ∈ ('Pass','Approved','Valid').
-- In practice subsections.coc_status is already normalised to just
-- Missing|Pending|Pass|Fail|N/A (CHECK constraint added in 20260611160000, and the
-- rollup itself only ever writes one of those five values) — the extra synonyms can
-- never match on this column today, but are kept so this stays in lockstep with the
-- rollup's canonical vocabulary if that ever changes.
--
-- Bare-ID access (no token) is deliberate: the site register aggregates per-subsection
-- verdicts that are each already public via printed QR stickers; the aggregate exposes
-- nothing not already reachable. last_import timestamp is the only site-level addition.
CREATE OR REPLACE FUNCTION public.get_public_site_register(p_site_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM sites WHERE id = p_site_id) THEN NULL
    ELSE jsonb_build_object(
      'settings', (SELECT jsonb_build_object('company_name', company_name, 'company_logo_url', company_logo_url)
                   FROM settings ORDER BY created_at LIMIT 1),
      'site', (SELECT jsonb_build_object('id', si.id, 'name', si.name)
               FROM sites si WHERE si.id = p_site_id),
      'counts', (
        SELECT jsonb_build_object(
          'required', COUNT(*) FILTER (WHERE s.is_coc_required),
          'pass',     COUNT(*) FILTER (WHERE s.is_coc_required AND s.coc_status IN ('Pass','Approved','Valid')),
          'fail',     COUNT(*) FILTER (WHERE s.is_coc_required AND s.coc_status IN ('Fail','Failed','Rejected')),
          'pending',  COUNT(*) FILTER (WHERE s.is_coc_required AND s.coc_status = 'Pending'),
          'missing',  COUNT(*) FILTER (WHERE s.is_coc_required AND (s.coc_status IS NULL OR s.coc_status = 'Missing'))
        )
        FROM subsections s WHERE s.site_id = p_site_id),
      'last_import', (SELECT MAX(cib.created_at) FROM coc_import_batches cib WHERE cib.site_id = p_site_id)
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.get_public_site_register(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_register(uuid) TO anon, authenticated;

-- ── Supporting indexes (these tables are now on anon-reachable hot paths) ────────────
CREATE INDEX IF NOT EXISTS idx_subsection_documents_subsection ON public.subsection_documents (subsection_id);
CREATE INDEX IF NOT EXISTS idx_document_categories_subsection ON public.document_categories (subsection_id);
CREATE INDEX IF NOT EXISTS idx_coc_import_batches_site ON public.coc_import_batches (site_id);
