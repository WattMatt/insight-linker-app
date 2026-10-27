-- READ-ONLY catalog export for dev/gen-schema.mjs. Save .[0].doc as prod_ddl.json.
select json_build_object(
 'columns', (select json_agg(json_build_object('t',table_name,'c',column_name,'type',format_type(a.atttypid,a.atttypmod),'null',is_nullable,'def',column_default) order by table_name, ordinal_position)
    from information_schema.columns ic join pg_attribute a on a.attrelid=('public.'||ic.table_name)::regclass and a.attname=ic.column_name
    where table_schema='public' and table_name in ('clients','sites','subsections','subsection_documents','coc_import_batches','coc_db_schedule','coc_certificates')),
 'constraints', (select json_agg(json_build_object('t',conrelid::regclass::text,'n',conname,'def',pg_get_constraintdef(oid))) from pg_constraint
    where conrelid in ('public.coc_certificates'::regclass,'public.coc_import_batches'::regclass,'public.coc_db_schedule'::regclass)),
 'indexes', (select json_agg(indexdef) from pg_indexes where schemaname='public' and tablename in ('coc_certificates','coc_import_batches','coc_db_schedule')),
 'triggers', (select json_agg(json_build_object('t',tgrelid::regclass::text,'def',pg_get_triggerdef(oid))) from pg_trigger where not tgisinternal
    and tgrelid in ('public.coc_certificates'::regclass,'public.coc_import_batches'::regclass,'public.coc_db_schedule'::regclass)),
 'functions', (select json_agg(json_build_object('n',p.proname,'def',pg_get_functiondef(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('has_role','sign_off_coc_certificate','supersede_coc_certificate','coc_certificates_guard_signed_off','update_updated_at_column')),
 'policies', (select json_agg(json_build_object('t',tablename,'n',policyname,'cmd',cmd,'roles',roles::text,'qual',qual,'check',with_check)) from pg_policies where schemaname='public'
    and tablename in ('coc_certificates','coc_import_batches','coc_db_schedule')),
 'enums', (select json_agg(json_build_object('t',t.typname,'v',(select json_agg(enumlabel order by enumsortorder) from pg_enum e where e.enumtypid=t.oid))) from pg_type t where t.typname in ('app_role')),
 'user_roles_cols', (select json_agg(column_name||' '||data_type) from information_schema.columns where table_schema='public' and table_name='user_roles')
) doc;
