-- Public QR landing data path — get_public_subsection(uuid)
-- SECURITY DEFINER RPC returning ONLY the public-safe payload for ONE subsection,
-- so the QR page (/public/subsections/:id) no longer needs blanket anon table reads.
-- This is the prerequisite for the Tier 2 anon-read lockdown.
-- Safe to apply anytime: it only ADDS a function; the page keeps working before/after.
--
-- Whitelisted output only (no client email/phone, no internal snag cost/assignee/photos).
-- Replicates the exact shape PublicSubsection.tsx consumes.

CREATE OR REPLACE FUNCTION public.get_public_subsection(p_subsection_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM subsections WHERE id = p_subsection_id) THEN NULL
    ELSE jsonb_build_object(
      'settings', (
        SELECT jsonb_build_object('company_name', company_name, 'company_logo_url', company_logo_url)
        FROM settings ORDER BY created_at LIMIT 1
      ),
      'subsection', (
        SELECT jsonb_build_object(
          'id', s.id, 'name', s.name, 'tenant_name', s.tenant_name, 'description', s.description,
          'category', s.category, 'coc_number', s.coc_number, 'coc_type', s.coc_type,
          'coc_issue_date', s.coc_issue_date, 'is_coc_required', s.is_coc_required,
          'coc_status', s.coc_status, 'metering_status', s.metering_status,
          'meter_serial_number', s.meter_serial_number
        ) FROM subsections s WHERE s.id = p_subsection_id
      ),
      'site', (
        SELECT jsonb_build_object('id', si.id, 'name', si.name, 'address', si.address, 'client_logo_url', si.client_logo_url)
        FROM subsections s JOIN sites si ON si.id = s.site_id WHERE s.id = p_subsection_id
      ),
      'client', (
        SELECT jsonb_build_object('id', c.id, 'name', c.name, 'company_name', c.company_name, 'logo_url', c.logo_url)
        FROM subsections s JOIN sites si ON si.id = s.site_id JOIN clients c ON c.id = si.client_id
        WHERE s.id = p_subsection_id
      ),
      'categories', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', dc.id, 'name', dc.name, 'order_index', dc.order_index,
          'subsection_documents', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id', sd.id, 'file_name', sd.file_name, 'file_url', sd.file_url, 'uploaded_at', sd.uploaded_at
            ) ORDER BY sd.uploaded_at)
            FROM subsection_documents sd WHERE sd.category_id = dc.id
          ), '[]'::jsonb)
        ) ORDER BY dc.order_index)
        FROM document_categories dc WHERE dc.subsection_id = p_subsection_id
      ), '[]'::jsonb),
      'snags', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', sn.id, 'title', sn.title, 'description', sn.description,
          'status', sn.status, 'risk_level', sn.risk_level, 'created_at', sn.created_at
        ) ORDER BY sn.created_at DESC)
        FROM snags sn WHERE sn.subsection_id = p_subsection_id
      ), '[]'::jsonb),
      'coc_validations', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('document_id', cv.document_id, 'status', cv.status))
        FROM coc_validations cv WHERE cv.subsection_id = p_subsection_id
      ), '[]'::jsonb)
    )
  END;
$$;

-- Anonymous QR visitors + logged-in users may call it; nobody else.
REVOKE ALL ON FUNCTION public.get_public_subsection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_subsection(uuid) TO anon, authenticated;
