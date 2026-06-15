-- Remove the inspection sign-off / signatures feature.
-- The frontend (capture UI, report sections, portal display, template preview pages,
-- and the api-reports edge function) has been stripped of all signature usage.
--
-- Applied to PROD via the Supabase Management API on 2026-06-15 (prod schema is ahead
-- of schema_migrations — see the `prod-migration-drift` note; this file is for repo parity).
--
-- 1) Drop the `signatures` aggregation from the public drilldown RPC so it no longer
--    references inspection_signatures.
-- 2) Drop the (empty: 0 rows) inspection_signatures table and its empty snapshot.
--    No inbound FKs / views / triggers depended on it; the only function reference
--    was this RPC, fixed below.

CREATE OR REPLACE FUNCTION public.get_public_subsection_review(p_token text, p_subsection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_link public.client_access_links;
  v_site_id uuid;
  v_site_client_id uuid;
BEGIN
  v_link := public._share_link(p_token);
  IF v_link.id IS NULL THEN
    RETURN NULL;  -- invalid/expired token
  END IF;

  SELECT sub.site_id, si.client_id INTO v_site_id, v_site_client_id
  FROM subsections sub JOIN sites si ON si.id = sub.site_id
  WHERE sub.id = p_subsection_id;
  IF v_site_id IS NULL THEN
    RETURN NULL;  -- subsection does not exist
  END IF;

  -- Scope check (Vuln 6): the subsection's site must be inside the token's scope.
  IF v_link.client_id IS NOT NULL THEN
    IF v_site_client_id <> v_link.client_id THEN RETURN NULL; END IF;
  ELSIF v_link.site_id IS NOT NULL THEN
    IF v_site_id <> v_link.site_id THEN RETURN NULL; END IF;
  ELSIF v_link.subsection_id IS NOT NULL THEN
    IF p_subsection_id <> v_link.subsection_id THEN RETURN NULL; END IF;
  ELSE
    RETURN NULL;  -- link has no usable scope
  END IF;

  RETURN jsonb_build_object(
    'settings', (SELECT jsonb_build_object('company_name', company_name, 'company_logo_url', company_logo_url)
                 FROM settings ORDER BY created_at LIMIT 1),
    'subsection', (SELECT jsonb_build_object(
        'id', sub.id, 'name', sub.name, 'tenant_name', sub.tenant_name, 'description', sub.description,
        'category', sub.category, 'is_coc_required', sub.is_coc_required,
        'metering_status', sub.metering_status, 'meter_serial_number', sub.meter_serial_number, 'ct_ratio', sub.ct_ratio)
      FROM subsections sub WHERE sub.id = p_subsection_id),
    'site', (SELECT jsonb_build_object('id', si.id, 'name', si.name, 'address', si.address, 'client_logo_url', si.client_logo_url)
             FROM sites si WHERE si.id = v_site_id),
    'client', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'company_name', c.company_name, 'logo_url', c.logo_url)
               FROM clients c WHERE c.id = v_site_client_id),
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sd.id, 'file_name', sd.file_name, 'file_url', sd.file_url,
        'uploaded_at', sd.uploaded_at, 'file_size', sd.file_size,
        'category_name', dc.name) ORDER BY sd.uploaded_at DESC)
      FROM subsection_documents sd
      LEFT JOIN document_categories dc ON dc.id = sd.category_id
      WHERE sd.subsection_id = p_subsection_id), '[]'::jsonb),
    'snags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sn.id, 'title', sn.title, 'description', sn.description, 'status', sn.status,
        'risk_level', sn.risk_level, 'created_at', sn.created_at,
        'rectified_at', sn.rectified_at, 'rectification_notes', sn.rectification_notes) ORDER BY sn.created_at DESC)
      FROM snags sn WHERE sn.subsection_id = p_subsection_id), '[]'::jsonb),
    'inspections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'title', i.title, 'status', i.status, 'inspection_date', i.inspection_date,
        'inspector_name', i.inspector_name, 'quality_rating', i.quality_rating,
        'description', i.description, 'json_data', i.json_data,
        'template_name', it.name, 'template_sections', it.sections
      ) ORDER BY i.inspection_date DESC)
      FROM inspections i
      LEFT JOIN inspection_templates it ON it.id = i.template_id
      WHERE i.subsection_id = p_subsection_id), '[]'::jsonb),
    'floor_plans', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', fp.id, 'file_name', fp.file_name, 'file_url', fp.file_url,
        'pins_count', (SELECT count(*) FROM floor_plan_pins p WHERE p.floor_plan_id = fp.id)))
      FROM subsection_floor_plans fp WHERE fp.subsection_id = p_subsection_id), '[]'::jsonb)
  );
END; $function$;

DROP TABLE IF EXISTS public.inspection_signatures CASCADE;
DROP TABLE IF EXISTS public.inspection_signatures_snap_20260421 CASCADE;
