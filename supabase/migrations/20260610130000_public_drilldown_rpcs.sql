-- Airtight public-share rebuild — Phase 2: review drill-down functions.
-- Token-scoped SECURITY DEFINER functions that return ONLY the scoped payload
-- the site-review and subsection-review pages need, so those pages stop reading
-- tables directly with the anon key. These close the cross-tenant IDORs:
--   Vuln 7 — /review/:token/site/:siteId could load any site by guessing its id.
--   Vuln 6 — /review/:token/subsection/:subsectionId could load any subsection.
-- Scoping is enforced in the DB here against the token's link row, so the client
-- can no longer be trusted to gate access. ADDITIVE ONLY — creates functions.
-- Relies on public._share_link(text) from the Phase 1 migration.

-- ── Site review page (token + site id; scoped to the token's client/site) ─────
CREATE OR REPLACE FUNCTION public.get_public_site_review(p_token text, p_site_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.client_access_links;
  v_site_client_id uuid;
BEGIN
  v_link := public._share_link(p_token);
  IF v_link.id IS NULL THEN
    RETURN NULL;  -- invalid/expired token
  END IF;

  SELECT client_id INTO v_site_client_id FROM sites WHERE id = p_site_id;
  IF v_site_client_id IS NULL THEN
    RETURN NULL;  -- site does not exist
  END IF;

  -- Scope check (Vuln 7): the requested site must be inside the token's scope.
  IF v_link.client_id IS NOT NULL THEN
    IF v_site_client_id <> v_link.client_id THEN RETURN NULL; END IF;
  ELSIF v_link.site_id IS NOT NULL THEN
    IF p_site_id <> v_link.site_id THEN RETURN NULL; END IF;
  ELSE
    RETURN NULL;  -- link is neither client- nor site-scoped
  END IF;

  RETURN jsonb_build_object(
    'settings', (SELECT jsonb_build_object('company_name', company_name, 'company_logo_url', company_logo_url)
                 FROM settings ORDER BY created_at LIMIT 1),
    'site', (SELECT jsonb_build_object('id', s.id, 'name', s.name, 'address', s.address,
               'site_type', s.site_type, 'site_image_url', s.site_image_url,
               'supply_authority', s.supply_authority, 'nominated_max_demand', s.nominated_max_demand)
             FROM sites s WHERE s.id = p_site_id),
    'client', (SELECT jsonb_build_object('id', c.id, 'name', c.name, 'company_name', c.company_name, 'logo_url', c.logo_url)
               FROM sites s JOIN clients c ON c.id = s.client_id WHERE s.id = p_site_id),
    'subsections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sub.id, 'name', sub.name, 'description', sub.description, 'tenant_name', sub.tenant_name,
        'category', sub.category, 'is_coc_required', sub.is_coc_required,
        'metering_status', sub.metering_status, 'meter_serial_number', sub.meter_serial_number
      ) ORDER BY sub.name)
      FROM subsections sub WHERE sub.site_id = p_site_id), '[]'::jsonb),
    'snags', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sn.id, 'subsection_id', sn.subsection_id, 'title', sn.title,
        'status', sn.status, 'risk_level', sn.risk_level))
      FROM snags sn JOIN subsections sub ON sub.id = sn.subsection_id
      WHERE sub.site_id = p_site_id), '[]'::jsonb),
    'site_documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'file_name', d.file_name, 'file_url', d.file_url,
        'category', d.category, 'category_id', d.category_id, 'created_at', d.created_at) ORDER BY d.created_at DESC)
      FROM site_documents d WHERE d.site_id = p_site_id), '[]'::jsonb),
    'site_document_categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', dc.id, 'name', dc.name) ORDER BY dc.order_index)
      FROM site_document_categories dc WHERE dc.site_id = p_site_id), '[]'::jsonb),
    'inspections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id, 'subsection_id', i.subsection_id, 'inspection_date', i.inspection_date,
        'json_data', i.json_data, 'status', i.status))
      FROM inspections i WHERE i.site_id = p_site_id), '[]'::jsonb),
    'subsection_documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sd.id, 'file_name', sd.file_name, 'file_url', sd.file_url, 'subsection_id', sd.subsection_id,
        'category_name', COALESCE(dc.name, 'Uncategorized')))
      FROM subsection_documents sd
      JOIN subsections sub ON sub.id = sd.subsection_id
      LEFT JOIN document_categories dc ON dc.id = sd.category_id
      WHERE sub.site_id = p_site_id), '[]'::jsonb)
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_public_site_review(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_review(text, uuid) TO anon, authenticated;

-- ── Subsection review page (token + subsection id; scoped to the token) ──────
CREATE OR REPLACE FUNCTION public.get_public_subsection_review(p_token text, p_subsection_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
        'template_name', it.name, 'template_sections', it.sections,
        'signatures', COALESCE((
          SELECT jsonb_agg(jsonb_build_object('signer_name', sg.signer_name,
                 'signer_type', sg.signer_type, 'signed_at', sg.signed_at))
          FROM inspection_signatures sg WHERE sg.inspection_id = i.id), '[]'::jsonb)
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
END; $$;
REVOKE ALL ON FUNCTION public.get_public_subsection_review(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_subsection_review(text, uuid) TO anon, authenticated;
