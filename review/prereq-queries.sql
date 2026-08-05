-- PRODUCTION READ-QUERY PACK · P-01,P-02,P-04,P-07..P-12,P-15 (plan §A1)
-- READ-ONLY: every statement is a bare SELECT. No DDL/DML/temp table/SET.
-- The editor returns only the LAST grid: highlight ONE block, run, copy, next.

-- Q1 · P-01 · every RLS policy in public AND storage, all cmds, both qual and
-- with_check · unblocks R-07, R-08. Unfiltered on purpose: the prod fix at
-- APPLIED-2026-06-11-tier2-anon-read-lockdown.sql:24 filtered public/SELECT/
-- qual='true' and so missed storage.objects and every FOR ALL. Do not narrow.
SELECT p.schemaname||'.'||p.tablename AS relation, p.policyname, p.cmd, p.permissive,
  array_to_string(p.roles,',') AS roles,
  CASE WHEN 'public'=ANY(p.roles) OR 'anon'=ANY(p.roles) THEN 'ANON-REACHABLE' ELSE '' END AS anon,
  CASE WHEN p.cmd='ALL' THEN 'FOR-ALL' ELSE '' END AS forall,
  CASE WHEN p.qual='true' OR p.with_check='true' THEN 'BLANKET-TRUE' ELSE '' END AS blanket,
  coalesce(p.qual,'(no USING)') AS using_qual,
  coalesce(p.with_check,'(no WITH CHECK)') AS with_check
FROM pg_policies p WHERE p.schemaname IN ('public','storage')
ORDER BY (p.schemaname='storage') DESC,
  ('public'=ANY(p.roles) OR 'anon'=ANY(p.roles)) DESC, (p.cmd='ALL') DESC,
  p.tablename, p.policyname;

-- Q2 · P-02 · presence + real definition of the eight prod-only objects, and
-- every live CHECK on the tables R-16 re-tightens · unblocks R-03, R-16.
WITH want(kind,obj) AS (VALUES
  ('column','public.subsections.deleted_at'),('column','public.snags.deleted_at'),
  ('column','public.inspections.deleted_at'),('column','public.snags.snag_type'),
  ('function','public.classify_field_status'),
  ('function','public.get_compliance_setting_numeric'),
  ('function','public.get_compliance_setting_bool'),
  ('trigger','trg_recompute_from_template')),
got AS (
  SELECT 'column'::text kind,'public.'||c.relname||'.'||a.attname obj,
    format_type(a.atttypid,a.atttypmod)||CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END
    ||coalesce(' DEFAULT '||pg_get_expr(ad.adbin,ad.adrelid),'') AS def
  FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
  WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped
  UNION ALL SELECT 'function','public.'||p.proname,pg_get_functiondef(p.oid)
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind='f'
  UNION ALL SELECT 'trigger',t.tgname,
    pg_get_triggerdef(t.oid)||E'\n----\n'||pg_get_functiondef(t.tgfoid)
  FROM pg_trigger t WHERE NOT t.tgisinternal)
SELECT w.kind,w.obj,
  CASE WHEN g.def IS NULL THEN '*** ABSENT ***' ELSE 'PRESENT' END AS status,
  coalesce(g.def,'') AS definition
FROM want w LEFT JOIN got g ON g.kind=w.kind AND g.obj=w.obj
UNION ALL SELECT 'check-constraint',k.conrelid::regclass::text||' :: '||k.conname,
  CASE WHEN k.convalidated THEN 'VALIDATED' ELSE 'NOT VALID' END,pg_get_constraintdef(k.oid)
FROM pg_constraint k WHERE k.contype='c' AND k.conrelid IN
  (to_regclass('public.snags'),to_regclass('public.subsections'),
   to_regclass('public.inspections'),to_regclass('public.subsection_documents'))
ORDER BY 1,2;

-- Q3 · P-04 · NOT SQL. In a shell linked to the prod ref · unblocks R-01 (what
-- is actually deployed) and R-09 (is "every handler" = "every tracked dir"):
--     supabase functions list

-- Q4 · P-07 · storage.objects ownership per bucket + bucket flags · unblocks
-- R-08, R-07. owner/owner_id read via to_jsonb so a column this Storage
-- version lacks yields NULL instead of aborting the block.
WITH b AS (SELECT to_jsonb(x) j FROM storage.buckets x),
     o AS (SELECT bucket_id,to_jsonb(y) j FROM storage.objects y)
SELECT coalesce(o.bucket_id,b.j->>'id') AS bucket,
  (b.j->>'public')::boolean AS bucket_is_public,
  coalesce(b.j->>'file_size_limit','(none)') AS size_limit,
  coalesce(b.j->>'allowed_mime_types','(none)') AS mime_allowlist,
  count(o.j) AS objects,
  count(o.j) FILTER (WHERE o.j->>'owner' IS NULL AND o.j->>'owner_id' IS NULL) AS ownerless,
  count(DISTINCT coalesce(o.j->>'owner',o.j->>'owner_id')) AS distinct_owners
FROM b FULL OUTER JOIN o ON o.bucket_id=b.j->>'id'
GROUP BY 1,2,3,4 ORDER BY 5 DESC NULLS LAST,1;

-- Q5 · P-07b · first-path-segment census · unblocks R-08's binding constraint
-- that the predicate must NOT be a site-id prefix. Derive it from these.
SELECT o.bucket_id AS bucket, split_part(o.name,'/',1) AS first_segment,
  split_part(o.name,'/',1) ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' AS seg_is_uuid,
  count(*) AS objects,
  count(*) FILTER (WHERE to_jsonb(o)->>'owner' IS NULL
                     AND to_jsonb(o)->>'owner_id' IS NULL) AS ownerless,
  max(o.created_at) AS last_written
FROM storage.objects o GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 50;

-- Q6 · P-08 · shape census of every stored QR URL · unblocks R-10. C and D are
-- the population that stops resolving once the .ilike fallback goes;
-- subsections.qr_code_url is the PNG artifact (qrCodeGenerator.ts:164).
WITH re AS (SELECT '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}'::text u),
s AS (SELECT 'qr_codes.qr_code_url' src, q.qr_code_url url FROM public.qr_codes q
      UNION ALL SELECT 'subsections.qr_code_url', x.qr_code_url
        FROM public.subsections x WHERE x.qr_code_url IS NOT NULL)
SELECT s.src AS source_column, CASE
  WHEN s.url ~* ('qr-redirect\?path='||re.u||'$') THEN 'A ?path=<uuid> ok'
  WHEN s.url ~* ('qr-redirect\?site='||re.u||'$') THEN 'B ?site=<uuid> ok'
  WHEN s.url ~* 'qr-redirect\?path='              THEN 'C ?path=<NON-uuid> *AT RISK*'
  WHEN s.url ~* 'qr-redirect'                     THEN 'D redirect other *AT RISK*'
  WHEN s.url ~* '/storage/v1/object/public/'      THEN 'E storage PNG (not a target)'
  WHEN s.url ~* ('/public/subsections/'||re.u)    THEN 'F app domain baked in'
  ELSE                                                 'G UNCLASSIFIED *INSPECT*'
  END AS url_shape, count(*) AS rows, min(s.url) AS one_example
FROM s CROSS JOIN re GROUP BY 1,2 ORDER BY 1,2;

-- Q7 · P-08b · the fallback-resolution population · unblocks R-10. firebase_id
-- is the exact-match leg that survives R-10; rows without one had only .ilike.
SELECT label, n FROM (
  SELECT 1 s,'subsections total' label, count(*) n FROM public.subsections
  UNION ALL SELECT 2,'  live (deleted_at IS NULL)',count(*) FROM public.subsections WHERE deleted_at IS NULL
  UNION ALL SELECT 3,'firebase_id NOT NULL -> survives R-10',count(*) FROM public.subsections WHERE firebase_id IS NOT NULL
  UNION ALL SELECT 4,'  of those, clients/<c>/<s>/<n> shaped',count(*) FROM public.subsections WHERE firebase_id ~ '^[^/]+/[^/]+/[^/]+'
  UNION ALL SELECT 5,'firebase_id IS NULL -> .ilike only',count(*) FROM public.subsections WHERE firebase_id IS NULL
  UNION ALL SELECT 6,'qr_disabled (kill-switch on)',count(*) FROM public.subsections WHERE qr_disabled
  UNION ALL SELECT 7,'qr_scans last 90 days',count(*) FROM public.qr_scans WHERE scanned_at>now()-interval '90 days'
) t ORDER BY s;

-- Q8 · P-09 · every stored value of the status vocabularies with counts ·
-- unblocks R-16. Non-additive CHECK, hits soft-deleted rows too; casing
-- evidences 20260615140000:43-44 lowercase vs Title-Case.
SELECT col AS column_ref, coalesce(quote_literal(val),'NULL') AS stored_value,
  count(*) AS rows_total, count(*) FILTER (WHERE live) AS rows_live,
  count(*) FILTER (WHERE NOT live) AS rows_soft_deleted,
  CASE WHEN val IS NOT NULL AND val<>initcap(val) THEN '<-- not Title-Case' ELSE '' END AS casing
FROM (
  SELECT 'subsections.coc_status' col, coc_status val, deleted_at IS NULL live FROM public.subsections
  UNION ALL SELECT 'subsections.installation_status',installation_status,deleted_at IS NULL FROM public.subsections
  UNION ALL SELECT 'snags.status',status,deleted_at IS NULL FROM public.snags
  UNION ALL SELECT 'snags.snag_type',snag_type,deleted_at IS NULL FROM public.snags
) v GROUP BY col,val ORDER BY col, rows_total DESC, stored_value;

-- Q9 · P-10 · requires_password_change and role-less users, cross-tabbed ·
-- unblocks R-14. Counts only; no email address is emitted (F-114).
SELECT coalesce(u.raw_user_meta_data->>'role','(no metadata role)') AS metadata_role,
  coalesce((SELECT string_agg(DISTINCT r.role::text,'+' ORDER BY r.role::text)
            FROM public.user_roles r WHERE r.user_id=u.id),'*** NO user_roles ROW ***') AS granted_roles,
  count(*) AS users,
  count(*) FILTER (WHERE u.raw_user_meta_data->>'requires_password_change'='true') AS pw_change_true,
  count(*) FILTER (WHERE u.last_sign_in_at IS NULL) AS never_signed_in,
  count(*) FILTER (WHERE u.last_sign_in_at>now()-interval '90 days') AS active_90d
FROM auth.users u WHERE to_jsonb(u)->>'deleted_at' IS NULL
GROUP BY 1,2 ORDER BY 3 DESC,1,2;

-- Q10 · P-11 · duplicate user_roles rows + the constraint actually in prod ·
-- unblocks R-12. Tracked DDL is UNIQUE(user_id,role) (20251014120311:10).
SELECT label, val FROM (
  SELECT 1 s,'user_roles rows' label, count(*)::text val FROM public.user_roles
  UNION ALL SELECT 2,'distinct user_id',count(DISTINCT user_id)::text FROM public.user_roles
  UNION ALL SELECT 3,'*** user_ids with >1 role row ***',
    (SELECT count(*)::text FROM (SELECT 1 FROM public.user_roles GROUP BY user_id HAVING count(*)>1) d)
  UNION ALL SELECT 4,'rows to reconcile away',
    (SELECT coalesce(sum(c-1),0)::text FROM (SELECT count(*) c FROM public.user_roles GROUP BY user_id HAVING count(*)>1) e)
  UNION ALL SELECT 5,'combo held by '||count(*)::text||' user(s)',roles_held
    FROM (SELECT user_id,string_agg(role::text,'+' ORDER BY role::text) roles_held
          FROM public.user_roles GROUP BY user_id HAVING count(*)>1) f GROUP BY roles_held
  UNION ALL SELECT 6,'live constraint: '||conname,pg_get_constraintdef(oid)
    FROM pg_constraint WHERE conrelid=to_regclass('public.user_roles')
) t ORDER BY s,label;

-- Q11 · P-12 · is temp_import empty? · unblocks R-04. DROP is unrecoverable and
-- it received staff PII (F-10). Shape and KEY NAMES only, never a value.
SELECT label, val FROM (
  SELECT 1 s,'*** rows (0 => DROP is safe) ***' label,count(*)::text val FROM public.temp_import
  UNION ALL SELECT 2,'distinct imported_by',count(DISTINCT imported_by)::text FROM public.temp_import
  UNION ALL SELECT 3,'payload bytes',coalesce(sum(pg_column_size(data)),0)::text FROM public.temp_import
  UNION ALL SELECT 4,'jsonb_typeof '||coalesce(jsonb_typeof(data),'null'),count(*)::text
    FROM public.temp_import GROUP BY jsonb_typeof(data)
  UNION ALL SELECT 5,'top-level key: '||k.key,count(*)::text FROM public.temp_import t
    CROSS JOIN LATERAL jsonb_object_keys(t.data) k(key)
    WHERE jsonb_typeof(t.data)='object' GROUP BY k.key
) t ORDER BY s,label;

-- Q12 · P-15 · active api_clients and who must re-provision · unblocks R-11
-- phase 2. client_secret is NEVER selected: it is stored plaintext (F-110).
SELECT c.name, left(c.client_id,8)||'...' AS client_id_prefix, c.is_active,
  array_to_string(c.scopes,',') AS scopes,
  coalesce(array_length(c.redirect_uris,1),0) AS redirect_uris,
  c.created_at::date AS provisioned,
  coalesce(tk.n,0) AS tokens_issued, coalesce(tk.live,0) AS tokens_unexpired,
  tk.last_use, coalesce(rq.n90,0) AS requests_90d, rq.last_request,
  CASE WHEN c.is_active AND coalesce(rq.n90,0)>0 THEN '*** MUST RE-PROVISION ***'
       WHEN c.is_active THEN 'active but idle 90d - confirm before cutover'
       ELSE 'inactive - no action' END AS r11_action
FROM public.api_clients c
LEFT JOIN LATERAL (SELECT count(*) n,count(*) FILTER (WHERE t.expires_at>now()) live,
  max(t.last_used_at) last_use FROM public.api_access_tokens t WHERE t.client_id=c.id) tk ON true
LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE l.created_at>now()-interval '90 days') n90,
  max(l.created_at) last_request FROM public.api_request_logs l WHERE l.client_id=c.id) rq ON true
ORDER BY c.is_active DESC, coalesce(rq.n90,0) DESC, c.name;