
-- 1. Schema additions
ALTER TABLE public.subsections ADD COLUMN IF NOT EXISTS firebase_id text;
CREATE INDEX IF NOT EXISTS idx_subsections_firebase_id ON public.subsections(firebase_id) WHERE firebase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inspections_site_subsection_null ON public.inspections(site_id) WHERE subsection_id IS NULL;

-- 2. Audit table
CREATE TABLE IF NOT EXISTS public.inspection_relink_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL,
  site_id uuid,
  attempted_shop_number text,
  attempted_firebase_key text,
  match_count integer NOT NULL DEFAULT 0,
  resolution text NOT NULL,
  resolved_subsection_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inspection_relink_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins view relink audit" ON public.inspection_relink_audit;
CREATE POLICY "Admins view relink audit" ON public.inspection_relink_audit
  FOR SELECT USING (public.has_role(auth.uid(), 'Admin'::app_role));
DROP POLICY IF EXISTS "Service inserts relink audit" ON public.inspection_relink_audit;
CREATE POLICY "Service inserts relink audit" ON public.inspection_relink_audit
  FOR INSERT WITH CHECK (true);

-- 3. Normalization helper
CREATE OR REPLACE FUNCTION public.normalize_shop_key(_input text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(upper(coalesce(_input, '')), '[^A-Z0-9]', '', 'g')
$$;

-- 4. Resolver: try by firebase key first, then by shop number
CREATE OR REPLACE FUNCTION public.resolve_inspection_subsection(_site_id uuid, _json jsonb)
RETURNS TABLE(resolved_id uuid, match_count int, shop_number text, firebase_key text)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _fb text;
  _shop text;
  _cnt int;
  _id uuid;
BEGIN
  _fb := _json->>'subsectionId';
  _shop := _json->'generalInfo'->>'shopNumber';

  -- firebase key match
  IF _fb IS NOT NULL AND length(_fb) > 0 THEN
    SELECT s.id INTO _id FROM subsections s
      WHERE s.site_id = _site_id AND s.firebase_id = _fb LIMIT 1;
    IF _id IS NOT NULL THEN
      RETURN QUERY SELECT _id, 1, _shop, _fb; RETURN;
    END IF;
  END IF;

  -- shop number match
  IF _shop IS NOT NULL AND length(_shop) > 0 THEN
    SELECT count(*)::int INTO _cnt FROM subsections s
      WHERE s.site_id = _site_id
        AND normalize_shop_key(s.name) = normalize_shop_key(_shop);
    IF _cnt = 1 THEN
      SELECT s.id INTO _id FROM subsections s
        WHERE s.site_id = _site_id
          AND normalize_shop_key(s.name) = normalize_shop_key(_shop) LIMIT 1;
      RETURN QUERY SELECT _id, 1, _shop, _fb; RETURN;
    END IF;
    RETURN QUERY SELECT NULL::uuid, _cnt, _shop, _fb; RETURN;
  END IF;

  RETURN QUERY SELECT NULL::uuid, 0, _shop, _fb;
END $$;

-- 5. Pre-insert/update trigger to auto-resolve subsection_id
CREATE OR REPLACE FUNCTION public.inspections_auto_link_subsection()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.subsection_id IS NULL AND NEW.json_data IS NOT NULL AND NEW.site_id IS NOT NULL THEN
    SELECT * INTO r FROM resolve_inspection_subsection(NEW.site_id, NEW.json_data);
    IF r.resolved_id IS NOT NULL THEN
      NEW.subsection_id := r.resolved_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_inspections_auto_link_subsection ON public.inspections;
CREATE TRIGGER trg_inspections_auto_link_subsection
  BEFORE INSERT OR UPDATE OF json_data, subsection_id ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.inspections_auto_link_subsection();

-- 6. One-time orphan repair + backfill subsections.firebase_id
DO $$
DECLARE
  ins record;
  r record;
BEGIN
  FOR ins IN
    SELECT id, site_id, json_data FROM inspections
    WHERE subsection_id IS NULL AND site_id IS NOT NULL AND json_data IS NOT NULL
  LOOP
    SELECT * INTO r FROM resolve_inspection_subsection(ins.site_id, ins.json_data);
    IF r.resolved_id IS NOT NULL THEN
      UPDATE inspections SET subsection_id = r.resolved_id WHERE id = ins.id;
      -- backfill firebase_id if we had one and subsection lacks it
      IF r.firebase_key IS NOT NULL AND length(r.firebase_key) > 0 THEN
        UPDATE subsections SET firebase_id = r.firebase_key
          WHERE id = r.resolved_id AND firebase_id IS NULL;
      END IF;
      INSERT INTO inspection_relink_audit
        (inspection_id, site_id, attempted_shop_number, attempted_firebase_key, match_count, resolution, resolved_subsection_id)
        VALUES (ins.id, ins.site_id, r.shop_number, r.firebase_key, 1, 'auto_relinked', r.resolved_id);
    ELSE
      INSERT INTO inspection_relink_audit
        (inspection_id, site_id, attempted_shop_number, attempted_firebase_key, match_count, resolution)
        VALUES (ins.id, ins.site_id, r.shop_number, r.firebase_key, coalesce(r.match_count,0),
          CASE WHEN coalesce(r.match_count,0) > 1 THEN 'multiple_matches' ELSE 'no_match' END);
    END IF;
  END LOOP;
END $$;
