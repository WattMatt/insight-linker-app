-- Behaviour test for sign_off_coc_certificate_judgement(). LOCAL DEV COPY ONLY — the whole script
-- runs in one transaction and ends in ROLLBACK, so it leaves no trace.
--   psql "$LOCAL_DB" -v ON_ERROR_STOP=1 -f scripts/sql/test-coc-judgement-signoff.sql
-- Needs one Admin user in user_roles (the script grants and rolls back) and a live proposed row that
-- has a proposed_verdict_alt; it prefers one with live older rows in supersedes_ids and a COC document.
begin;
create temp table _t (n int, check_name text, ok boolean, detail text);

do $$
declare
  u uuid := (select user_id from public.user_roles limit 1);
  x public.coc_certificates;
  y public.coc_certificates;
  older_live int; older_after int; doc_before text; doc_after text; msg text;
begin
  -- Pick the most informative live proposed row.
  select c.* into x from public.coc_certificates c
   where c.review_status = 'proposed' and c.superseded_at is null and c.proposed_verdict_alt is not null
   order by (c.proposed_verdict is distinct from c.proposed_verdict_alt) desc,
            (c.coc_document_id is not null) desc,
            (select count(*) from public.coc_certificates l where l.id = any(c.supersedes_ids) and l.superseded_at is null and l.signed_off_at is null) desc
   limit 1;
  select count(*) into older_live from public.coc_certificates l where l.id = any(x.supersedes_ids) and l.superseded_at is null and l.signed_off_at is null;
  select coc_status into doc_before from public.subsection_documents where id = x.coc_document_id;

  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', u::text, true);

  -- 1. Not an Admin -> refused.
  delete from public.user_roles where user_id = u and role = 'Admin';
  begin
    perform public.sign_off_coc_certificate_judgement(x.id, null);
    insert into _t values (1, 'non-Admin is refused', false, 'accepted');
  exception when others then
    insert into _t values (1, 'non-Admin is refused', sqlerrm like '%Admin role%', sqlerrm);
  end;

  -- 2. Admin signs: verdict = verdict_alt, rules = mapped, strict detail untouched.
  insert into public.user_roles (user_id, role) values (u, 'Admin');
  perform public.sign_off_coc_certificate_judgement(x.id, 'test');
  select * into y from public.coc_certificates where id = x.id;
  insert into _t values (2, 'final verdict = verdict_alt', y.verdict = x.proposed_verdict_alt, format('strict %s, alt %s, final %s', x.proposed_verdict, x.proposed_verdict_alt, y.verdict));
  insert into _t values (3, 'rules = coc_judgement_rules(rule_results)', y.rules = public.coc_judgement_rules(x.rule_results), y.rules::text);
  insert into _t values (4, 'signed_off by caller, now', y.review_status = 'signed_off' and y.signed_off_by = u and y.signed_off_at is not null, y.review_status);
  insert into _t values (5, 'rule_results / proposed_verdict / cert data unchanged',
    y.rule_results = x.rule_results and y.proposed_verdict is not distinct from x.proposed_verdict and y.cert_no is not distinct from x.cert_no
    and y.subsection_id is not distinct from x.subsection_id and y.source_file is not distinct from x.source_file, '');
  select count(*) into older_after from public.coc_certificates l where l.id = any(x.supersedes_ids) and l.superseded_at is null and l.signed_off_at is null;
  insert into _t values (6, 'linked older rows superseded (same as app path)', older_after = 0, format('%s live before, %s after', older_live, older_after));
  select coc_status into doc_after from public.subsection_documents where id = x.coc_document_id;
  insert into _t values (7, 'COC document re-stamped from verdict_alt', x.coc_document_id is null or doc_after = case when upper(x.proposed_verdict_alt) like 'PASS%' then 'Pass' when upper(x.proposed_verdict_alt) like 'FAIL%' then 'Fail' else 'Pending' end,
    format('doc %s: %s -> %s', coalesce(x.coc_document_id::text, 'none'), doc_before, doc_after));

  -- 3. Signing again -> refused.
  begin
    perform public.sign_off_coc_certificate_judgement(x.id, null);
    insert into _t values (8, 'already signed is refused', false, 'accepted');
  exception when others then insert into _t values (8, 'already signed is refused', sqlerrm like '%not a live proposed row%', sqlerrm); end;

  -- 4. A legacy (final) row -> refused.
  begin
    perform public.sign_off_coc_certificate_judgement((select id from public.coc_certificates where review_status = 'final' and superseded_at is null limit 1), null);
    insert into _t values (9, 'legacy final row is refused', false, 'accepted');
  exception when others then insert into _t values (9, 'legacy final row is refused', sqlerrm like '%not a live proposed row%', sqlerrm); end;

  -- 5. No verdict_alt -> refused (simulated on another proposed row, rolled back).
  select c.* into y from public.coc_certificates c where c.review_status = 'proposed' and c.superseded_at is null and c.id <> x.id limit 1;
  update public.coc_certificates set proposed_verdict_alt = null where id = y.id;
  begin
    perform public.sign_off_coc_certificate_judgement(y.id, null);
    insert into _t values (10, 'row without verdict_alt is refused', false, 'accepted');
  exception when others then insert into _t values (10, 'row without verdict_alt is refused', sqlerrm like '%no judgement verdict%', sqlerrm); end;

  -- 6. Existing guard still freezes the signed row.
  begin
    update public.coc_certificates set rule_results = '[]' where id = x.id;
    insert into _t values (11, 'signed row frozen by existing guard', false, 'update accepted');
  exception when others then insert into _t values (11, 'signed row frozen by existing guard', sqlerrm like '%signed off%', sqlerrm); end;
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, check_name, left(detail, 160) as detail from _t order by n;
rollback;
