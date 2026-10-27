#!/bin/zsh
# Load a read-only prod export (README.md (Dev copy), "export query") into the LOCAL dev copy.
#   dev/load-seed.sh <prod_3sites.json>
# Refuses any database URL that is not on 127.0.0.1 / localhost. The export file holds real
# records (names, registration numbers): keep it outside the repo.
set -euo pipefail
EXPORT=${1:?usage: load-seed.sh <export.json>}
DB_URL=${FORTRESS_DEV_DB_URL:-postgresql://postgres:postgres@127.0.0.1:57422/postgres}
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "refusing: FORTRESS_DEV_DB_URL is not local" >&2; exit 1 ;;
esac

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
jq -c '.' "$EXPORT" > "$TMP/doc.json"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
create temp table _doc (d jsonb);
\copy _doc from '$TMP/doc.json' with (format csv, quote e'\x01', delimiter e'\x02')
truncate public.coc_certificates, public.coc_db_schedule, public.coc_import_batches,
         public.subsection_documents, public.subsections, public.sites, public.clients cascade;
insert into public.clients              select * from jsonb_populate_recordset(null::public.clients,              (select d->'clients' from _doc));
insert into public.sites                select * from jsonb_populate_recordset(null::public.sites,                (select d->'sites' from _doc));
insert into public.subsections          select * from jsonb_populate_recordset(null::public.subsections,          (select d->'subsections' from _doc));
insert into public.subsection_documents select * from jsonb_populate_recordset(null::public.subsection_documents, (select coalesce(d->'subsection_documents','[]') from _doc));
insert into public.coc_import_batches   select * from jsonb_populate_recordset(null::public.coc_import_batches,   (select d->'coc_import_batches' from _doc));
insert into public.coc_db_schedule      select * from jsonb_populate_recordset(null::public.coc_db_schedule,      (select d->'coc_db_schedule' from _doc));
insert into public.coc_certificates     select * from jsonb_populate_recordset(null::public.coc_certificates,     (select d->'coc_certificates' from _doc));
commit;
select 'sites' t, count(*) from public.sites union all
select 'coc_import_batches', count(*) from public.coc_import_batches union all
select 'coc_db_schedule', count(*) from public.coc_db_schedule union all
select 'coc_certificates', count(*) from public.coc_certificates;
SQL
