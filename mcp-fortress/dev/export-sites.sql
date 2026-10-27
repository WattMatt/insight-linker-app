-- READ-ONLY. Edit the site names, run against prod via the Management API, save .[0].doc as JSON outside the repo.
with three as (select id from sites where client_id='eec20f09-6a02-42de-b151-cbe5c7b665c8' and name in ('YARONA CENTRE','Mayville Mall','Thembi Mall'))
select json_build_object(
 'exported_at', now(),
 'clients', (select json_agg(c) from clients c where c.id='eec20f09-6a02-42de-b151-cbe5c7b665c8'),
 'sites', (select json_agg(s) from sites s where s.client_id='eec20f09-6a02-42de-b151-cbe5c7b665c8'),
 'subsections', (select json_agg(x) from subsections x where x.site_id in (select id from three)),
 'subsection_documents', (select json_agg(d) from subsection_documents d where d.id in (select coc_document_id from coc_certificates where site_id in (select id from three) union select eval_document_id from coc_certificates where site_id in (select id from three))),
 'coc_import_batches', (select json_agg(b) from coc_import_batches b where b.site_id in (select id from three)),
 'coc_db_schedule', (select json_agg(d) from coc_db_schedule d where d.site_id in (select id from three)),
 'coc_certificates', (select json_agg(c) from coc_certificates c where c.site_id in (select id from three))
) doc;
