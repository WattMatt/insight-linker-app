// Data access for mcp-fortress. Takes a Supabase client that already acts as a staff user
// (row-level security applies), scopes every call to Fortress_Fund sites, and writes only through
// fortress_replace_cocs() / fortress_sign_off_judgement(). Snapshots and the write log go to
// pluggable sinks: local files for the stdio server (fileSinks), database tables for the remote one.
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isJune2026, slug } from "./core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LIST_COLS = "id, record_key, cert_no, cert_type, doc_type, issued_date, subsection_id, verdict, proposed_verdict, review_status, superseded_at, signed_off_at, import_batch_id, db_name, location, source_file";

export function dataDir() {
  const d = process.env.FORTRESS_MCP_DATA_DIR || "./data";
  return isAbsolute(d) ? d : resolve(ROOT, d);
}

/** Local-file sinks (stdio server): data/snapshots/<yyyy-mm-dd>/ and data/logs/writes.jsonl. */
export function fileSinks() {
  return {
    async saveSnapshot(snap) {
      const day = snap.taken_at.slice(0, 10);
      const file = join(dataDir(), "snapshots", day, `${slug(snap.site.name)}_${snap.taken_at.slice(11, 19).replace(/:/g, "")}_${snap.site.id.slice(0, 8)}.json`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(snap, null, 1));
      return file;
    },
    async logWrite(entry) {
      const file = join(dataDir(), "logs", "writes.jsonl");
      mkdirSync(dirname(file), { recursive: true });
      appendFileSync(file, JSON.stringify(entry) + "\n");
      return file;
    },
  };
}

/**
 * Store for an already-authenticated client. Resolves the Fortress client row visible to it.
 * @param sb      supabase-js client acting as the staff user
 * @param user    { id, email }
 * @param host    database host label recorded in snapshots/logs
 * @param sinks   { saveSnapshot(snap) -> ref, logWrite(entry) -> ref }
 */
export async function storeFor(sb, user, host, sinks = fileSinks()) {
  const clientName = process.env.FORTRESS_CLIENT_NAME || "Fortress_Fund";
  const { data: client, error } = await sb.from("clients").select("id, name").eq("name", clientName).maybeSingle();
  if (error) throw new Error(`clients: ${error.message}`);
  if (!client) throw new Error(`client "${clientName}" not visible to this user`);
  return new Store(sb, client, user, host, sinks);
}

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

export class Store {
  constructor(sb, client, user, host, sinks = fileSinks()) { this.sb = sb; this.client = client; this.user = user; this.host = host; this.sinks = sinks; }

  async listSites(filter) {
    let q = this.sb.from("sites").select("id, name, address").eq("client_id", this.client.id).order("name");
    if (filter) q = q.ilike("name", `%${filter.replace(/[%_]/g, m => `\\${m}`)}%`);
    return must(await q, "sites");
  }

  /** Throws unless site_id is a Fortress site. Every site-scoped tool calls this first. */
  async fortressSite(siteId) {
    const site = must(await this.sb.from("sites").select("id, name, address, client_id").eq("id", siteId).maybeSingle(), "sites");
    if (!site || site.client_id !== this.client.id) throw new Error(`site ${siteId} is not a ${this.client.name} site (refused)`);
    return site;
  }

  async batches(siteId) {
    return must(await this.sb.from("coc_import_batches").select("id, kind, created_at, source_label, certs_imported, counts").eq("site_id", siteId).order("created_at"), "coc_import_batches");
  }

  async certificates(siteId, cols = "*") {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const page = must(await this.sb.from("coc_certificates").select(cols).eq("site_id", siteId).order("id").range(from, from + 999), "coc_certificates");
      out.push(...page);
      if (page.length < 1000) return out;
    }
  }

  async juneIds(siteId) {
    const june = new Set((await this.batches(siteId)).filter(b => isJune2026(b.created_at)).map(b => b.id));
    const rows = await this.certificates(siteId, "id, import_batch_id");
    return new Set(rows.filter(r => june.has(r.import_batch_id)).map(r => r.id));
  }

  async getSite(siteId) {
    const site = await this.fortressSite(siteId);
    const [rows, batches] = await Promise.all([this.certificates(siteId, LIST_COLS), this.batches(siteId)]);
    const june = new Set(batches.filter(b => isJune2026(b.created_at)).map(b => b.id));
    const live = rows.filter(r => !r.superseded_at);
    const n = f => rows.filter(f).length;
    return {
      site,
      coc_rows: {
        total: rows.length, live: live.length, superseded: rows.length - live.length,
        live_final: live.filter(r => r.review_status === "final").length,
        live_proposed: live.filter(r => r.review_status === "proposed").length,
        signed_off: n(r => r.signed_off_at), rejected: n(r => r.review_status === "rejected"),
        live_legacy: live.filter(r => !r.record_key).length,
        june_2026_rows_read_only: n(r => june.has(r.import_batch_id)),
      },
      import_batches: batches.map(b => ({ id: b.id, kind: b.kind, created_at: b.created_at, label: b.source_label, june_2026_read_only: isJune2026(b.created_at) })),
    };
  }

  async listCocs(siteId, includeSuperseded) {
    await this.fortressSite(siteId);
    const rows = await this.certificates(siteId, LIST_COLS);
    return includeSuperseded ? rows : rows.filter(r => !r.superseded_at);
  }

  async getVerdicts(siteId) {
    await this.fortressSite(siteId);
    const rows = (await this.certificates(siteId, "id, record_key, cert_no, subsection_id, verdict, proposed_verdict, proposed_verdict_alt, review_status, reasons, rule_results, rules, flags, caveats, superseded_at, signed_off_at, sign_off_note"))
      .filter(r => !r.superseded_at);
    const subIds = [...new Set(rows.map(r => r.subsection_id).filter(Boolean))];
    const subs = subIds.length ? must(await this.sb.from("subsections").select("id, name").in("id", subIds), "subsections") : [];
    const shop = new Map(subs.map(s => [s.id, s.name]));
    const tally = (k) => rows.reduce((m, r) => { const v = r[k] ?? "(none)"; m[v] = (m[v] ?? 0) + 1; return m; }, {});
    return {
      summary: { live_rows: rows.length, final_verdict: tally("verdict"), proposed_verdict: tally("proposed_verdict"), review_status: tally("review_status") },
      rows: rows.map(r => ({
        id: r.id, record_key: r.record_key, cert_no: r.cert_no, shop: shop.get(r.subsection_id) ?? null,
        review_status: r.review_status, verdict: r.verdict, proposed_verdict: r.proposed_verdict,
        proposed_verdict_alt: r.proposed_verdict_alt, reasons: r.reasons,
        failed_rules: (r.rule_results ?? []).filter(x => x.res && x.res !== "PASS"),
        flags: r.flags, caveats: r.caveats, signed_off_at: r.signed_off_at, sign_off_note: r.sign_off_note,
      })),
    };
  }

  /** Full JSON copy of the site's COC tables, written to the snapshot sink. Returns its reference. */
  async exportSnapshot(siteId, reason = "manual") {
    const site = await this.fortressSite(siteId);
    const [certs, batches, schedule] = await Promise.all([
      this.certificates(siteId),
      must(await this.sb.from("coc_import_batches").select("*").eq("site_id", siteId).order("created_at"), "coc_import_batches"),
      must(await this.sb.from("coc_db_schedule").select("*").eq("site_id", siteId).order("id"), "coc_db_schedule"),
    ]);
    const counts = { coc_certificates: certs.length, coc_import_batches: batches.length, coc_db_schedule: schedule.length };
    const path = await this.sinks.saveSnapshot({
      taken_at: new Date().toISOString(), reason, source_host: this.host, user: this.user.email, site, counts,
      coc_certificates: certs, coc_import_batches: batches, coc_db_schedule: schedule,
    });
    return { path, counts };
  }

  async replace(siteId, plan, label, sourceHash) {
    return must(await this.sb.rpc("fortress_replace_cocs", { p_site_id: siteId, p_plan: plan, p_label: label, p_source_hash: sourceHash }), "fortress_replace_cocs");
  }

  async signOffJudgement(siteId, ids, expectSuperseded) {
    return must(await this.sb.rpc("fortress_sign_off_judgement", { p_site_id: siteId, p_ids: ids, p_expect_superseded: expectSuperseded }), "fortress_sign_off_judgement");
  }

  async logWrite(entry) {
    return this.sinks.logWrite({ at: new Date().toISOString(), host: this.host, user: this.user.email, ...entry });
  }
}
