import { describe, it, expect } from "vitest";
import { makeTokenKit } from "../../../mcp-fortress/src/core.mjs";
import { createFortressTools, portalStatus, type AuthFacts } from "./fortressTools";

// Minimal in-memory stand-in for the PostgREST builder: eq / in / is / order / range / maybeSingle.
type Row = Record<string, any>;
function fakeSb(tables: Record<string, Row[]>) {
  const q = (name: string) => {
    let rows = [...(tables[name] ?? [])];
    const b: any = {
      select: () => b,
      eq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return b; },
      in: (k: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[k])); return b; },
      is: (k: string, v: unknown) => { rows = rows.filter((r) => (r[k] ?? null) === v); return b; },
      order: () => b,
      range: (f: number, t: number) => Promise.resolve({ data: rows.slice(f, t + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (res: any, rej: any) => Promise.resolve({ data: rows, error: null }).then(res, rej),
    };
    return b;
  };
  return { from: q } as any;
}

const CLIENT = "c0000000-0000-4000-8000-000000000000";
const BROLL = "a1000000-0000-4000-8000-000000000000";
const JHI = "a2000000-0000-4000-8000-000000000000";
const SITE_B = "51000000-0000-4000-8000-000000000000";
const SITE_J = "52000000-0000-4000-8000-000000000000";
const U = (n: number) => `u${n}000000-0000-4000-8000-000000000000`;

function setup(opts: { isAdmin?: boolean } = {}) {
  const tables = {
    user_clients: [
      { user_id: U(1), client_id: CLIENT, managing_agency_id: BROLL },
      { user_id: U(2), client_id: CLIENT, managing_agency_id: BROLL },
      { user_id: U(3), client_id: CLIENT, managing_agency_id: null },
    ],
    managing_agencies: [{ id: BROLL, name: "Broll", client_id: CLIENT }, { id: JHI, name: "JHI", client_id: CLIENT }],
    sites: [{ id: SITE_B, name: "Evaton Mall", client_id: CLIENT, managing_agency_id: BROLL }, { id: SITE_J, name: "Mayville Mall", client_id: CLIENT, managing_agency_id: JHI }],
    pending_user_invites: [{ id: "p1", email: "pending@broll.com", full_name: "P", invited_at: null }],
    profiles: [
      { id: U(1), email: "active@broll.com", full_name: "Active" },
      { id: U(2), email: "never@broll.com", full_name: "Never" },
      { id: U(3), email: "fund@fortressfund.co.za", full_name: "Fund" },
      { id: U(9), email: "staff@wmeng.co.za", full_name: "Staff" },
    ],
    user_roles: [{ user_id: U(1), role: "Client" }, { user_id: U(2), role: "Client" }, { user_id: U(3), role: "Client" }],
    client_access_links: [],
  };
  const facts = new Map<string, AuthFacts>([
    [U(1), { last_sign_in_at: "2026-10-01T00:00:00Z", email_confirmed_at: "x", invited_at: "x", created_at: "x" }],
    [U(2), { last_sign_in_at: null, email_confirmed_at: null, invited_at: "2026-09-23T00:00:00Z", created_at: "x" }],
    [U(3), { last_sign_in_at: "2026-10-20T00:00:00Z", email_confirmed_at: "x", invited_at: "x", created_at: "x" }],
  ]);
  const sent: Row[] = [];
  const store: any = {
    client: { id: CLIENT, name: "Fortress_Fund" },
    async fortressSite(id: string) { const s = tables.sites.find((x) => x.id === id); if (!s) throw new Error("not fortress"); return s; },
    async logWrite() { return "log:1"; },
  };
  const used = new Set<string>();
  const tools = createFortressTools(fakeSb(tables), store, {
    tokens: makeTokenKit("test"), consumeToken: async (t) => (used.has(t) ? false : (used.add(t), true)), isAdmin: opts.isAdmin ?? true,
    portal: {
      origin: "https://watsonmattheus.com",
      authFacts: async (ids) => new Map(ids.filter((i) => facts.has(i)).map((i) => [i, facts.get(i)!])),
      inviteUser: async (body) => { sent.push(body); return { ok: true, status: 200, body: { success: true } }; },
    },
  });
  return { tools, sent };
}

describe("portal tools", () => {
  it("portalStatus", () => {
    expect(portalStatus(undefined)).toBe("no_auth_record");
    expect(portalStatus({ last_sign_in_at: null, email_confirmed_at: null, invited_at: "x", created_at: "x" })).toBe("invited_never_signed_in");
  });

  it("check_portal_access sorts recipients into verdicts", async () => {
    const { tools } = setup();
    const r: any = await tools.check_portal_access({ site_id: SITE_B, emails: ["Active@broll.com", "never@broll.com", "fund@fortressfund.co.za", "staff@wmeng.co.za", "pending@broll.com", "nobody@x.com", "bad"] });
    const v = Object.fromEntries(r.results.map((x: any) => [x.email, x.verdict]));
    expect(v).toEqual({
      "active@broll.com": "ok", "never@broll.com": "needs_resend", "fund@fortressfund.co.za": "ok",
      "staff@wmeng.co.za": "account_not_on_fortress_client", "pending@broll.com": "pending_invite_only", "nobody@x.com": "not_a_user", bad: "invalid_email",
    });
    expect(r.portal_url).toBe(`https://watsonmattheus.com/client-portal/sites/${SITE_B}`);
  });

  it("agency scope hides other-agency sites", async () => {
    const { tools } = setup();
    const r: any = await tools.check_portal_access({ site_id: SITE_J, emails: ["active@broll.com", "fund@fortressfund.co.za"] });
    expect(r.results.map((x: any) => x.verdict)).toEqual(["user_but_site_outside_scope", "ok"]);
  });

  it("invite_portal_users plans, then sends only with a valid token", async () => {
    const { tools, sent } = setup();
    const users = [
      { email: "new@broll.com", full_name: "New", agency: "Broll" },
      { email: "never@broll.com", agency: "Broll" },
      { email: "active@broll.com", agency: "Broll" },
      { email: "staff@wmeng.co.za", agency: "all" },
      { email: "noagency@broll.com" },
      { email: "wrong@broll.com", agency: "Acme" },
    ] as any;
    const dry: any = await tools.invite_portal_users({ users });
    expect(dry.to_invite.map((x: any) => x.email)).toEqual(["new@broll.com"]);
    expect(dry.to_resend.map((x: any) => x.email)).toEqual(["never@broll.com"]);
    expect(dry.skipped.map((x: any) => x.email).sort()).toEqual(["active@broll.com", "noagency@broll.com", "staff@wmeng.co.za", "wrong@broll.com"]);
    expect(sent).toHaveLength(0);
    await expect(tools.invite_portal_users({ users, dry_run: false, confirm_token: "nope" })).rejects.toThrow(/invite refused/);
    const done: any = await tools.invite_portal_users({ users, dry_run: false, confirm_token: dry.confirm_token });
    expect(done.sent).toBe(2);
    expect(sent).toEqual([
      { email: "never@broll.com", fullName: "Never", role: "Client", clientId: CLIENT, managingAgencyId: BROLL, isResend: true },
      { email: "new@broll.com", fullName: "New", role: "Client", clientId: CLIENT, managingAgencyId: BROLL },
    ]);
    await expect(tools.invite_portal_users({ users, dry_run: false, confirm_token: dry.confirm_token })).rejects.toThrow(/already used/);
  });

  it("portal tools refuse non-admins", async () => {
    const { tools } = setup({ isAdmin: false });
    const users = [{ email: "new@broll.com", agency: "Broll" }];
    await expect(tools.invite_portal_users({ users })).rejects.toThrow(/Admin/);
    await expect(tools.check_portal_access({ site_id: SITE_B, emails: ["a@b.co"] })).rejects.toThrow(/Admin/);
  });
});
