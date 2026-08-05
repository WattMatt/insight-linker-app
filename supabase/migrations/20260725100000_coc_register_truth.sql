-- Register-truth COC model:
-- 1. The imported Verification workbook verdict (coc_certificates.verdict) is the ONLY
--    source of a COC document's Pass/Fail; the manual verdict UI is removed in the app.
-- 2. Expiry no longer silently fails a Pass — re-verification (new imports) invalidates
--    old certs. coc_expiry_date stays as display-only data.
-- 3. One-time backfill: stamp register-linked documents from their cert verdict; reset
--    unlinked COC-category docs to Pending ("awaiting verification").

-- (1+2) Roll-up without the expired-Pass branch (supersedes 20260612140000).
CREATE OR REPLACE FUNCTION public.rollup_subsection_coc_status(p_subsection_id uuid)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE v_status text;
BEGIN
  WITH classified AS (
    SELECT CASE
      WHEN d.coc_status IN ('Fail','Failed','Rejected') THEN 'Fail'
      WHEN d.coc_status IN ('Pass','Approved','Valid')  THEN 'Pass'
      ELSE 'Pending'
    END AS s
    FROM public.subsection_documents d
    JOIN public.document_categories c ON c.id = d.category_id
    WHERE d.subsection_id = p_subsection_id
      AND c.name ILIKE '%coc%'
      AND c.name NOT ILIKE '%validation%'
      AND c.name NOT ILIKE '%report%'
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM classified)               THEN 'Missing'
    WHEN EXISTS (SELECT 1 FROM classified WHERE s = 'Fail')  THEN 'Fail'
    WHEN EXISTS (SELECT 1 FROM classified WHERE s = 'Pass')  THEN 'Pass'
    ELSE 'Pending'
  END INTO v_status;

  UPDATE public.subsections
     SET coc_status = v_status, updated_at = now()
   WHERE id = p_subsection_id
     AND coalesce(coc_status,'') <> v_status;

  PERFORM public.apply_subsection_recompute(p_subsection_id);
END;
$fn$;

-- (3) One-time backfill.
DO $do$
DECLARE
  v_linked  int := 0;
  v_matched int := 0;
  v_reset   int := 0;
BEGIN
  -- 3a. Docs directly linked from the register (coc_certificates.coc_document_id).
  --     If several certs share one doc, Fail wins over Pass wins over Pending.
  UPDATE public.subsection_documents d
     SET coc_status = v.status
    FROM (
      SELECT cert.coc_document_id AS doc_id,
             CASE WHEN bool_or(upper(coalesce(cert.verdict,'')) LIKE 'FAIL%') THEN 'Fail'
                  WHEN bool_or(upper(coalesce(cert.verdict,'')) LIKE 'PASS%') THEN 'Pass'
                  ELSE 'Pending' END AS status
        FROM public.coc_certificates cert
       WHERE cert.coc_document_id IS NOT NULL
       GROUP BY cert.coc_document_id
    ) v
   WHERE d.id = v.doc_id
     AND coalesce(d.coc_status,'') <> v.status;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  -- 3b. Docs matched by subsection + normalised cert number but not yet linked.
  UPDATE public.subsection_documents d
     SET coc_status = v.status
    FROM (
      SELECT cert.subsection_id, cert.cert_no_norm,
             CASE WHEN bool_or(upper(coalesce(cert.verdict,'')) LIKE 'FAIL%') THEN 'Fail'
                  WHEN bool_or(upper(coalesce(cert.verdict,'')) LIKE 'PASS%') THEN 'Pass'
                  ELSE 'Pending' END AS status
        FROM public.coc_certificates cert
       WHERE cert.subsection_id IS NOT NULL AND coalesce(cert.cert_no_norm,'') <> ''
       GROUP BY cert.subsection_id, cert.cert_no_norm
    ) v
   WHERE d.subsection_id = v.subsection_id
     AND d.coc_number IS NOT NULL
     AND upper(regexp_replace(d.coc_number, '[\s-]+', '', 'g')) = v.cert_no_norm
     AND NOT EXISTS (SELECT 1 FROM public.coc_certificates c2 WHERE c2.coc_document_id = d.id)
     AND coalesce(d.coc_status,'') <> v.status;
  GET DIAGNOSTICS v_matched = ROW_COUNT;

  -- 3c. COC-certificate docs with NO register backing => Pending (awaiting verification).
  --     Honest outcome of register-truth: manual Passes without register backing regress.
  UPDATE public.subsection_documents d
     SET coc_status = 'Pending'
    FROM public.document_categories c
   WHERE c.id = d.category_id
     AND c.name ILIKE '%coc%' AND c.name NOT ILIKE '%validation%' AND c.name NOT ILIKE '%report%'
     AND NOT EXISTS (SELECT 1 FROM public.coc_certificates cert WHERE cert.coc_document_id = d.id)
     AND NOT EXISTS (
       SELECT 1 FROM public.coc_certificates cert
        WHERE cert.subsection_id = d.subsection_id
          AND d.coc_number IS NOT NULL
          AND cert.cert_no_norm = upper(regexp_replace(d.coc_number, '[\s-]+', '', 'g'))
     )
     AND coalesce(d.coc_status,'') <> 'Pending';
  GET DIAGNOSTICS v_reset = ROW_COUNT;

  RAISE NOTICE 'coc_register_truth backfill: % linked stamped, % cert-no matched stamped, % unbacked reset to Pending',
    v_linked, v_matched, v_reset;
END; $do$;

-- Recompute every subsection's coc_status + is_compliant under the new rules.
DO $do$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.subsections WHERE deleted_at IS NULL LOOP
    PERFORM public.rollup_subsection_coc_status(r.id);
  END LOOP;
END; $do$;

NOTIFY pgrst, 'reload schema';
