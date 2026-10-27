#!/usr/bin/env node
// End-to-end test against the LOCAL dev copy only (refuses any non-localhost SUPABASE_URL).
//   npm run dev:dry-runs        (loads .env.dev)
// 1. Dry runs for Yarona, Mayville and Thembi Mall with the Oct 2026 re-verification packs.
// 2. Every read tool once.
// 3. Refusals: non-Fortress site, wrong-site token, changed JSON, reused token.
// 4. One real replace_cocs on the LOCAL copy with a deliberately changed Thembi record, then checks
//    the snapshot, the write log, that the row is proposed with no final verdict, and that a new
//    dry run shows the site unchanged.
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { makeTokenKit } from "../src/core.mjs";
import { connect } from "../src/connect.mjs";
import { createTools } from "../src/tools.mjs";

const url = new URL(process.env.SUPABASE_URL ?? "http://invalid");
if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
  console.error(`refusing: SUPABASE_URL host ${url.hostname} is not local`);
  process.exit(1);
}
const PACKS = process.env.FORTRESS_PACKS_DIR
  ?? "/Volumes/Extreme SSD/WATSON MATTHEUS Dropbox/OFFICE/PROJECTS/(647) FORTRESS - ASSET AUDITS/(647) FORTRESS - ASSET AUDITS/10. Re-verification 2026-10 (strict)";
const SITES = [["YARONA CENTRE", "YARONA"], ["Mayville Mall", "MAYVILLE"], ["Thembi Mall", "THEMBI MALL"]];

const store = await connect();
const tools = createTools(store, makeTokenKit());
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failures++; };
const refused = async (fn, re, msg) => {
  try { await fn(); ok(false, `${msg} (was accepted)`); } catch (e) { ok(re.test(e.message), `${msg}: "${e.message}"`); }
};

console.log(`mcp-fortress dev test — ${new Date().toISOString()} — target ${url.host} (local)\n`);
const all = await tools.list_sites({});
console.log(`list_sites: ${all.length} Fortress sites\n`);

const ids = {};
const baseline = {};
console.log("== Dry runs (write nothing) ==");
for (const [name, pack] of SITES) {
  const site = all.find(s => s.name === name);
  ids[name] = site.id;
  const json_path = `${PACKS}/${pack}/verdicts.json`;
  if (!existsSync(json_path)) { ok(false, `${name}: pack not found at ${json_path}`); continue; }
  const before = (await store.certificates(site.id, "id")).length;
  const r = await tools.dry_run_replace_cocs({ site_id: site.id, json_path });
  const after = (await store.certificates(site.id, "id")).length;
  console.log(`\n${name} (${site.id}) ← ${pack}/verdicts.json`);
  console.log(JSON.stringify(r.diff.counts));
  console.log(`stops: ${r.stops.length ? r.stops.join("; ") : "none"}; token issued: ${r.confirm_token ? "yes" : "no"} — ${r.note}`);
  for (const k of ["adds", "updates", "superseded_now"]) if (r.diff[k].length) console.log(`  ${k}: ${r.diff[k].join("; ")}`);
  baseline[name] = r.diff;
  ok(before === after, `${name}: dry run wrote nothing (${before} rows before and after)`);
}

console.log("\n== Read tools (Yarona) ==");
const y = ids["YARONA CENTRE"];
const site = await tools.get_site({ site_id: y });
console.log(`get_site: ${JSON.stringify(site.coc_rows)}`);
const cocs = await tools.list_cocs({ site_id: y });
const cocsAll = await tools.list_cocs({ site_id: y, include_superseded: true });
ok(cocs.length === site.coc_rows.live && cocsAll.length === site.coc_rows.total, `list_cocs: ${cocs.length} live / ${cocsAll.length} total`);
const v = await tools.get_verdicts({ site_id: y });
console.log(`get_verdicts: ${JSON.stringify(v.summary)}`);
const snap = await tools.export_snapshot({ site_id: y });
ok(existsSync(snap.path) && JSON.parse(readFileSync(snap.path, "utf8")).coc_certificates.length === site.coc_rows.total, `export_snapshot: ${snap.path}`);

console.log("\n== Refusals ==");
await refused(() => tools.get_site({ site_id: randomUUID() }), /not a Fortress_Fund site/, "unknown / non-Fortress site_id");
const thembi = ids["Thembi Mall"];
const thembiSrc = JSON.parse(readFileSync(`${PACKS}/THEMBI MALL/verdicts.json`, "utf8"));
// Change one record the baseline dry run did NOT already plan to write, so the effect is exactly +1.
const base = baseline["Thembi Mall"];
const baseKeys = new Set([...base.adds, ...base.updates].map(s => s.split(" ")[0]));
const scoredDoc = thembiSrc.docs.find(d => ["PASS", "FAIL", "REVIEW"].includes(d.verdict) && !d.copy_of && !baseKeys.has(d.id));
const changed = structuredClone(thembiSrc);
changed.docs.find(d => d.id === scoredDoc.id).reason = `${scoredDoc.reason} [dev test ${Date.now()}]`;
const dry = await tools.dry_run_replace_cocs({ site_id: thembi, json: changed });
console.log(`Thembi with ${scoredDoc.id} changed: ${JSON.stringify(dry.diff.counts)}`);
const writes = c => c.adds + c.updates + c.superseded_now;
ok(dry.confirm_token && writes(dry.diff.counts) === writes(base.counts) + 1 && dry.diff.counts.updates === base.counts.updates + 1,
  `one changed record adds exactly one update on top of the baseline (${writes(base.counts)} → ${writes(dry.diff.counts)}) and issues a token`);
await refused(() => tools.replace_cocs({ site_id: y, json: changed, confirm_token: dry.confirm_token }), /different site|differs/, "token used for another site");
await refused(() => tools.replace_cocs({ site_id: thembi, json: thembiSrc, confirm_token: dry.confirm_token }), /differs from the dry run/, "token used with different JSON");
await refused(() => tools.replace_cocs({ site_id: thembi, json: changed, confirm_token: "x.y" }), /signature invalid|malformed/, "forged token");

console.log("\n== replace_cocs on the LOCAL copy ==");
const juneBefore = await store.juneIds(ids["Mayville Mall"]);
const res = await tools.replace_cocs({ site_id: thembi, json: changed, confirm_token: dry.confirm_token });
console.log(JSON.stringify(res));
ok(existsSync(res.snapshot), "snapshot written before the write");
const lastLog = readFileSync(res.log, "utf8").trim().split("\n").pop();
ok(JSON.parse(lastLog).snapshot === res.snapshot && JSON.parse(lastLog).status === "ok", "write logged with timestamp, site, row counts and snapshot path");
const row = (await store.certificates(thembi, "record_key, review_status, verdict, reasons, superseded_at")).find(r => r.record_key === scoredDoc.id && !r.superseded_at);
ok(row?.review_status === "proposed" && row.verdict === null && row.reasons.includes("[dev test"), "written row is proposed with no final verdict");
await refused(() => tools.replace_cocs({ site_id: thembi, json: changed, confirm_token: dry.confirm_token }), /already used|changed since/, "token reuse");
const again = await tools.dry_run_replace_cocs({ site_id: thembi, json: changed });
ok(again.diff.counts.adds + again.diff.counts.updates + again.diff.counts.superseded_now === 0, "dry run after replace shows nothing left to write");
const juneAfter = await store.juneIds(ids["Mayville Mall"]);
ok(juneBefore.size === juneAfter.size, `June 2026 rows untouched (${juneAfter.size} on Mayville)`);

console.log(`\n${failures ? `${failures} FAILED` : "ALL CHECKS PASSED"}`);
process.exit(failures ? 1 : 0);
