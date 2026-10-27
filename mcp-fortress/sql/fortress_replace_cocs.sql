-- fortress_replace_cocs: the ONLY write path of the mcp-fortress server.
--
-- Applies one site's re-verification plan (src/lib/siteCoc/reverification.ts planSite) in a single
-- transaction, with the same rules as scripts/coc-reverification-emit-sql.mjs:
--   * inserts are review_status 'proposed' with verdict NULL — never a final verdict, never a sign-off;
--   * updates touch only earlier re-verification rows (record_key set) that are not signed off;
--   * "superseded" only marks earlier re-verification rows the source no longer carries;
--   * legacy rows are never changed here: new rows list them in supersedes_ids and the app's
--     Admin sign-off (sign_off_coc_certificate) supersedes them later;
--   * no deletes.
-- Extra guards for the MCP server:
--   * the site must belong to the Fortress_Fund client;
--   * the caller must be signed in and not a Client or Contractor (staff);
--   * rows from June 2026 import batches are never updated or superseded;
--   * every id must belong to p_site_id;
--   * counts are verified before commit; any mismatch raises and nothing is written.
--
-- SECURITY INVOKER: the caller's row-level security applies as well.
-- Status: applied to the LOCAL dev copy only. Applying it to prod is a separate, confirmed step
-- (Management API + `supabase migration repair`, never `db push`).
create or replace function public.fortress_replace_cocs(
  p_site_id uuid,
  p_plan jsonb,          -- { adds: [...], updates: [...], superseded: [uuid...], counts: {...} }
  p_label text,
  p_source_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_batch uuid;
  v_adds jsonb := coalesce(p_plan->'adds', '[]');
  v_updates jsonb := coalesce(p_plan->'updates', '[]');
  v_sup jsonb := coalesce(p_plan->'superseded', '[]');
  v_n int;
  v_bad int;
begin
  if auth.uid() is null then
    raise exception 'fortress_replace_cocs: not signed in' using errcode = '42501';
  end if;
  if public.has_role(auth.uid(), 'Client') or public.has_role(auth.uid(), 'Contractor') then
    raise exception 'fortress_replace_cocs: staff only' using errcode = '42501';
  end if;
  if not exists (select 1 from public.sites s join public.clients c on c.id = s.client_id
                  where s.id = p_site_id and c.name = 'Fortress_Fund') then
    raise exception 'fortress_replace_cocs: site % is not a Fortress site', p_site_id using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('fortress_replace_cocs:' || p_site_id::text));

  -- Every row the plan names must be this site's, a re-verification row, not signed off, and not
  -- from a June 2026 import batch.
  select count(*) into v_bad
    from (select (u->>'id')::uuid as id from jsonb_array_elements(v_updates) u
          union all select x::uuid from jsonb_array_elements_text(v_sup) x) t
    left join public.coc_certificates c on c.id = t.id
    left join public.coc_import_batches b on b.id = c.import_batch_id
   where c.id is null or c.site_id <> p_site_id or c.record_key is null or c.signed_off_at is not null
      or (b.created_at >= '2026-06-01' and b.created_at < '2026-07-01');
  if v_bad > 0 then
    raise exception 'fortress_replace_cocs: % planned update/supersede row(s) are outside this site, legacy, signed off or June 2026', v_bad;
  end if;
  select count(*) into v_bad
    from jsonb_array_elements(v_adds) a, jsonb_array_elements_text(coalesce(a->'supersedes_ids','[]')) s
    left join public.coc_certificates c on c.id = s::uuid
   where c.id is null or c.site_id <> p_site_id;
  if v_bad > 0 then
    raise exception 'fortress_replace_cocs: % supersedes_ids are not rows of this site', v_bad;
  end if;

  insert into public.coc_import_batches (site_id, uploaded_by, kind, source_label, source_hash, counts, certs_imported, verification_file_name)
  values (p_site_id, auth.uid(), 'reverification', p_label, p_source_hash,
          coalesce(p_plan->'counts', '{}') || jsonb_build_object('via', 'mcp-fortress'),
          jsonb_array_length(v_adds), p_label)
  returning id into v_batch;

  insert into public.coc_certificates (site_id, import_batch_id, subsection_id, coc_document_id, eval_document_id,
      supersedes_ids, match_status, verdict, rules, review_status,
      record_key, proposed_verdict, proposed_verdict_alt, cert_no, cert_no_norm, cert_type, doc_type, issued_date,
      location, confidence, source_file, reasons, rule_results, flags, caveats, copies, db_name, building,
      reg_person, reg_no, form_type, notes, source_content_hash)
  select p_site_id, v_batch, (a->>'subsection_id')::uuid, (a->>'coc_document_id')::uuid, (a->>'eval_document_id')::uuid,
         coalesce(array(select jsonb_array_elements_text(a->'supersedes_ids')::uuid), '{}'),
         case when a->>'subsection_id' is not null then 'matched' else 'unmatched' end,
         null, '{}'::jsonb, 'proposed',
         r.record_key, r.proposed_verdict, r.proposed_verdict_alt, r.cert_no, r.cert_no_norm, r.cert_type, r.doc_type, r.issued_date,
         r.location, r.confidence, r.source_file, r.reasons, r.rule_results, r.flags, r.caveats, r.copies, r.db_name, r.building,
         r.reg_person, r.reg_no, r.form_type, r.notes, r.source_content_hash
    from jsonb_array_elements(v_adds) a,
         jsonb_to_record(a->'row') as r(record_key text, proposed_verdict text, proposed_verdict_alt text, cert_no text,
           cert_no_norm text, cert_type text, doc_type text, issued_date date, location text, confidence text,
           source_file text, reasons text, rule_results jsonb, flags jsonb, caveats jsonb, copies jsonb, db_name text,
           building text, reg_person text, reg_no text, form_type text, notes text, source_content_hash text);

  update public.coc_certificates c
     set import_batch_id = v_batch, review_status = 'proposed', verdict = null, superseded_at = null,
         superseded_by_batch_id = null, updated_at = now(),
         proposed_verdict = r.proposed_verdict, proposed_verdict_alt = r.proposed_verdict_alt, cert_no = r.cert_no,
         cert_no_norm = r.cert_no_norm, cert_type = r.cert_type, doc_type = r.doc_type, issued_date = r.issued_date,
         location = r.location, confidence = r.confidence, source_file = r.source_file, reasons = r.reasons,
         rule_results = r.rule_results, flags = r.flags, caveats = r.caveats, copies = r.copies, db_name = r.db_name,
         building = r.building, reg_person = r.reg_person, reg_no = r.reg_no, form_type = r.form_type, notes = r.notes,
         source_content_hash = r.source_content_hash
    from jsonb_array_elements(v_updates) u,
         jsonb_to_record(u->'row') as r(proposed_verdict text, proposed_verdict_alt text, cert_no text,
           cert_no_norm text, cert_type text, doc_type text, issued_date date, location text, confidence text,
           source_file text, reasons text, rule_results jsonb, flags jsonb, caveats jsonb, copies jsonb, db_name text,
           building text, reg_person text, reg_no text, form_type text, notes text, source_content_hash text)
   where c.id = (u->>'id')::uuid and c.site_id = p_site_id and c.signed_off_at is null;

  update public.coc_certificates c
     set superseded_at = now(), superseded_by_batch_id = v_batch, updated_at = now()
   where c.id in (select x::uuid from jsonb_array_elements_text(v_sup) x)
     and c.site_id = p_site_id and c.signed_off_at is null and c.superseded_at is null;

  -- Verify before commit.
  select count(*) into v_n from public.coc_certificates
   where import_batch_id = v_batch and review_status = 'proposed' and verdict is null and superseded_at is null;
  if v_n <> jsonb_array_length(v_adds) + jsonb_array_length(v_updates) then
    raise exception 'fortress_replace_cocs: proposed rows in batch % <> planned %', v_n, jsonb_array_length(v_adds) + jsonb_array_length(v_updates);
  end if;
  select count(*) into v_n from public.coc_certificates where superseded_by_batch_id = v_batch;
  if v_n <> jsonb_array_length(v_sup) then
    raise exception 'fortress_replace_cocs: superseded % <> planned %', v_n, jsonb_array_length(v_sup);
  end if;
  select count(*) into v_n from public.coc_certificates
   where import_batch_id = v_batch and (verdict is not null or signed_off_at is not null);
  if v_n <> 0 then
    raise exception 'fortress_replace_cocs: % rows in the batch carry a verdict or sign-off', v_n;
  end if;

  return jsonb_build_object('batch_id', v_batch, 'inserted', jsonb_array_length(v_adds),
                            'updated', jsonb_array_length(v_updates), 'superseded', jsonb_array_length(v_sup));
end;
$fn$;

revoke all on function public.fortress_replace_cocs(uuid, jsonb, text, text) from public, anon;
grant execute on function public.fortress_replace_cocs(uuid, jsonb, text, text) to authenticated;
notify pgrst, 'reload schema';
