-- Sign off COC re-verification rows with the JUDGEMENT verdict (Arno, 27 Oct 2026 11:30).
--
-- The existing sign_off_coc_certificate() always finalises the STRICT verdict (proposed_verdict) and
-- copies the strict per-rule results into `rules`. The Site COC Report and the client COC view
-- classify a certificate as failed whenever any rule is FAIL (cocReportModel.verdictKind), so a
-- judgement PASS signed with strict rules would still read as failed.
--
-- This adds a sibling path that is identical except for two columns:
--   verdict := proposed_verdict_alt            (the judgement verdict delivered with the batch)
--   rules   := coc_judgement_rules(rule_results), the strict results translated by the policy:
--     1. C5 FAIL                -> FLAG      (neutral loop > earth loop is flagged, not failed)
--     2. C1 / C2 ASSERTED       -> PASS      (a "Compliant" tick without an ohm value counts as measured)
--     3. any FAIL whose note is exactly 'printed "correct" label, box not ticked' -> ASSERTED
--        (a printed "correct" left unticked counts as asserted; only C12-C15 carry this note)
--     everything else is copied unchanged.
-- Checked against all 913 live unsigned proposed rows (prod snapshot 27 Oct 09:31 UTC): with this
-- mapping the report's own classification equals verdict_alt for every one of them.
--
-- Everything else matches sign_off_coc_certificate(): Admin only; live proposed rows only; older rows
-- listed in supersedes_ids are superseded; the linked COC document is re-stamped from the verdict.
-- rule_results (the delivered strict detail) is never changed. No inserts, no deletes.
--
-- PROD APPLY: via Management API only (migration history has diverged — never `db push`).

create or replace function public.coc_judgement_rules(p_rule_results jsonb)
returns jsonb
language sql
immutable
set search_path = public
as $fn$
  select coalesce(jsonb_object_agg(r->>'rule',
    case
      when r->>'rule' = 'C5' and upper(r->>'res') = 'FAIL' then 'FLAG'
      when r->>'rule' in ('C1', 'C2') and upper(r->>'res') = 'ASSERTED' then 'PASS'
      when upper(r->>'res') = 'FAIL' and btrim(coalesce(r->>'note', '')) = 'printed "correct" label, box not ticked' then 'ASSERTED'
      else r->>'res'
    end), '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_rule_results, '[]'::jsonb)) r
$fn$;

create or replace function public.sign_off_coc_certificate_judgement(p_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare c public.coc_certificates;
begin
  if not public.has_role(auth.uid(), 'Admin') then
    raise exception 'sign-off requires the Admin role';
  end if;

  select * into c from public.coc_certificates where id = p_id for update;
  if not found then raise exception 'coc_certificates % not found', p_id; end if;
  if c.review_status <> 'proposed' or c.superseded_at is not null then
    raise exception 'coc_certificates % is % (superseded %), not a live proposed row', p_id, c.review_status, c.superseded_at;
  end if;
  if coalesce(btrim(c.proposed_verdict_alt), '') = '' then
    raise exception 'coc_certificates % has no judgement verdict (proposed_verdict_alt); not a certificate to sign', p_id;
  end if;

  update public.coc_certificates
     set review_status = 'signed_off',
         verdict = c.proposed_verdict_alt,
         rules = public.coc_judgement_rules(c.rule_results),
         signed_off_by = auth.uid(), signed_off_at = now(), sign_off_note = p_note, updated_at = now()
   where id = p_id;

  update public.coc_certificates
     set superseded_at = now(), superseded_by_batch_id = c.import_batch_id, updated_at = now()
   where id = any(c.supersedes_ids) and superseded_at is null and signed_off_at is null;

  -- Register-truth stamp, same mapping as sign_off_coc_certificate / docStatusFromVerdict().
  if c.coc_document_id is not null then
    update public.subsection_documents
       set coc_status = case when upper(c.proposed_verdict_alt) like 'PASS%' then 'Pass'
                             when upper(c.proposed_verdict_alt) like 'FAIL%' then 'Fail'
                             else 'Pending' end
     where id = c.coc_document_id;
  end if;
end;
$fn$;

revoke all on function public.sign_off_coc_certificate_judgement(uuid, text) from public, anon;
grant execute on function public.sign_off_coc_certificate_judgement(uuid, text) to authenticated;
grant execute on function public.coc_judgement_rules(jsonb) to authenticated;

notify pgrst, 'reload schema';
