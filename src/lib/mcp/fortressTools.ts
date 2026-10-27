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
import { planCertLinks, type LinkDecision } from "@/lib/siteCoc/linkCerts";
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

/** Auth facts per user id (service-role read; only for ids already found on the Fortress client). */
export type AuthFacts = { last_sign_in_at: string | null; email_confirmed_at: string | null; invited_at: string | null; created_at: string | null };

export type PortalOpts = {
  /** Public origin of this deployment, used to build portal links. */
  origin: string;
  /** Auth facts for the given user ids. */
  authFacts: (ids: string[]) => Promise<Map<string, AuthFacts>>;
  /** Calls the app's invite-user edge function as the calling user (Admin-gated there too). */
  inviteUser: (body: Record<string, unknown>) => Promise<{ ok: boolean; status: number; body: unknown }>;
};

const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Portal status of one user, from auth facts. */
export function portalStatus(a: AuthFacts | undefined): "active" | "invited_never_signed_in" | "no_auth_record" {
  if (!a) return "no_auth_record";
  return a.last_sign_in_at ? "active" : "invited_never_signed_in";
}

export function createFortressTools(sb: SupabaseClient, store: Store, opts: { tokens: any; consumeToken: (t: string) => Promise<boolean>; isAdmin: boolean; portal?: PortalOpts }) {
  async function subsections(siteId: string) {
    return all((f, t) => sb.from("subsections").select("id, name, tenant_name, shop_number, meter_serial_number, is_coc_required, updated_at")
      .eq("site_id", siteId).is("deleted_at", null).order("id").range(f, t), "subsections");
  }

  const portal = () => {
    if (!opts.portal) throw new Error("portal tools are not configured on this server");
    return opts.portal;
  };

  /** Every portal user on the Fortress client, with role, agency scope, sign-in state and visible sites. */
  async function portalUsers() {
    const p = portal();
    // RLS shows user_clients / profiles / pending_user_invites of other people to Admins only; a
    // non-admin would get empty lists and every recipient would read as "not_a_user".
    if (!opts.isAdmin) throw new Error("portal user tools require the Admin role (other users' accounts are hidden from non-admins)");
    const [maps, agencies, sites, pending] = await Promise.all([
      all((f, t) => sb.from("user_clients").select("user_id, managing_agency_id, created_at").eq("client_id", store.client.id).order("user_id").range(f, t), "user_clients"),
      sb.from("managing_agencies").select("id, name").eq("client_id", store.client.id),
      all((f, t) => sb.from("sites").select("id, name, managing_agency_id").eq("client_id", store.client.id).order("name").range(f, t), "sites"),
      all((f, t) => sb.from("pending_user_invites").select("id, email, full_name, invited_at, created_at").order("id").range(f, t), "pending_user_invites"),
    ]);
    const agencyName = new Map((must(agencies, "managing_agencies") ?? []).map((a: Row) => [a.id, a.name]));
    const ids = maps.map((m) => m.user_id);
    const [profiles, roles, facts] = await Promise.all([
      Promise.all(chunks(ids).map((c) => all((f, t) => sb.from("profiles").select("id, email, full_name, company, job_title").in("id", c).order("id").range(f, t), "profiles"))).then((x) => x.flat()),
      Promise.all(chunks(ids).map((c) => all((f, t) => sb.from("user_roles").select("user_id, role").in("user_id", c).order("user_id").range(f, t), "user_roles"))).then((x) => x.flat()),
      ids.length ? p.authFacts(ids) : Promise.resolve(new Map<string, AuthFacts>()),
    ]);
    const prof = new Map(profiles.map((r) => [r.id, r]));
    const roleOf = new Map<string, string[]>();
    for (const r of roles) roleOf.set(r.user_id, [...(roleOf.get(r.user_id) ?? []), String(r.role)]);
    const users = maps.map((m) => {
      const pr = prof.get(m.user_id) ?? {};
      const visible = sites.filter((s) => !m.managing_agency_id || s.managing_agency_id === m.managing_agency_id);
      const a = facts.get(m.user_id);
      return {
        user_id: m.user_id, email: pr.email ?? null, full_name: pr.full_name ?? null, company: pr.company ?? null, job_title: pr.job_title ?? null,
        roles: roleOf.get(m.user_id) ?? [], agency_scope: m.managing_agency_id ? agencyName.get(m.managing_agency_id) ?? m.managing_agency_id : "all (fund level)",
        managing_agency_id: m.managing_agency_id, status: portalStatus(a), last_sign_in_at: a?.last_sign_in_at ?? null, invited_at: a?.invited_at ?? null,
        visible_site_ids: visible.map((s) => s.id), visible_sites: visible.length,
      };
    });
    const known = new Set(users.map((u) => normEmail(u.email)));
    const pendingOnly = pending.filter((r) => !known.has(normEmail(r.email)));
    return { users, pendingOnly, sites, agencyName };
  }

  const portalSiteUrl = (siteId: string) => `${portal().origin}/client-portal/sites/${siteId}`;

  return {
    async list_portal_users() {
      const { users, pendingOnly } = await portalUsers();
      const by = users.reduce<Record<string, number>>((m, u) => ((m[u.status] = (m[u.status] ?? 0) + 1), m), {});
      return {
        client: store.client.name, total: users.length, by_status: by,
        users: users.map(({ visible_site_ids, ...u }) => u),
        pending_invites_not_sent_or_unlinked: pendingOnly.map((r) => ({ email: r.email, full_name: r.full_name, invited_at: r.invited_at, created_at: r.created_at })),
        note: "status: active = has signed in at least once; invited_never_signed_in = account exists but has never signed in (link may have expired). pending_user_invites rows are not linked to a client, so they are listed only when no Fortress user has that email.",
      };
    },

    async check_portal_access({ site_id, emails }: { site_id: string; emails: string[] }) {
      const site = await store.fortressSite(site_id);
      const { users, pendingOnly } = await portalUsers();
      const byEmail = new Map(users.map((u) => [normEmail(u.email), u]));
      const pendingByEmail = new Map(pendingOnly.map((r) => [normEmail(r.email), r]));
      // Emails held by accounts outside the Fortress client (staff or another client) - read via profiles under RLS.
      const asked = [...new Set(emails.map(normEmail).filter(Boolean))];
      const others = asked.length
        ? must(await sb.from("profiles").select("id, email").in("email", asked.filter((e) => !byEmail.has(e))), "profiles") ?? []
        : [];
      const otherEmails = new Set((others as Row[]).map((r) => normEmail(r.email)));
      const results = asked.map((e) => {
        if (!EMAIL.test(e)) return { email: e, verdict: "invalid_email", can_see_site: false };
        const u = byEmail.get(e);
        if (u) {
          const canSee = u.visible_site_ids.includes(site.id);
          return {
            email: e, full_name: u.full_name, agency_scope: u.agency_scope, status: u.status, last_sign_in_at: u.last_sign_in_at, can_see_site: canSee,
            verdict: !canSee ? "user_but_site_outside_scope" : u.status === "active" ? "ok" : "needs_resend",
          };
        }
        if (otherEmails.has(e)) return { email: e, verdict: "account_not_on_fortress_client", can_see_site: false };
        if (pendingByEmail.has(e)) return { email: e, verdict: "pending_invite_only", can_see_site: false, invited_at: pendingByEmail.get(e)!.invited_at };
        return { email: e, verdict: "not_a_user", can_see_site: false };
      });
      return {
        site: { id: site.id, name: site.name.trim() }, portal_url: portalSiteUrl(site.id),
        ok: results.filter((r) => r.verdict === "ok").length, needs_action: results.filter((r) => r.verdict !== "ok").length, results,
        note: "Only 'ok' recipients can open portal_url today. needs_resend / not_a_user / pending_invite_only can be fixed with invite_portal_users.",
      };
    },

    async get_portal_links({ site_id }: { site_id: string }) {
      const site = await store.fortressSite(site_id);
      const { data: s } = await sb.from("sites").select("managing_agency_id").eq("id", site.id).maybeSingle();
      const agencyId = (s as Row | null)?.managing_agency_id ?? null;
      const links = must(await sb.from("client_access_links").select("id, label, link_type, access_token, site_id, managing_agency_id, is_active, expires_at, last_accessed_at")
        .eq("client_id", store.client.id).eq("is_active", true), "client_access_links") as Row[] ?? [];
      const now = Date.now();
      const usable = links.filter((l) => (!l.expires_at || Date.parse(l.expires_at) > now)
        && (!l.site_id || l.site_id === site.id) && (!l.managing_agency_id || l.managing_agency_id === agencyId));
      return {
        site: { id: site.id, name: site.name.trim() },
        portal_url: portalSiteUrl(site.id), portal_login_required: true,
        share_links: usable.map((l) => ({
          label: l.label, link_type: l.link_type, scope: l.site_id ? "this site" : l.managing_agency_id ? "agency portfolio" : "whole Fortress portfolio",
          url: `${portal().origin}/${l.link_type === "client" ? "portfolio" : "review"}/${l.access_token}`, expires_at: l.expires_at, last_accessed_at: l.last_accessed_at,
        })),
        note: "portal_url needs a portal account that can see this site (check_portal_access). share_links open without a login - anyone holding the link can view, so treat them as forwardable.",
      };
    },

    /** Invite or re-invite Fortress portal users through the app's invite-user edge function. */
    async invite_portal_users({ users: req, dry_run = true, confirm_token }: { users: { email: string; full_name?: string; agency?: string }[]; dry_run?: boolean; confirm_token?: string }) {
      const p = portal();
      const { users, agencyName } = await portalUsers();
      const byEmail = new Map(users.map((u) => [normEmail(u.email), u]));
      const agencyByName = new Map([...agencyName.entries()].map(([id, n]) => [String(n).trim().toLowerCase(), id]));
      const asked = [...new Map(req.map((r) => [normEmail(r.email), r])).values()];
      const staffOrOther = asked.length
        ? new Set(((must(await sb.from("profiles").select("email").in("email", asked.map((r) => normEmail(r.email)).filter((e) => !byEmail.has(e))), "profiles") ?? []) as Row[]).map((r) => normEmail(r.email)))
        : new Set<string>();
      const plan: { email: string; full_name: string; action: "invite" | "resend"; managing_agency_id: string | null; agency: string }[] = [];
      const skipped: { email: string; why: string }[] = [];
      for (const r of asked) {
        const e = normEmail(r.email);
        if (!EMAIL.test(e)) { skipped.push({ email: e, why: "invalid email" }); continue; }
        const agencyKey = String(r.agency ?? "").trim().toLowerCase();
        if (!agencyKey) { skipped.push({ email: e, why: `agency is required (${[...agencyName.values()].join(", ")} or "all" for fund level)` }); continue; }
        const agencyId = agencyKey === "all" || agencyKey === "fund" ? null : agencyByName.get(agencyKey);
        if (agencyId === undefined) { skipped.push({ email: e, why: `unknown agency "${r.agency}" (use ${[...agencyName.values()].join(", ")} or "all")` }); continue; }
        const u = byEmail.get(e);
        if (u) {
          if (u.status === "active") { skipped.push({ email: e, why: "already active on the portal" }); continue; }
          if (u.roles.some((x) => x !== "Client")) { skipped.push({ email: e, why: `account has role(s) ${u.roles.join(", ")}; not touched` }); continue; }
          if ((u.managing_agency_id ?? null) !== agencyId) { skipped.push({ email: e, why: `agency scope differs (${u.agency_scope}); change it in the app, not here` }); continue; }
          plan.push({ email: e, full_name: r.full_name ?? u.full_name ?? "", action: "resend", managing_agency_id: agencyId, agency: u.agency_scope });
          continue;
        }
        if (staffOrOther.has(e)) { skipped.push({ email: e, why: "account exists outside the Fortress client (staff or another client); not touched" }); continue; }
        plan.push({ email: e, full_name: r.full_name ?? "", action: "invite", managing_agency_id: agencyId, agency: agencyId ? agencyName.get(agencyId)! : "all (fund level)" });
      }
      plan.sort((a, b) => a.email.localeCompare(b.email));
      const dataHash = sha256(canonical(plan));
      const state = sha256(canonical(users.map((u) => [u.user_id, u.status, u.managing_agency_id]).sort()));
      if (dry_run) {
        return {
          writes_nothing: true, to_invite: plan.filter((x) => x.action === "invite"), to_resend: plan.filter((x) => x.action === "resend"), skipped,
          confirm_token: plan.length ? opts.tokens.issue({ siteId: store.client.id, dataHash, planHash: state }) : null,
          note: "Applying sends each person an invite email from the app (role Client on Fortress_Fund, agency scope as listed). Requires fortress.write and the Admin role.",
        };
      }
      if (!opts.isAdmin) throw new Error("invite refused: requires the Admin role");
      const why = opts.tokens.check(confirm_token, { siteId: store.client.id, dataHash, planHash: state });
      if (why) throw new Error(`invite refused: ${why}`);
      if (!(await opts.consumeToken(confirm_token!))) throw new Error("invite refused: token already used");
      const results: { email: string; action: string; ok: boolean; status: number; error?: string }[] = [];
      for (const x of plan) {
        const r = await p.inviteUser({
          email: x.email, fullName: x.full_name, role: "Client", clientId: store.client.id,
          ...(x.managing_agency_id ? { managingAgencyId: x.managing_agency_id } : {}), ...(x.action === "resend" ? { isResend: true } : {}),
        });
        const b = r.body as Row | null;
        const ok = r.ok && b?.success !== false;
        results.push({ email: x.email, action: x.action, ok, status: r.status, ...(ok ? {} : { error: String(b?.error ?? b?.message ?? `HTTP ${r.status}`) }) });
      }
      const log = await store.logWrite({ tool: "invite_portal_users", status: results.every((r) => r.ok) ? "ok" : "partial", site: store.client.name, results });
      return { results, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, skipped, log };
    },

    /** Re-sign strict-signed rows to the judgement verdict (ruling of 27 Oct 2026). June 2026 rows are never touched. */
    async resign_signed_verdicts({ site_id, dry_run = true, confirm_token }: { site_id: string; dry_run?: boolean; confirm_token?: string }) {
      const site = await store.fortressSite(site_id);
      const [rows, batches] = await Promise.all([
        store.certificates(site_id, "id, subsection_id, cert_no, review_status, verdict, rules, proposed_verdict_alt, rule_results, superseded_at, signed_off_at, import_batch_id, sign_off_note, coc_document_id"),
        store.batches(site_id),
      ]);
      const juneBatch = new Set(batches.filter((b: Row) => isJune2026(b.created_at)).map((b: Row) => b.id));
      const same = (a: unknown, b: unknown) => canonical(a ?? null) === canonical(b ?? null);
      const candidates = rows.filter((r: Row) => r.review_status === "signed_off" && r.signed_off_at && !r.superseded_at
        && String(r.proposed_verdict_alt ?? "").trim() && r.rule_results
        && (r.verdict !== r.proposed_verdict_alt || !same(r.rules, judgementRules(r.rule_results as RuleResult[]))));
      const held = candidates.filter((r: Row) => juneBatch.has(r.import_batch_id)).map((r: Row) => ({ id: r.id, cert_no: r.cert_no, why: "June 2026 row (read-only)" }));
      const todo = candidates.filter((r: Row) => !juneBatch.has(r.import_batch_id));
      const ids = todo.map((r: Row) => r.id).sort();
      const state = sha256(canonical(rows.map((r: Row) => [r.id, r.review_status, r.verdict, r.rules, r.proposed_verdict_alt, r.superseded_at, r.signed_off_at]).sort()));
      const dataHash = sha256(canonical({ resign: ids }));

      const coc = await loadSiteCocData(site_id, sb);
      const before = cocCounts(buildSiteCocModel({ ...coc, siteId: site_id, siteName: site.name }));
      const idSet = new Set(ids);
      const after = cocCounts(buildSiteCocModel({
        ...coc, siteId: site_id, siteName: site.name,
        certificates: coc.certificates.map((r) => idSet.has(r.id) ? { ...r, verdict: (r as Row).proposed_verdict_alt, rules: judgementRules((r as Row).rule_results as RuleResult[]) } : r),
      }));
      const changes = todo.map((r: Row) => ({ id: r.id, cert_no: r.cert_no, verdict_now: r.verdict, verdict_after: r.proposed_verdict_alt, rules_only: r.verdict === r.proposed_verdict_alt }));
      const summary = { site: { id: site.id, name: site.name.trim() }, to_resign: ids.length, verdict_changes: changes.filter((c) => !c.rules_only).length, rules_only_changes: changes.filter((c) => c.rules_only).length, held, before, after };
      if (dry_run) {
        return {
          ...summary, writes_nothing: true, changes: changes.slice(0, 100),
          confirm_token: ids.length ? opts.tokens.issue({ siteId: site.id, dataHash, planHash: state }) : null,
          note: ids.length ? "Apply with dry_run=false and this confirm_token within 15 minutes; refused if the site's COC rows change." : "Every signed-off row already carries its judgement verdict.",
          requires: "fortress.write scope and the Admin role",
        };
      }
      if (!opts.isAdmin) throw new Error("re-sign refused: requires the Admin role");
      const why = opts.tokens.check(confirm_token, { siteId: site.id, dataHash, planHash: state });
      if (why) throw new Error(`re-sign refused: ${why}`);
      if (!(await opts.consumeToken(confirm_token!))) throw new Error("re-sign refused: token already used");
      const snap = await store.exportSnapshot(site.id, "before resign_signed_verdicts (judgement)");
      let result: unknown;
      try {
        const stamp = `re-signed to judgement ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;
        result = await store.resignJudgement(site.id, todo.map((r: Row) => ({
          id: r.id, verdict_alt: r.proposed_verdict_alt, rules: judgementRules(r.rule_results as RuleResult[]), coc_document_id: r.coc_document_id ?? null,
          note: [String(r.sign_off_note ?? "").trim(), `${stamp} (was ${r.verdict ?? "blank"})`].filter(Boolean).join(" | "),
        })));
      } catch (e) {
        await store.logWrite({ tool: "resign_signed_verdicts", status: "failed", site_id: site.id, site: site.name, planned: { ids: ids.length }, snapshot: snap.path, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      const log = await store.logWrite({ tool: "resign_signed_verdicts", status: "ok", site_id: site.id, site: site.name, result, planned: { ids: ids.length }, snapshot: snap.path });
      return { ...summary, written: result, snapshot: snap.path, log };
    },

    /** Flag a site's shops as COC-required (all shops not yet flagged, or the named ones). */
    async set_coc_required({ site_id, shops, dry_run = true, confirm_token }: { site_id: string; shops?: string[]; dry_run?: boolean; confirm_token?: string }) {
      const site = await store.fortressSite(site_id);
      const [subs, certs] = await Promise.all([store.subsections(site_id), store.certificates(site_id, "id, subsection_id, superseded_at, review_status")]);
      const withCert = new Set(certs.filter((c: Row) => c.subsection_id && !c.superseded_at && c.review_status !== "rejected").map((c: Row) => c.subsection_id));
      const want = shops?.length ? new Set(shops.map((x) => x.trim().toUpperCase())) : null;
      const todo: { id: string; shop: string; tenant: string | null; has_certificates: boolean }[] = subs
        .filter((x: Row) => x.is_coc_required !== true && (!want || want.has(String(x.name).trim().toUpperCase())))
        .map((x: Row) => ({ id: String(x.id), shop: String(x.name), tenant: x.tenant_name ?? null, has_certificates: withCert.has(x.id) }));
      const unknown = want ? [...want].filter((n) => !subs.some((x: Row) => String(x.name).trim().toUpperCase() === n)) : [];
      const ids = todo.map((t) => t.id).sort();
      const state = sha256(canonical(subs.map((x: Row) => [x.id, x.is_coc_required]).sort()));
      const dataHash = sha256(canonical({ flag: ids }));
      const summary = { site: { id: site.id, name: site.name.trim() }, shops_total: subs.length, coc_required_now: subs.filter((x: Row) => x.is_coc_required === true).length, to_flag: ids.length, with_certificates: todo.filter((t) => t.has_certificates).length, unknown_shops: unknown, shops: todo };
      if (dry_run) {
        return { ...summary, writes_nothing: true, confirm_token: ids.length ? opts.tokens.issue({ siteId: site.id, dataHash, planHash: state }) : null,
          note: ids.length ? "Apply with dry_run=false and this confirm_token within 15 minutes; refused if the site's shop flags change." : "Nothing to flag.", requires: "fortress.write scope and the Admin role" };
      }
      if (!opts.isAdmin) throw new Error("set_coc_required refused: requires the Admin role");
      const why = opts.tokens.check(confirm_token, { siteId: site.id, dataHash, planHash: state });
      if (why) throw new Error(`set_coc_required refused: ${why}`);
      if (!(await opts.consumeToken(confirm_token!))) throw new Error("set_coc_required refused: token already used");
      let result: unknown;
      try { result = await store.setCocRequired(site.id, ids); }
      catch (e) { await store.logWrite({ tool: "set_coc_required", status: "failed", site_id: site.id, site: site.name, planned: { ids: ids.length }, error: e instanceof Error ? e.message : String(e) }); throw e; }
      const log = await store.logWrite({ tool: "set_coc_required", status: "ok", site_id: site.id, site: site.name, result, planned: { ids: ids.length, before_flags: subs.map((x: Row) => [x.id, x.is_coc_required]) } });
      return { ...summary, written: result, log };
    },

    /** Link live certificate rows that have no shop to a shop (schedule, shop number, or a clear name match). June 2026 rows are held. */
    async link_unlinked_cocs({ site_id, dry_run = true, confirm_token }: { site_id: string; dry_run?: boolean; confirm_token?: string }) {
      const site = await store.fortressSite(site_id);
      const [rows, subs, batches, coc] = await Promise.all([
        store.certificates(site_id, "id, subsection_id, cert_no, cert_no_norm, shop_no_raw, source_file, db_name, location, review_status, superseded_at, import_batch_id, notes"),
        store.subsections(site_id), store.batches(site_id), loadSiteCocData(site_id, sb),
      ]);
      const juneBatch = new Set(batches.filter((b: Row) => isJune2026(b.created_at)).map((b: Row) => b.id));
      const live = rows.filter((r: Row) => !r.subsection_id && !r.superseded_at && r.review_status !== "rejected");
      const held = live.filter((r: Row) => juneBatch.has(r.import_batch_id)).map((r: Row) => ({ id: r.id, cert_no: r.cert_no, why: "June 2026 row (read-only)" }));
      const todo = live.filter((r: Row) => !juneBatch.has(r.import_batch_id));
      const plan: LinkDecision[] = planCertLinks(todo as any, subs as any, coc.schedule as any, { siteName: site.name, siteAddress: (site as Row).address ?? null });
      const assign = plan.filter((d) => d.outcome === "assign");
      const review = plan.filter((d) => d.outcome === "review");
      const unmatched = plan.filter((d) => d.outcome === "unmatched");
      const linkMap = new Map(assign.map((d) => [d.id, d.subsection_id!]));
      const state = sha256(canonical(rows.map((r: Row) => [r.id, r.subsection_id, r.superseded_at]).sort()));
      const dataHash = sha256(canonical({ links: assign.map((d) => [d.id, d.subsection_id]).sort() }));
      const before = cocCounts(buildSiteCocModel({ ...coc, siteId: site_id, siteName: site.name }));
      const after = cocCounts(buildSiteCocModel({ ...coc, siteId: site_id, siteName: site.name,
        certificates: coc.certificates.map((r) => linkMap.has(r.id) ? { ...r, subsection_id: linkMap.get(r.id)! } : r) }));
      const byMethod = { schedule: assign.filter((d) => d.method === "schedule").length, shop_no: assign.filter((d) => d.method === "shop_no").length, name: assign.filter((d) => d.method === "name").length };
      const summary = { site: { id: site.id, name: site.name.trim() }, unlinked: live.length, to_link: assign.length, by_method: byMethod, needs_review: review.length, unmatched: unmatched.length, held, before, after };
      if (dry_run) {
        return { ...summary, writes_nothing: true, links: assign, review: review.slice(0, 150), unmatched_rows: unmatched.slice(0, 150).map((d) => ({ id: d.id, cert_no: d.cert_no, query: d.query, candidates: d.candidates })),
          confirm_token: assign.length ? opts.tokens.issue({ siteId: site.id, dataHash, planHash: state }) : null,
          note: assign.length ? "Apply with dry_run=false and this confirm_token within 15 minutes; refused if the site's COC rows change. Only the 'links' are written; 'review' and 'unmatched' are left for a person." : "Nothing can be linked with confidence.",
          requires: "fortress.write scope and the Admin role" };
      }
      if (!opts.isAdmin) throw new Error("link refused: requires the Admin role");
      const why = opts.tokens.check(confirm_token, { siteId: site.id, dataHash, planHash: state });
      if (why) throw new Error(`link refused: ${why}`);
      if (!(await opts.consumeToken(confirm_token!))) throw new Error("link refused: token already used");
      const snap = await store.exportSnapshot(site.id, "before link_unlinked_cocs");
      const stamp = new Date().toISOString().slice(0, 10);
      const noteFor = (d: LinkDecision, prev: unknown) => [String(prev ?? "").trim(), `Shop assigned ${stamp} by mcp link_unlinked_cocs (${d.method}${d.score !== undefined && d.method === "name" ? ` ${d.score}` : ""}${d.query ? `: ${d.query}` : ""})`].filter(Boolean).join(" | ");
      const prevNote = new Map(todo.map((r: Row) => [r.id, r.notes]));
      let result: unknown;
      try { result = await store.linkCertificates(site.id, assign.map((d) => ({ id: d.id, subsection_id: d.subsection_id!, note: noteFor(d, prevNote.get(d.id)) }))); }
      catch (e) { await store.logWrite({ tool: "link_unlinked_cocs", status: "failed", site_id: site.id, site: site.name, planned: { links: assign.length }, snapshot: snap.path, error: e instanceof Error ? e.message : String(e) }); throw e; }
      const log = await store.logWrite({ tool: "link_unlinked_cocs", status: "ok", site_id: site.id, site: site.name, result, planned: { links: assign.map((d) => [d.id, d.subsection_id, d.method]) }, snapshot: snap.path });
      return { ...summary, written: result, snapshot: snap.path, log };
    },

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
        Promise.all(chunks(subs.map((s) => s.id)).map((c) => all((f, t) => sb.from("subsection_documents").select("id, subsection_id, file_name, file_size, uploaded_at, source_inspection_id, document_categories(name)")
          .in("subsection_id", c).order("id").range(f, t), "subsection_documents"))).then((x) => x.flat()),
      ]);
      const inspectionReports = subDocs.filter((d) => d.source_inspection_id || (d.document_categories as Row | null)?.name === "Inspection Reports");
      return {
        reports: [
          ...siteDocs.map((d) => ({ file_id: `site_documents:${d.id}`, kind: REPORT_CATEGORIES[d.category] ?? "other", category: d.category, file_name: d.file_name, bytes: d.file_size, created_at: d.created_at })),
          ...inspectionReports.map((d) => ({ file_id: `subsection_documents:${d.id}`, kind: "inspection", category: "Inspection Reports", shop: shopName.get(d.subsection_id) ?? null, file_name: d.file_name, bytes: d.file_size, created_at: d.uploaded_at })),
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
    async sign_off_verdicts({ site_id, policy = "judgement", dry_run = true, confirm_token, override_older_finals = false }: { site_id: string; policy?: string; dry_run?: boolean; confirm_token?: string; override_older_finals?: boolean }) {
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
        if (!override_older_finals && linked.some((l: Row) => cls(l.verdict) && cls(l.verdict) !== cls(p.proposed_verdict_alt))) { held.push({ id: p.id, cert_no: p.cert_no, why: "an older final verdict differs (not overwritten; override_older_finals=true lets the October judgement win)" }); continue; }
        if (linked.some(june)) { held.push({ id: p.id, cert_no: p.cert_no, why: "would supersede a June 2026 row" }); continue; }
        if (linked.some((l: Row) => l.subsection_id && l.subsection_id !== p.subsection_id)) { held.push({ id: p.id, cert_no: p.cert_no, why: "would supersede an older row on a different shop" }); continue; }
        ids.push(p.id); for (const l of linked) sup.add(l.id);
      }
      ids.sort();
      const state = sha256(canonical(rows.map((r: Row) => [r.id, r.review_status, r.verdict, r.proposed_verdict_alt, r.superseded_at, r.signed_off_at, r.supersedes_ids]).sort()));
      const dataHash = sha256(canonical({ policy, ids, override_older_finals }));

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
      const summary = { site: { id: site.id, name: site.name.trim() }, policy, override_older_finals, to_sign: ids.length, would_supersede: sup.size, held: heldCounts, before, after };

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
        result = await store.signOffJudgement(site.id, ids, sup.size, override_older_finals);
      } catch (e) {
        await store.logWrite({ tool: "sign_off_verdicts", status: "failed", site_id: site.id, site: site.name, planned: { ids: ids.length, superseded: sup.size }, snapshot: snap.path, error: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      const log = await store.logWrite({ tool: "sign_off_verdicts", status: "ok", site_id: site.id, site: site.name, result, planned: { ids: ids.length, superseded: sup.size }, snapshot: snap.path });
      return { ...summary, written: result, snapshot: snap.path, log };
    },
  };
}
