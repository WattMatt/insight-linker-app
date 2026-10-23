#!/usr/bin/env node
// Turn a dry-run plan (coc-reverification-dry-run.mjs --json) into ONE reviewable SQL transaction.
// This script only writes a .sql file; it does not connect to any database.
//
//   node scripts/coc-reverification-emit-sql.mjs --plan <plan.json> --out <file.sql> --label "<source label>"
//
// The SQL: one coc_import_batches row per site (kind 'reverification', shared source hash + run id),
// inserts the planned proposed rows, applies planned updates, supersedes planned earlier
// re-verification rows, then checks every count and RAISEs (rolling everything back) on any mismatch.
// Requires 20261023120000_coc_reverification_proposed to be applied on the target first.
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { plan: { type: "string" }, out: { type: "string" }, label: { type: "string" } } });
if (!args.plan || !args.out || !args.label) {
  console.error('usage: --plan <plan.json> --out <file.sql> --label "<source label>"');
  process.exit(2);
}

const plan = JSON.parse(readFileSync(args.plan, "utf8"));
if (plan.stops?.length) {
  console.error(`refusing: the plan has ${plan.stops.length} stop condition(s):\n  ${plan.stops.join("\n  ")}`);
  process.exit(1);
}
const sites = plan.plans.filter(p => p.adds.length || p.updates.length || p.superseded.length);
if (plan.plans.some(p => !p.siteId)) { console.error("refusing: plan has a site with no site id"); process.exit(1); }

const runId = randomUUID();
const tag = `rv${runId.replace(/-/g, "").slice(0, 12)}`;
const lit = v => {
  const s = JSON.stringify(v);
  if (s.includes(`$${tag}$`)) throw new Error("dollar-quote tag collision");
  return `$${tag}$${s}$${tag}$::jsonb`;
};
const q = s => `'${String(s).replace(/'/g, "''")}'`;

const batches = sites.map(p => ({
  site_id: p.siteId,
  counts: {
    run_id: runId, site: p.site, adds: p.adds.length, updates: p.updates.length, unchanged: p.unchanged,
    superseded: p.superseded.length, scored: p.scored, pass: p.pass, fail: p.fail, review: p.review,
    not_scored: p.notScored, not_scored_by_class: p.notScoredByClass,
    legacy_linked: p.legacyLinked, legacy_unlinked: p.legacyUnlinked,
  },
}));

const rowOf = (siteId, r, extra) => ({ site_id: siteId, ...r, ...extra });
const adds = sites.flatMap(p => p.adds.map(a => rowOf(p.siteId, a.row, {
  subsection_id: a.subsection_id, coc_document_id: a.coc_document_id, eval_document_id: a.eval_document_id,
  supersedes_ids: a.supersedes_ids, match_status: a.subsection_id ? "matched" : "unmatched",
})));
const updates = sites.flatMap(p => p.updates.map(u => rowOf(p.siteId, u.row, { id: u.id })));
const superseded = sites.flatMap(p => p.superseded.map(id => ({ id, site_id: p.siteId })));

const certCols = `record_key text, review_status text, proposed_verdict text, proposed_verdict_alt text,
    cert_no text, cert_no_norm text, cert_type text, doc_type text, issued_date date, location text,
    confidence text, source_file text, reasons text, rule_results jsonb, flags jsonb, caveats jsonb,
    copies jsonb, db_name text, building text, reg_person text, reg_no text, form_type text, notes text,
    source_content_hash text`;
const certSet = `proposed_verdict, proposed_verdict_alt, cert_no, cert_no_norm, cert_type, doc_type, issued_date,
    location, confidence, source_file, reasons, rule_results, flags, caveats, copies, db_name, building,
    reg_person, reg_no, form_type, notes, source_content_hash`;

const sql = `-- COC re-verification import — generated ${new Date().toISOString()}
-- run_id ${runId}; source ${args.label}; source hash ${plan.sourceHash}
-- ${batches.length} site batches; ${adds.length} inserts; ${updates.length} updates; ${superseded.length} supersedes.
-- Every inserted row is review_status 'proposed' with verdict NULL. No deletes. Nothing is signed off.
begin;

create temp table _rv_batches (site_id uuid primary key, batch_id uuid not null) on commit drop;

with ins as (
  insert into public.coc_import_batches (site_id, kind, source_label, source_hash, source_files, counts, caveats,
                                         certs_imported, verification_file_name)
  select r.site_id, 'reverification', ${q(args.label)}, ${q(plan.sourceHash)}, ${lit(plan.fileHashes)},
         r.counts, ${lit(plan.batchCaveats)}, (r.counts->>'adds')::int, ${q(args.label)}
    from jsonb_to_recordset(${lit(batches)}) as r(site_id uuid, counts jsonb)
  returning id, site_id
)
insert into _rv_batches (site_id, batch_id) select site_id, id from ins;

insert into public.coc_certificates (site_id, import_batch_id, subsection_id, coc_document_id, eval_document_id,
    supersedes_ids, match_status, verdict, rules, review_status, ${certSet}, record_key)
select r.site_id, b.batch_id, r.subsection_id, r.coc_document_id, r.eval_document_id,
       coalesce(array(select jsonb_array_elements_text(r.supersedes_ids)::uuid), '{}'), r.match_status,
       null, '{}'::jsonb, 'proposed', ${certSet.split(",").map(c => `r.${c.trim()}`).join(", ")}, r.record_key
  from jsonb_to_recordset(${lit(adds)}) as r(site_id uuid, subsection_id uuid, coc_document_id uuid,
       eval_document_id uuid, supersedes_ids jsonb, match_status text, ${certCols})
  join _rv_batches b on b.site_id = r.site_id;

update public.coc_certificates c
   set import_batch_id = b.batch_id, review_status = 'proposed', verdict = null, superseded_at = null,
       superseded_by_batch_id = null, updated_at = now(),
       ${certSet.split(",").map(x => `${x.trim()} = r.${x.trim()}`).join(", ")}
  from jsonb_to_recordset(${lit(updates)}) as r(id uuid, site_id uuid, ${certCols})
  join _rv_batches b on b.site_id = r.site_id
 where c.id = r.id and c.signed_off_at is null;

update public.coc_certificates c
   set superseded_at = now(), superseded_by_batch_id = b.batch_id, updated_at = now()
  from jsonb_to_recordset(${lit(superseded)}) as r(id uuid, site_id uuid)
  join _rv_batches b on b.site_id = r.site_id
 where c.id = r.id and c.signed_off_at is null and c.superseded_at is null;

-- Verify inside the transaction; any mismatch raises and rolls everything back.
do $verify$
declare n_batches int; n_ins int; n_upd int; n_sup int; n_bad int;
begin
  select count(*) into n_batches from _rv_batches;
  select count(*) into n_ins from public.coc_certificates c join _rv_batches b on b.batch_id = c.import_batch_id
   where c.review_status = 'proposed' and c.verdict is null and c.superseded_at is null;
  select count(*) into n_sup from public.coc_certificates c join _rv_batches b on b.batch_id = c.superseded_by_batch_id;
  select count(*) into n_bad from public.coc_certificates c join _rv_batches b on b.batch_id = c.import_batch_id
   where c.verdict is not null or c.signed_off_at is not null;
  if n_batches <> ${batches.length} then raise exception 'batches: % <> ${batches.length}', n_batches; end if;
  if n_ins <> ${adds.length + updates.length} then raise exception 'proposed rows in batch: % <> ${adds.length + updates.length}', n_ins; end if;
  if n_sup <> ${superseded.length} then raise exception 'superseded: % <> ${superseded.length}', n_sup; end if;
  if n_bad <> 0 then raise exception '% rows in batch carry a verdict or sign-off', n_bad; end if;
  raise notice 'coc re-verification run ${runId}: % batches, % proposed rows, % superseded — verified', n_batches, n_ins, n_sup;
end $verify$;

commit;
`;

writeFileSync(args.out, sql);
console.log(`wrote ${args.out} (${(sql.length / 1024 / 1024).toFixed(2)} MB): run ${runId}, ${batches.length} batches, ${adds.length} inserts, ${updates.length} updates, ${superseded.length} supersedes`);
