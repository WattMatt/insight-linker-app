// The remote server's additional Fortress tools (the seven stdio tools live in mcp-fortress/src).
// Every query runs on `sb`, a client acting as the calling staff user (RLS applies), and every
// site-scoped tool first proves the site belongs to the Fortress client via store.fortressSite().
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractText, getDocumentProxy } from "unpdf";
import { canonical, isJune2026, sha256 } from "../../../mcp-fortress/src/core.mjs";
import type { Store } from "../../../mcp-fortress/src/store.mjs";
import {
  buildComparisonResults, buildInspectionMeterMatches, buildInspectionMeterRows, findUnregisteredMeters, summarizeResults,
  type AssetForComparison, type InspectionRecord, type SiteShop,
} from "@/lib/assetVerification";
import { buildCocReportModel, verdictKind } from "@/lib/siteCoc/cocReportModel";
import { buildSiteCocModel, loadSiteCocData } from "@/lib/siteCoc/siteCocData";
import { judgementRules, type RuleResult } from "@/lib/siteCoc/judgementRules";
import { storagePathFromUrl } from "@/lib/documents/paths";
import { isSnagOpen } from "@/lib/subsectionStatus";

type Row = Record<string, any>;
const must = <T>({ data, error }: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
};

/** Page through a query so a >1000-row result is never silently truncated. */
async function all(make: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>, what: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const page = must(await make(from, from + 999), what) ?? [];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

const chunks = <T>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export const REPORT_CATEGORIES: Record<string, string> = {
  "Site Summary Reports": "site-summary",
  "Asset Verification Reports": "asset-verification",
  "Site COC Reports": "site-coc",
  "Marking Checklists": "fortress-checklist",
  "COC Validation Reports": "coc-validation",
  "Floor Plan Reports": "floor-plan",
  "Site Drawing Reports": "site-drawing",
  "Generated Reports": "other",
};

const cls = (v: unknown) => {
  const u = String(v ?? "").trim().toUpperCase();
  return u.startsWith("PASS") ? "pass" : u.startsWith("FAIL") ? "fail" : u.startsWith("REVIEW") ? "review" : u ? "other" : "";
};

/** Shop counts over COC-required shops, from the Site COC Report model itself. */
function cocCounts(model: ReturnType<typeof buildCocReportModel>) {
  const c = { coc_required: model.summary.required, on_file: { pass: 0, fail: 0, review: 0 }, no_coc: 0, awaiting_sign_off: model.summary.awaitingSignOff };
  for (const t of model.tenants) {
    if (t.noCoc) { c.no_coc++; continue; }
    const k = t.coverage.verdictKind;
    if (k === "pass") c.on_file.pass++;
    else if (k === "fail") c.on_file.fail++;
    else c.on_file.review++;
  }
  return c;
}

export function createFortressTools(sb: SupabaseClient, store: Store, opts: { tokens: any; consumeToken: (t: string) => Promise<boolean>; isAdmin: boolean }) {
  async function subsections(siteId: string) {
    return all((f, t) => sb.from("subsections").select("id, name, tenant_name, shop_number, meter_serial_number, is_coc_required, updated_at")
      .eq("site_id", siteId).is("deleted_at", null).order("id").range(f, t), "subsections");
  }

  return {
    async list_fortress_sites() {
      const sites = await all((f, t) => sb.from("sites").select("id, name, address, managing_agency_id, consultant_name, consultant_contact")
        .eq("client_id", store.client.id).order("name").range(f, t), "sites");
      const ids = sites.map((s) => s.id);
      const [client, agencies, subs, certs] = await Promise.all([
        sb.from("clients").select("name, contact_person, email, primary_contact_email").eq("id", store.client.id).maybeSingle(),
        sb.from("managing_agencies").select("id, name").in("id", [...new Set(sites.map((s) => s.managing_agency_id).filter(Boolean))]),
        Promise.all(chunks(ids).map((c) => all((f, t) => sb.from("subsections").select("site_id").in("site_id", c).is("deleted_at", null).order("id").range(f, t), "subsections"))).then((x) => x.flat()),
        Promise.all(chunks(ids).map((c) => all((f, t) => sb.from("coc_certificates").select("site_id, superseded_at").in("site_id", c).order("id").range(f, t), "coc_certificates"))).then((x) => x.flat()),
      ]);
      const agency = new Map((must(agencies, "managing_agencies") ?? []).map((a: Row) => [a.id, a.name]));
      const count = (rows: Row[], id: string, f: (r: Row) => boolean = () => true) => rows.filter((r) => r.site_id === id && f(r)).length;
      const c = must(client, "clients") as Row | null;
      const emails = [...new Set([c?.email, c?.primary_contact_email].filter((e): e is string => typeof e === "string" && e.includes("@")))];
      return {
        client: { name: store.client.name, contact_person: c?.contact_person ?? null, contact_emails: emails },
        sites: sites.map((s) => ({
          id: s.id, name: s.name.trim(), address: s.address,
          managing_agent: s.managing_agency_id ? agency.get(s.managing_agency_id) ?? null : null,
          contact_emails: typeof s.consultant_contact === "string" && s.consultant_contact.includes("@") ? [s.consultant_contact] : [],
          coc_rows: count(certs, s.id), coc_rows_live: count(certs, s.id, (r) => !r.superseded_at), shops: count(subs, s.id),
        })),
        note: "contact_emails lists only what is stored: the Fortress client record and, per site, an email in consultant_contact.",
      };
    },

    async get_site_kpis({ site_id }: { site_id: string }) {
      const site = await store.fortressSite(site_id);
      const [subs, assets, inspections, coc] = await Promise.all([
        subsections(site_id),
        all((f, t) => sb.from("site_assets").select("*").eq("site_id", site_id).order("id").range(f, t), "site_assets"),
        all((f, t) => sb.from("inspections").select("id, title, subsection_id, json_data, updated_at").eq("site_id", site_id).not("json_data", "is", null).order("created_at", { ascending: false }).range(f, t), "inspections"),
        loadSiteCocData(site_id, sb),
      ]);
      const subIds = subs.map((s) => s.id);
      const snags = (await Promise.all(chunks(subIds).map((c) => all((f, t) => sb.from("snags").select("id, subsection_id, title, description, status, risk_level, created_at, updated_at")
        .in("subsection_id", c).is("deleted_at", null).order("id").range(f, t), "snags")))).flat();
      // Asset register: the same reconciliation as the Asset Verification tab and report.
      const shops = subs as unknown as SiteShop[];
      const electrical = (assets as unknown as AssetForComparison[]).filter((a) => a.asset_category === "electrical_meter");
      const results = buildComparisonResults(electrical, buildInspectionMeterMatches(inspections as unknown as InspectionRecord[], shops), shops);
      const stats = summarizeResults(results);
      const extra = findUnregisteredMeters(buildInspectionMeterRows(inspections as unknown as InspectionRecord[], shops), results);
      const shopName = new Map(subs.map((s) => [s.id, s.name]));
      const open = snags.filter((s) => isSnagOpen(s.status));
      const bySeverity: Record<string, { shop: string | null; title: string; text: string | null; status: string }[]> = {};
      for (const s of open) (bySeverity[s.risk_level ?? "unrated"] ??= []).push({ shop: shopName.get(s.subsection_id) ?? null, title: s.title, text: s.description ?? null, status: s.status });
      const model = buildSiteCocModel({ ...coc, siteId: site_id, siteName: site.name });
      const latest = [...subs, ...assets, ...inspections, ...snags, ...coc.certificates as Row[]].map((r) => r.updated_at).filter(Boolean).sort().pop() ?? null;
      return {
        site: { id: site.id, name: site.name.trim() },
        subsections: { total: subs.length, coc_required: subs.filter((s) => s.is_coc_required).length },
        asset_register: {
          total: stats.total, verified: stats.verified, verified_no_discrepancy: stats.verifiedNoDiscrepancy,
          discrepancies: stats.discrepancies, not_found: stats.unverified, extra_on_site: extra.length,
          electrical_meters_only: true,
        },
        coc: cocCounts(model),
        open_snags: { total: open.length, by_severity: Object.fromEntries(Object.entries(bySeverity).map(([k, v]) => [k, { count: v.length, snags: v }])) },
        data_as_of: { read_at: new Date().toISOString(), latest_update: latest },
      };
    },

    async get_site_coc_detail({ site_id }: { site_id: string }) {
      const site = await store.fortressSite(site_id);
      const coc = await loadSiteCocData(site_id, sb);
      const model = buildSiteCocModel({ ...coc, siteId: site_id, siteName: site.name });
      // Raw rows (not the model's translated ones) so verdict_alt and the delivered rule results show.
      const raw = (await store.certificates(site_id, "id, subsection_id, cert_no, cert_type, verdict, proposed_verdict, proposed_verdict_alt, review_status, rules, rule_results, superseded_at, signed_off_at"))
        .filter((r: Row) => !r.superseded_at && ["final", "signed_off", "proposed"].includes(r.review_status));
      const failing = (r: Row) => r.review_status === "proposed"
        ? Object.entries(judgementRules(r.rule_results as RuleResult[] | null)).filter(([, v]) => String(v).toUpperCase() === "FAIL").map(([k]) => k)
        : Object.entries((r.rules ?? {}) as Record<string, string>).filter(([, v]) => String(v).toUpperCase() === "FAIL").map(([k]) => k);
      const cert = (r: Row) => ({
        id: r.id, cert_no: r.cert_no, type: r.cert_type, review_status: r.review_status,
        verdict: r.verdict, verdict_alt: r.proposed_verdict_alt, proposed_verdict_strict: r.proposed_verdict,
        report_kind: r.review_status === "proposed" ? verdictKind(r.proposed_verdict_alt ?? r.proposed_verdict ?? "", judgementRules(r.rule_results)) : verdictKind(r.verdict, r.rules),
        failing_rules: failing(r), signed_off_at: r.signed_off_at,
      });
      const bySub = new Map<string, Row[]>();
      for (const r of raw) if (r.subsection_id) bySub.set(r.subsection_id, [...(bySub.get(r.subsection_id) ?? []), r]);
      return {
        site: { id: site.id, name: site.name.trim() },
        counts: cocCounts(model),
        shops: model.tenants.map((t) => ({
          shop: t.name, tenant: t.tenantName, subsection_id: t.subsectionId,
          status: t.noCoc ? "no_coc" : t.coverage.verdictKind, awaiting_sign_off: t.awaitingSignOff,
          certificates: (bySub.get(t.subsectionId) ?? []).map(cert), actions: t.actions,
        })),
        not_coc_required_shops_with_certs: [...bySub.keys()].filter((id) => !model.tenants.some((t) => t.subsectionId === id)).length,
        certificates_without_shop: raw.filter((r: Row) => !r.subsection_id).length,
        note: "status uses the Site COC Report's rule: any FAIL rule makes a certificate failed; shops with only proposed rows show their proposed judgement verdict and awaiting_sign_off = true.",
      };
    },

    async list_site_reports({ site_id }: { site_id: string }) {
      await store.fortressSite(site_id);
      const subs = await subsections(site_id);
      const shopName = new Map(subs.map((s) => [s.id, s.name]));
      const [siteDocs, subDocs] = await Promise.all([
        all((f, t) => sb.from("site_documents").select("id, category, file_name, file_size, created_at").eq("site_id", site_id).in("category", Object.keys(REPORT_CATEGORIES)).order("created_at", { ascending: false }).range(f, t), "site_documents"),
        Promise.all(chunks(subs.map((s) => s.id)).map((c) => all((f, t) => sb.from("subsection_documents").select("id, subsection_id, file_name, file_size, created_at, source_inspection_id, document_categories(name)")
          .in("subsection_id", c).order("id").range(f, t), "subsection_documents"))).then((x) => x.flat()),
      ]);
      const inspectionReports = subDocs.filter((d) => d.source_inspection_id || (d.document_categories as Row | null)?.name === "Inspection Reports");
      return {
        reports: [
          ...siteDocs.map((d) => ({ file_id: `site_documents:${d.id}`, kind: REPORT_CATEGORIES[d.category] ?? "other", category: d.category, file_name: d.file_name, bytes: d.file_size, created_at: d.created_at })),
          ...inspectionReports.map((d) => ({ file_id: `subsection_documents:${d.id}`, kind: "inspection", category: "Inspection Reports", shop: shopName.get(d.subsection_id) ?? null, file_name: d.file_name, bytes: d.file_size, created_at: d.created_at })),
        ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
      };
    },

    async get_report({ file_id }: { file_id: string }) {
      const [table, id] = file_id.includes(":") ? file_id.split(":") : ["", file_id];
      let doc: Row | null = null, siteId: string | null = null;
      if (table !== "subsection_documents") {
        doc = must(await sb.from("site_documents").select("id, site_id, file_name, file_url, category").eq("id", id).maybeSingle(), "site_documents");
        siteId = doc?.site_id ?? null;
      }
      if (!doc && table !== "site_documents") {
        doc = must(await sb.from("subsection_documents").select("id, subsection_id, file_name, file_url, subsections(site_id)").eq("id", id).maybeSingle(), "subsection_documents");
        siteId = (doc?.subsections as Row | null)?.site_id ?? null;
      }
      if (!doc || !siteId) throw new Error(`report ${file_id} not found (or not visible to you)`);
      await store.fortressSite(siteId);
      const path = storagePathFromUrl(doc.file_url);
      if (!path) throw new Error(`report ${file_id} is not a stored file`);
      const signed = must(await sb.storage.from("documents").createSignedUrl(path, 15 * 60), "storage") as { signedUrl: string };
      const blob = must(await sb.storage.from("documents").download(path), "storage download") as Blob;
      let text: string | null = null, pages: number | null = null, textError: string | null = null;
      try {
        const pdf = await getDocumentProxy(new Uint8Array(await blob.arrayBuffer()));
        const r = await extractText(pdf, { mergePages: true });
        text = r.text as string; pages = r.totalPages;
      } catch (e) { textError = e instanceof Error ? e.message : String(e); }
      return { file_id, file_name: doc.file_name, signed_url: signed.signedUrl, signed_url_expires_in_s: 900, pages, text, text_error: textError };
    },

    /** Same rules as the 27 Oct 2026 judgement run; conflicts, June 2026 links and other-shop links are held. */
    async sign_off_verdicts({ site_id, policy = "judgement", dry_run = true, confirm_token }: { site_id: string; policy?: string; dry_run?: boolean; confirm_token?: string }) {
      if (policy !== "judgement") throw new Error(`policy "${policy}" is not supported; only "judgement" (final verdict = verdict_alt)`);
      const site = await store.fortressSite(site_id);
      const [rows, batches] = await Promise.all([
        store.certificates(site_id, "id, subsection_id, cert_no, review_status, verdict, proposed_verdict_alt, rule_results, superseded_at, signed_off_at, supersedes_ids, import_batch_id, coc_document_id"),
        store.batches(site_id),
      ]);
      const juneBatch = new Set(batches.filter((b: Row) => isJune2026(b.created_at)).map((b: Row) => b.id));
      const june = (r: Row) => juneBatch.has(r.import_batch_id);
      const byId = new Map(rows.map((r: Row) => [r.id, r]));
      const ids: string[] = [], sup = new Set<string>();
      const held: { id: string; cert_no: string | null; why: string }[] = [];
      for (const p of rows.filter((r: Row) => !r.superseded_at && r.review_status === "proposed" && !r.signed_off_at)) {
        if (june(p)) { held.push({ id: p.id, cert_no: p.cert_no, why: "June 2026 row (read-only)" }); continue; }
        if (!String(p.proposed_verdict_alt ?? "").trim()) { held.push({ id: p.id, cert_no: p.cert_no, why: "no verdict_alt" }); continue; }
        const linked = (p.supersedes_ids ?? []).map((id: string) => byId.get(id)).filter((l: Row | undefined): l is Row => !!l && !l.superseded_at && !l.signed_off_at);
        if (linked.some((l: Row) => cls(l.verdict) && cls(l.verdict) !== cls(p.proposed_verdict_alt))) { held.push({ id: p.id, cert_no: p.cert_no, why: "an older final verdict differs (not overwritten)" }); continue; }
        if (linked.some(june)) { held.push({ id: p.id, cert_no: p.cert_no, why: "would supersede a June 2026 row" }); continue; }
        if (linked.some((l: Row) => l.subsection_id && l.subsection_id !== p.subsection_id)) { held.push({ id: p.id, cert_no: p.cert_no, why: "would supersede an older row on a different shop" }); continue; }
        ids.push(p.id); for (const l of linked) sup.add(l.id);
      }
      ids.sort();
      const state = sha256(canonical(rows.map((r: Row) => [r.id, r.review_status, r.verdict, r.proposed_verdict_alt, r.superseded_at, r.signed_off_at, r.supersedes_ids]).sort()));
      const dataHash = sha256(canonical({ policy, ids }));

      // Before/after shop counts with the Site COC Report model.
      const coc = await loadSiteCocData(site_id, sb);
      const before = cocCounts(buildSiteCocModel({ ...coc, siteId: site_id, siteName: site.name }));
      const signedSet = new Set(ids);
      const signedRows = (coc.proposedCertificates ?? []).filter((r) => signedSet.has(r.id));
      const after = cocCounts(buildSiteCocModel({
        ...coc, siteId: site_id, siteName: site.name,
        certificates: [...coc.certificates.filter((r) => !sup.has(r.id)), ...signedRows],
        proposedCertificates: (coc.proposedCertificates ?? []).filter((r) => !signedSet.has(r.id)),
      }));
      const heldCounts = held.reduce<Record<string, number>>((m, h) => ((m[h.why] = (m[h.why] ?? 0) + 1), m), {});
      const summary = { site: { id: site.id, name: site.name.trim() }, policy, to_sign: ids.length, would_supersede: sup.size, held: heldCounts, before, after };

      if (dry_run) {
        return {
          ...summary, writes_nothing: true, held_rows: held.slice(0, 50),
          confirm_token: ids.length ? opts.tokens.issue({ siteId: site.id, dataHash, planHash: state }) : null,
          note: ids.length ? "Apply with dry_run=false and this confirm_token within 15 minutes; it is refused if the site's COC rows change." : "Nothing to sign under these rules.",
          requires: "fortress.write scope and the Admin role",
        };
      }
      if (!opts.isAdmin) throw new Error("sign-off refused: requires the Admin role");
      const why = opts.tokens.check(confirm_token, { siteId: site.id, dataHash, planHash: state });
      if (why) throw new Error(`sign-off refused: ${why}`);
      if (!(await opts.consumeToken(confirm_token!))) throw new Error("sign-off refused: token already used");
      const snap = await store.exportSnapshot(site.id, "before sign_off_verdicts (judgement)");
      let result: unknown;
      try {
        result = await store.signOffJudgement(site.id, ids, sup.size);
      } catch (e) {
        await store.logWrite({ tool: "sign_off_verdicts", status: "failed", site_id: site.id, site: site.name, planned: { ids: ids.length, superseded: sup.size }, snapshot: snap.path, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      const log = await store.logWrite({ tool: "sign_off_verdicts", status: "ok", site_id: site.id, site: site.name, result, planned: { ids: ids.length, superseded: sup.size }, snapshot: snap.path });
      return { ...summary, written: result, snapshot: snap.path, log };
    },
  };
}
