// The seven tools, independent of the MCP transport (server.mjs wires them up; the dev test calls
// them directly). Re-uses the app's tested planner so the server and the import scripts agree.
import { readFileSync } from "node:fs";
import { planSite } from "../../src/lib/siteCoc/reverification.ts";
import { canonical, planHash, planWrites, sha256, summarize } from "./core.mjs";

/** `json` may be the verdicts.json object, its text, or omitted in favour of `json_path`.
 *  The remote server passes allowPath = false: a file path is never read on the server. */
export function readSource({ json, json_path }, allowPath = true) {
  if (json_path && !allowPath) throw new Error("json_path is not accepted by this server; pass the verdicts.json content as json");
  if (json == null && !json_path) throw new Error("give json (verdicts.json content) or json_path");
  const src = json_path ? JSON.parse(readFileSync(json_path, "utf8")) : typeof json === "string" ? JSON.parse(json) : json;
  if (!src || typeof src.site !== "string" || !Array.isArray(src.docs)) {
    throw new Error("not a re-verification verdicts.json: expected { site, policy, docs: [...] }");
  }
  return src;
}

/**
 * opts.allowJsonPath: read json_path from local disk (stdio server only).
 * opts.consumeToken: async (token) => true the first time a confirm token is spent, false after; the
 * remote server backs this with a table so it holds across serverless instances. Default: memory.
 * @param {any} store
 * @param {any} tokens
 * @param {{ allowJsonPath?: boolean, consumeToken?: (token: string) => Promise<boolean> }} [opts]
 */
export function createTools(store, tokens, { allowJsonPath = true, consumeToken } = {}) {
  const used = new Set();
  const consume = consumeToken ?? (async t => (used.has(t) ? false : (used.add(t), true)));
  const source = args => readSource(args, allowJsonPath);

  async function plan(siteId, src) {
    const site = await store.fortressSite(siteId);
    const [existing, juneIds] = await Promise.all([
      store.certificates(siteId, "id, site_id, cert_no, cert_no_norm, verdict, subsection_id, coc_document_id, eval_document_id, record_key, review_status, signed_off_at, superseded_at, source_content_hash"),
      store.juneIds(siteId),
    ]);
    const p = planSite(src, siteId, existing, sha256);
    // June 2026 rows are read-only. The planner only updates/supersedes re-verification rows, but
    // check anyway so a future planner change cannot slip one through.
    const juneTouched = [...p.updates.map(u => u.id), ...p.superseded].filter(id => juneIds.has(id));
    return { site, p, juneIds, juneTouched, dataHash: sha256(canonical(src)), ph: planHash(p) };
  }

  return {
    list_sites: async ({ filter }) => store.listSites(filter),
    get_site: async ({ site_id }) => store.getSite(site_id),
    list_cocs: async ({ site_id, include_superseded }) => store.listCocs(site_id, !!include_superseded),
    get_verdicts: async ({ site_id }) => store.getVerdicts(site_id),
    export_snapshot: async ({ site_id }) => store.exportSnapshot(site_id, "export_snapshot"),

    async dry_run_replace_cocs(args) {
      const src = source(args);
      const { site, p, juneIds, juneTouched, dataHash, ph } = await plan(args.site_id, src);
      const stops = [
        ...p.blocked.map(b => `blocked: ${b.id} (${b.record_key ?? "legacy"}) — ${b.why}`),
        ...juneTouched.map(id => `would change June 2026 row ${id}`),
      ];
      const writes = p.adds.length + p.updates.length + p.superseded.length;
      return {
        site: { id: site.id, name: site.name }, source_site_label: src.site,
        writes_nothing: true,
        diff: summarize(p, juneIds),
        stops,
        confirm_token: stops.length || !writes ? null : tokens.issue({ siteId: site.id, dataHash, planHash: ph }),
        note: stops.length ? "Stop conditions present: replace_cocs is not available for this data."
          : !writes ? "Nothing to write: every record is unchanged."
          : "Token is valid for 15 minutes, once, for this site and exactly this JSON, while the site's COC rows stay as they are now.",
      };
    },

    async replace_cocs(args) {
      const src = source(args);
      const { site, p, juneIds, juneTouched, dataHash, ph } = await plan(args.site_id, src);
      const why = tokens.check(args.confirm_token, { siteId: site.id, dataHash, planHash: ph });
      if (why) throw new Error(`replace refused: ${why}`);
      if (p.blocked.length || juneTouched.length) throw new Error("replace refused: stop conditions present (blocked or June 2026 rows)");
      if (!(await consume(args.confirm_token))) throw new Error("replace refused: token already used");

      const snap = await store.exportSnapshot(site.id, "before replace_cocs");
      const w = planWrites(p);
      const counts = {
        adds: w.adds.length, updates: w.updates.length, superseded: w.superseded.length, unchanged: p.unchanged,
        scored: p.scored, pass: p.pass, fail: p.fail, review: p.review, not_scored: p.notScored,
        legacy_linked: p.legacyLinked, legacy_unlinked: p.legacyUnlinked,
        june_2026_rows_linked_for_signoff: summarize(p, juneIds).counts.june_2026_rows_linked_for_signoff,
      };
      let result;
      try {
        result = await store.replace(site.id, { ...w, counts }, `mcp-fortress replace_cocs: ${src.site}`, dataHash);
      } catch (e) {
        await store.logWrite({ tool: "replace_cocs", status: "failed", site_id: site.id, site: site.name, planned: counts, snapshot: snap.path, error: e.message });
        throw e;
      }
      const log = await store.logWrite({ tool: "replace_cocs", status: "ok", site_id: site.id, site: site.name, rows: result, planned: counts, snapshot: snap.path, source_hash: dataHash });
      return { site: { id: site.id, name: site.name }, written: result, snapshot: snap.path, log };
    },
  };
}
