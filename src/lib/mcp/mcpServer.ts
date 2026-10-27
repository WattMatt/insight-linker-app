// Remote MCP endpoint (Streamable HTTP, stateless, JSON responses). Per request: verify the OAuth
// access token, re-check the user is still staff, act as that user on the database (minted JWT), build
// the tool set and audit-log every tool call.
import { createHmac } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { makeTokenKit, sha256 } from "../../../mcp-fortress/src/core.mjs";
import { storeFor } from "../../../mcp-fortress/src/store.mjs";
import { createTools } from "../../../mcp-fortress/src/tools.mjs";
import { verifyAccessToken } from "./oauthCore";
import { resourceOf, wwwAuthenticate } from "./oauthHandlers";
import { createFortressTools } from "./fortressTools";
import { REPORT_KINDS, regenerateInBrowser, savedSince, type ReportKind } from "./regenerate";
import { cleanEnv, mintUserJwt, originOf, rolesAreStaff, serviceClient, supabaseUrl, userClient, userRoles } from "./serverDeps";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/** Audit-safe copy of tool arguments: verdicts.json content and confirm tokens are not stored. */
export function auditArgs(args: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args ?? {})) {
    if (k === "json") { const s = typeof v === "string" ? v : JSON.stringify(v ?? null); out.json = { sha256: sha256(s), bytes: s.length }; }
    else if (k === "confirm_token") out.confirm_token = v ? "[redacted]" : v;
    else out[k] = v;
  }
  return out;
}

/** One-line result summary for the audit log. */
export function summarizeResult(r: unknown): string {
  if (r == null || typeof r !== "object") return String(r).slice(0, 300);
  const o = r as Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) parts.push(`${k}[${v.length}]`);
    else if (v && typeof v === "object") parts.push(`${k}{${Object.keys(v).slice(0, 6).join(",")}}`);
    else if (typeof v === "string") parts.push(`${k}=${v.length > 60 ? `${v.slice(0, 60)}…` : v}`);
    else parts.push(`${k}=${v}`);
    if (parts.join(" ").length > 400) break;
  }
  return parts.join(" ").slice(0, 500);
}

export async function handleMcp(req: Request): Promise<Response> {
  const t0 = Date.now();
  const origin = originOf(req);
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  if (!bearer) return json(401, { error: "unauthorized", error_description: "Bearer token required" }, { "WWW-Authenticate": wwwAuthenticate(origin) });
  const secret = cleanEnv(process.env.MCP_OAUTH_SECRET);
  if (!secret) return json(500, { error: "server_error", error_description: "MCP_OAUTH_SECRET is not configured" });
  const claims = verifyAccessToken(bearer, secret, { issuer: origin, resource: resourceOf(origin) });
  if (!claims) return json(401, { error: "invalid_token", error_description: "token is invalid or expired" }, { "WWW-Authenticate": wwwAuthenticate(origin, "invalid_token") });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed", error_description: "this server is stateless: POST JSON-RPC only" }, { Allow: "POST" });

  const roles = await userRoles(claims.sub);
  if (!rolesAreStaff(roles)) return json(403, { error: "access_denied", error_description: "this account is no longer a WM staff account" });
  const { data: u } = await serviceClient().auth.admin.getUserById(claims.sub);
  if (!u?.user) return json(401, { error: "invalid_token", error_description: "user no longer exists" }, { "WWW-Authenticate": wwwAuthenticate(origin, "invalid_token") });
  const user = { id: u.user.id, email: u.user.email ?? null };
  const scopes = new Set(claims.scope.split(" "));
  const isAdmin = roles.includes("Admin");

  const service = serviceClient();
  const sb = userClient(user.id, user.email, 300);
  const store = await storeFor(sb, user, new URL(supabaseUrl()).host, {
    async saveSnapshot(snap: Record<string, any>) {
      const { data, error } = await service.from("mcp_fortress_snapshots")
        .insert({ site_id: snap.site.id, user_id: user.id, reason: snap.reason, counts: snap.counts, data: snap }).select("id").single();
      if (error) throw new Error(`snapshot not saved, write refused: ${error.message}`);
      return `mcp_fortress_snapshots:${data.id}`;
    },
    async logWrite(entry: Record<string, any>) {
      const { data, error } = await service.from("mcp_audit_log").insert({
        user_id: user.id, user_email: user.email, client_id: claims.client_id, tool: `write:${entry.tool}`,
        args: entry, ok: entry.status === "ok", summary: `${entry.status} ${entry.site ?? ""}`.trim(),
      }).select("id").single();
      if (error) console.error("[mcp] write log failed", error.message);
      return data ? `mcp_audit_log:${data.id}` : null;
    },
  });
  const tokenSecret = createHmac("sha256", secret).update("fortress-confirm-token").digest("hex");
  const tokens = makeTokenKit(tokenSecret);
  const consumeToken = async (t: string) => {
    const { error } = await service.from("mcp_confirm_tokens_used").insert({ token_hash: sha256(t), user_id: user.id, tool: "confirm" });
    if (!error) return true;
    if (error.code === "23505") return false;
    throw new Error(`confirm token check failed: ${error.message}`);
  };
  const base = createTools(store, tokens, { allowJsonPath: false, consumeToken });
  const extra = createFortressTools(sb, store, { tokens, consumeToken, isAdmin });

  const server = new McpServer({ name: "wm-fortress", version: "1.0.0" });
  const tool = (name: string, description: string, inputSchema: z.ZodRawShape, run: (a: any) => Promise<unknown>, o: { write?: boolean; writeWhen?: (a: any) => boolean } = {}) =>
    server.registerTool(name, { description, inputSchema, annotations: { readOnlyHint: !o.write && !o.writeWhen, destructiveHint: false } }, async (args: any) => {
      const started = Date.now();
      let ok = false, summary = "";
      try {
        const needsWrite = o.write || (o.writeWhen?.(args) ?? false);
        if (needsWrite && !scopes.has("fortress.write")) throw new Error(`${name} needs the fortress.write scope; reconnect and grant it`);
        if (!scopes.has("fortress.read") && !scopes.has("fortress.write")) throw new Error("token has no fortress scope");
        const result = await run(args);
        ok = true; summary = summarizeResult(result);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 1) }] };
      } catch (e) {
        summary = e instanceof Error ? e.message : String(e);
        return { isError: true, content: [{ type: "text" as const, text: summary }] };
      } finally {
        const { error } = await service.from("mcp_audit_log").insert({
          user_id: user.id, user_email: user.email, client_id: claims.client_id, tool: name,
          args: auditArgs(args), ok, summary: summary.slice(0, 1000), duration_ms: Date.now() - started,
        });
        if (error) console.error("[mcp] audit insert failed", error.message);
      }
    });

  const siteId = z.string().uuid().describe("sites.id of a Fortress_Fund site (see list_fortress_sites)");
  const verdicts = z.union([z.string(), z.record(z.any())]).describe("verdicts.json content (object or text)");

  tool("list_sites", "List Fortress_Fund sites, optionally filtered by name.", { filter: z.string().optional() }, base.list_sites);
  tool("get_site", "One Fortress site with its COC row counts and import batches (June 2026 batches marked read-only).", { site_id: siteId }, base.get_site);
  tool("list_cocs", "COC certificate rows for a Fortress site (live rows unless include_superseded).", { site_id: siteId, include_superseded: z.boolean().optional() }, base.list_cocs);
  tool("get_verdicts", "Final and proposed verdicts for a Fortress site's live COC rows, with failed rules.", { site_id: siteId }, base.get_verdicts);
  tool("export_snapshot", "Save a JSON snapshot of the site's COC tables (stored server-side in mcp_fortress_snapshots). Changes no COC data.", { site_id: siteId }, base.export_snapshot);
  tool("dry_run_replace_cocs", "Plan replacing a site's COC rows from a re-verification verdicts.json. Writes nothing. Returns the diff and a confirm token.", { site_id: siteId, json: verdicts }, base.dry_run_replace_cocs);
  tool("replace_cocs", "Apply a dry-run plan: snapshot first, then insert PROPOSED rows (no final verdicts, no deletes) for that site only. Needs the confirm token from dry_run_replace_cocs for the same site and JSON. Requires fortress.write.",
    { site_id: siteId, json: verdicts, confirm_token: z.string() }, base.replace_cocs, { write: true });

  tool("list_fortress_sites", "All Fortress sites: id, name, managing agent, stored contact emails, COC row count, shop count.", {}, extra.list_fortress_sites);
  tool("get_site_kpis", "Site KPIs: subsections; asset register (total, verified, discrepancies, not found, extra); COC over COC-required shops (pass/fail/review on file, no COC); open snags by severity with shop and text; date of the data.", { site_id: siteId }, extra.get_site_kpis);
  tool("get_site_coc_detail", "Per shop: certificates (cert no, verdict, verdict_alt, review status, failing rules) and the shop's COC status as the Site COC Report shows it.", { site_id: siteId }, extra.get_site_coc_detail);
  tool("list_site_reports", "Saved reports for a site (site reports and inspection reports): kind, date, file_id.", { site_id: siteId }, extra.list_site_reports);
  tool("get_report", "A saved report: 15-minute signed download URL plus the PDF's extracted text.", { file_id: z.string().describe("file_id from list_site_reports") }, extra.get_report);
  tool("sign_off_verdicts", "Sign off a site's proposed COC verdicts with the judgement policy (final verdict = verdict_alt), same rules as the 27 Oct 2026 run: differing older final verdicts, June 2026 rows and rows linked to another shop are held. dry_run=true (default) returns counts and a confirm token; dry_run=false applies it (fortress.write + Admin).",
    { site_id: siteId, policy: z.literal("judgement").optional(), dry_run: z.boolean().optional(), confirm_token: z.string().optional() },
    extra.sign_off_verdicts, { writeWhen: (a) => a?.dry_run === false });
  tool("regenerate_site_reports", "Regenerate and save a site's reports with the same generator as the site's 'All reports' panel (run in a headless browser as you). kinds: site-coc, fortress-checklist, site-summary, asset-verification, inspection. Site-level kinds run in full; inspection reports run in batches of max_inspection_reports (default 5) per call: pass the returned resume.pending_before on the next call and repeat until resume.inspection_remaining is 0. Returns the saved file_ids. Requires fortress.write.",
    {
      site_id: siteId, kinds: z.array(z.enum(Object.keys(REPORT_KINDS) as [ReportKind, ...ReportKind[]])).min(1),
      max_inspection_reports: z.number().int().min(1).max(10).optional().describe("inspection reports per call (default 5)"),
      pending_before: z.string().datetime({ offset: true }).optional().describe("resume marker from the previous call: inspection reports generated at or after this time are skipped"),
    },
    async ({ site_id, kinds, max_inspection_reports, pending_before }: { site_id: string; kinds: ReportKind[]; max_inspection_reports?: number; pending_before?: string }) => {
      const site = await store.fortressSite(site_id);
      const since = new Date().toISOString();
      const pendingBefore = pending_before ?? since;
      const ttl = 15 * 60;
      const run = await regenerateInBrowser({
        origin, siteId: site.id, kinds, supabaseUrl: supabaseUrl(), accessToken: mintUserJwt(user.id, user.email, ttl),
        expiresAt: Math.floor(Date.now() / 1000) + ttl, user: u.user as unknown as Record<string, unknown>, deadlineMs: t0 + 280_000,
        inspection: kinds.includes("inspection") ? { max: max_inspection_reports ?? 5, pendingBefore } : undefined,
      });
      const insp = run.inspection;
      const resume = kinds.includes("inspection") && insp
        ? { pending_before: pendingBefore, inspection_remaining: Math.max(0, insp.pending - insp.selected), note: insp.pending - insp.selected > 0 ? "call again with kinds [\"inspection\"] and this pending_before" : "all inspection reports done for this pass" }
        : null;
      return { site: { id: site.id, name: site.name.trim() }, kinds, run, resume, saved: await savedSince(sb, site.id, since) };
    }, { write: true });

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(req);
}
