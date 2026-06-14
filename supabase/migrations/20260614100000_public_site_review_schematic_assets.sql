-- Phase 1 of public-read RLS hardening (docs/security/public-read-rls-hardening.md):
-- extend get_public_site_review so the SchematicDiagram and AssetVerification components
-- can render in public review WITHOUT reading tables directly with the anon key. This is the
-- prerequisite for dropping the blanket anon SELECT policies (Phase 3).
--
-- Additive: same token scope check as before, plus schematic + schematic_blocks + site_assets,
-- and `title` added to inspections (the components display it). ADDITIVE ONLY.

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
        'id', i.id, 'title', i.title, 'subsection_id', i.subsection_id, 'inspection_date', i.inspection_date,
        'json_data', i.json_data, 'status', i.status))
      FROM inspections i WHERE i.site_id = p_site_id), '[]'::jsonb),
    'subsection_documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', sd.id, 'file_name', sd.file_name, 'file_url', sd.file_url, 'subsection_id', sd.subsection_id,
        'category_name', COALESCE(dc.name, 'Uncategorized')))
      FROM subsection_documents sd
      JOIN subsections sub ON sub.id = sd.subsection_id
      LEFT JOIN document_categories dc ON dc.id = sd.category_id
      WHERE sub.site_id = p_site_id), '[]'::jsonb),
    -- Phase 1 additions: schematic overlay + electrical assets for the public review components.
    'schematic', (
      SELECT to_jsonb(x) FROM (
        SELECT id, site_id, file_name, file_url, calibrated_width, calibrated_height, is_calibrated
        FROM site_schematics WHERE site_id = p_site_id LIMIT 1
      ) x),
    'schematic_blocks', COALESCE((
      SELECT jsonb_agg(to_jsonb(b) ORDER BY b.block_identifier)
      FROM schematic_blocks b
      JOIN site_schematics s ON s.id = b.schematic_id
      WHERE s.site_id = p_site_id), '[]'::jsonb),
    'site_assets', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.premises_id)
      FROM site_assets a WHERE a.site_id = p_site_id), '[]'::jsonb)
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_public_site_review(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_site_review(text, uuid) TO anon, authenticated;
