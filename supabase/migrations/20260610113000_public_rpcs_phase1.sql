-- Airtight public-share rebuild — Phase 1: QR page + portfolio page functions.
-- Token-validated SECURITY DEFINER functions that return ONLY the scoped payload
-- each public page needs, so those pages stop reading tables directly with the
-- anon key. ADDITIVE ONLY — creates functions; no policy/table changes here.
-- Anon table reads are closed in the final phase once all read paths are migrated.

-- Internal helper: resolve a share token to its (valid, unexpired) link row.
-- SECURITY DEFINER + not granted to anon: only the RPCs below call it.
CREATE OR REPLACE FUNCTION public._share_link(p_token text)
RETURNS public.client_access_links
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM public.client_access_links
  WHERE access_token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._share_link(text) FROM PUBLIC;

-- ── QR landing page (no token; scoped by subsection id from the URL) ──────────
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
        FROM snags sn WHERE sn.subsection_id = p_subsection_id), '[]'::jsonb)
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.get_public_subsection(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_subsection(uuid) TO anon, authenticated;

-- ── Portfolio share page (token, link_type 'client') ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_public_portfolio(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_link public.client_access_links;
BEGIN
  v_link := public._share_link(p_token);
  IF v_link.id IS NULL OR v_link.client_id IS NULL THEN
    RETURN NULL;  -- invalid/expired token or not a client-scoped link
  END IF;
  RETURN jsonb_build_object(
    'settings', (SELECT jsonb_build_object('company_name', company_name, 'company_logo_url', company_logo_url)
                 FROM settings ORDER BY created_at LIMIT 1),
    'client', (SELECT jsonb_build_object('id', id, 'name', name, 'company_name', company_name, 'logo_url', logo_url)
               FROM clients WHERE id = v_link.client_id),
    'sites', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'address', s.address, 'site_type', s.site_type, 'site_image_url', s.site_image_url,
        'total_subsections', (SELECT count(*) FROM subsections sub WHERE sub.site_id = s.id),
        'open_snags', (SELECT count(*) FROM snags sn JOIN subsections sub ON sub.id = sn.subsection_id
                       WHERE sub.site_id = s.id AND lower(coalesce(sn.status,'')) NOT IN ('rectified','closed'))
      ) ORDER BY s.name)
      FROM sites s WHERE s.client_id = v_link.client_id), '[]'::jsonb)
  );
END; $$;
REVOKE ALL ON FUNCTION public.get_public_portfolio(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_portfolio(text) TO anon, authenticated;
