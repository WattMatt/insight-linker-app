-- READ-ONLY snapshot for scripts/coc-reverification-dry-run.mjs (--snapshot).
-- Run against STAGING (or prod, read-only) and save the single JSON value to a file:
--   psql "$DB_URL" -At -f scripts/sql/coc-reverification-snapshot.sql > existing.json
-- Works before and after 20261023120000_coc_reverification_proposed: the new columns are read
-- through to_jsonb(), so they come back null when the migration isn't applied yet.
select json_build_object(
  'sites', (select coalesce(json_agg(json_build_object('id', s.id, 'name', s.name)), '[]'::json)
              from public.sites s),
  'certificates', (select coalesce(json_agg(json_build_object(
      'id', c.id, 'site_id', c.site_id, 'cert_no', c.cert_no, 'cert_no_norm', c.cert_no_norm,
      'verdict', c.verdict, 'subsection_id', c.subsection_id,
      'coc_document_id', c.coc_document_id, 'eval_document_id', c.eval_document_id,
      'record_key',          to_jsonb(c) ->> 'record_key',
      'review_status',       to_jsonb(c) ->> 'review_status',
      'signed_off_at',       to_jsonb(c) ->> 'signed_off_at',
      'superseded_at',       to_jsonb(c) ->> 'superseded_at',
      'source_content_hash', to_jsonb(c) ->> 'source_content_hash'
    )), '[]'::json) from public.coc_certificates c)
);
