#!/usr/bin/env node
// Dry run of the COC re-verification import. READ-ONLY: writes nothing to any database.
//
//   node scripts/coc-reverification-dry-run.mjs --src <dir> --expected <rollup.json>
//        [--snapshot <existing.json>] [--site-map <map.json>] [--json <out.json>]
//
//   --src       folder with one <SITE>/verdicts.json per site
//   --expected  roll-up totals: { totals: {...}, sites: { "<SITE>": {records,scored,pass,fail,review,na} } }
//   --snapshot  output of scripts/sql/coc-reverification-snapshot.sql (existing sites + certificates).
//               Without it every record plans as an add and supersede counts are unknown.
//   --site-map  { "<source site name>": "<sites.id>" } overrides for names that don't match exactly
//   --skip      comma-separated source site names to leave out; their roll-up rows are subtracted
//               from the expected totals so the remaining sites still reconcile
//
// Exit code 1 when any stop condition is hit (count mismatch, blocked sign-off, unmapped site).
// Needs Node >= 23 (runs the TypeScript planner via type stripping).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { planSite, reconcileSite, resolveSiteId, BATCH_CAVEATS } from "../src/lib/siteCoc/reverification.ts";

const { values: args } = parseArgs({
  options: {
    src: { type: "string" }, expected: { type: "string" }, snapshot: { type: "string" },
    "site-map": { type: "string" }, json: { type: "string" }, skip: { type: "string" },
  },
});
const skip = new Set((args.skip ?? "").split(",").map(s => s.trim()).filter(Boolean));
if (!args.src || !args.expected) {
  console.error("usage: --src <dir> --expected <rollup.json> [--snapshot f] [--site-map f] [--json out]");
  process.exit(2);
}

const sha256 = s => createHash("sha256").update(s).digest("hex");
const readJson = p => JSON.parse(readFileSync(p, "utf8"));

const expected = readJson(args.expected);
const snapshot = args.snapshot ? readJson(args.snapshot) : null;
const siteMap = args["site-map"] ? readJson(args["site-map"]) : {};

const allDirs = readdirSync(args.src, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort();
for (const s of skip) if (!allDirs.includes(s)) { console.error(`--skip: no site folder "${s}"`); process.exit(2); }
const siteDirs = allDirs.filter(d => !skip.has(d));
// Expected totals for the sites actually planned: roll-up total minus each skipped site's row.
const keyOf = { records: "records", scored: "scored", pass: "pass", fail: "fail", review: "review", na: "na" };
for (const s of skip) {
  const row = expected.sites[s];
  if (!row) { console.error(`--skip: no roll-up row for "${s}"`); process.exit(2); }
  expected.totals.sites -= 1;
  for (const k of Object.keys(keyOf)) expected.totals[k] -= row[k];
}
const fileHashes = [];
const plans = [];
const stops = [];

for (const dir of siteDirs) {
  const raw = readFileSync(join(args.src, dir, "verdicts.json"));
  fileHashes.push(`${dir}/verdicts.json\t${createHash("sha256").update(raw).digest("hex")}`);
  const src = JSON.parse(raw.toString("utf8"));
  if (src.site !== dir) stops.push(`${dir}: verdicts.json says site "${src.site}"`);

  const siteId = snapshot ? resolveSiteId(src.site, snapshot.sites, siteMap) : null;
  if (snapshot && !siteId) stops.push(`${src.site}: no unique sites row (add it to --site-map)`);
  const existing = siteId ? snapshot.certificates.filter(c => c.site_id === siteId) : [];

  const plan = planSite(src, siteId, existing, sha256);
  const mism = reconcileSite(plan, expected.sites[src.site]);
  if (mism.length) stops.push(`${src.site}: ${mism.join("; ")}`);
  for (const b of plan.blocked) stops.push(`${src.site}: BLOCKED ${b.id} (${b.record_key ?? "legacy"}) — ${b.why}`);
  plans.push({ plan, mism });
}

const sum = f => plans.reduce((n, { plan }) => n + f(plan), 0);
const totals = {
  sites: plans.length, records: sum(p => p.records), scored: sum(p => p.scored),
  pass: sum(p => p.pass), fail: sum(p => p.fail), review: sum(p => p.review), na: sum(p => p.notScored),
};
for (const k of Object.keys(expected.totals)) {
  if (totals[k] !== expected.totals[k]) stops.push(`TOTAL ${k}: ${totals[k]} != expected ${expected.totals[k]}`);
}

const sourceHash = sha256(fileHashes.sort().join("\n"));
const pad = (v, n) => String(v).padEnd(n);
const padL = (v, n) => String(v).padStart(n);
const sup = p => (snapshot ? p.superseded.length : "?");

console.log(`COC re-verification DRY RUN — ${new Date().toISOString()}`);
console.log(`source: ${args.src}`);
console.log(`source hash (sha256 of ${fileHashes.length} per-file sha256): ${sourceHash}`);
console.log(`existing-row snapshot: ${args.snapshot ?? "NONE — adds assume an empty register; superseded unknown"}`);
console.log(`skipped sites (not planned, subtracted from expected): ${skip.size ? [...skip].join("; ") : "none"}`);
console.log("");
console.log(`${pad("site", 44)}${padL("recs", 5)}${padL("scored", 7)}${padL("P", 4)}${padL("F", 5)}${padL("R", 4)}${padL("N/A", 5)}${padL("add", 5)}${padL("upd", 5)}${padL("same", 5)}${padL("supd", 5)}${padL("blk", 4)}${padL("shop", 5)}${padL("keyX", 5)}  reconcile`);
for (const { plan: p, mism } of plans) {
  console.log(`${pad(p.site, 44)}${padL(p.records, 5)}${padL(p.scored, 7)}${padL(p.pass, 4)}${padL(p.fail, 5)}${padL(p.review, 4)}${padL(p.notScored, 5)}${padL(p.adds.length, 5)}${padL(p.updates.length, 5)}${padL(p.unchanged, 5)}${padL(sup(p), 5)}${padL(p.blocked.length, 4)}${padL(p.subsectionCarried, 5)}${padL(p.certNormDbCollisions, 5)}  ${mism.length ? "MISMATCH" : "ok"}`);
}
console.log(`${pad("TOTAL", 44)}${padL(totals.records, 5)}${padL(totals.scored, 7)}${padL(totals.pass, 4)}${padL(totals.fail, 5)}${padL(totals.review, 4)}${padL(totals.na, 5)}${padL(sum(p => p.adds.length), 5)}${padL(sum(p => p.updates.length), 5)}${padL(sum(p => p.unchanged), 5)}${padL(snapshot ? sum(p => p.superseded.length) : "?", 5)}${padL(sum(p => p.blocked.length), 4)}${padL(sum(p => p.subsectionCarried), 5)}${padL(sum(p => p.certNormDbCollisions), 5)}`);
console.log("");
console.log("columns: add/upd/same = planned inserts / updates / unchanged rows; supd = earlier re-verification rows superseded now");
console.log("         (legacy rows are NOT superseded at import — see below);");
console.log("         blk = blocked by sign-off; shop = adds that inherit a shop link from a legacy row;");
console.log("         keyX = extra rows that would collapse if the key were site + cert_norm + db.");
console.log("");

const notScored = {};
for (const { plan } of plans) for (const [k, n] of Object.entries(plan.notScoredByClass)) notScored[k] = (notScored[k] ?? 0) + n;
console.log(`not scored by doc_class: ${JSON.stringify(notScored)}`);
console.log(`copy_of records folded into a primary: ${sum(p => p.copies) - sum(p => p.orphanCopies.length)}; orphan copies (target not scored): ${sum(p => p.orphanCopies.length)}`);
console.log(`adds with caveats attached: ${sum(p => p.adds.filter(a => a.row.caveats.length).length)}; with flags: ${sum(p => p.adds.filter(a => a.row.flags.length).length)}`);
console.log(`legacy rows left live at import: ${snapshot ? sum(p => p.legacyLinked + p.legacyUnlinked) : "?"} — linked by THIS run's new rows (superseded when those are signed off): ${snapshot ? sum(p => p.legacyLinked) : "?"}; not linked by this run: ${snapshot ? sum(p => p.legacyUnlinked) : "?"} (rows added by an earlier run keep their links)`);
console.log(`adds inheriting a shop link: ${sum(p => p.subsectionCarried)}; inheriting a COC/eval document link: ${sum(p => p.docLinksCarried)}`);
console.log(`adds with an issued date that could not be parsed: ${sum(p => p.adds.filter(a => a.row.notes).length)}`);
console.log(`batch caveats carried: ${BATCH_CAVEATS.length}`);
console.log("");
console.log(`expected: ${JSON.stringify(expected.totals)}`);
console.log(`actual:   ${JSON.stringify(totals)}`);
console.log("");
if (stops.length) {
  console.log(`STOP — ${stops.length} condition(s):`);
  for (const s of stops) console.log(`  - ${s}`);
} else {
  console.log("All counts reconcile. No blocked rows. (Nothing was written.)");
}

if (args.json) {
  writeFileSync(args.json, JSON.stringify({ sourceHash, fileHashes, totals, stops, batchCaveats: BATCH_CAVEATS, plans: plans.map(x => x.plan) }, null, 1));
  console.log(`\nfull plan written to ${args.json}`);
}
process.exit(stops.length ? 1 : 0);
