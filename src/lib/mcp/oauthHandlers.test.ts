import { describe, it, expect, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import {
  approveAuthorize, authorizationServerMetadata, checkAuthorize, protectedResourceMetadata, register, token,
  type ClientRec, type CodeRec, type OAuthDeps, type OAuthStore, type RefreshRec,
} from "./oauthHandlers";
import { redirectUriAllowed, redirectUriMatches, verifyAccessToken } from "./oauthCore";
import { handleMcp, auditArgs } from "./mcpServer";

const ORIGIN = "https://watsonmattheus.com";
const SECRET = "test-secret-not-real";
const STAFF = "11111111-1111-4111-8111-111111111111";
const CLIENT_USER = "22222222-2222-4222-8222-222222222222";

class MemStore implements OAuthStore {
  clients = new Map<string, ClientRec>();
  codes = new Map<string, CodeRec & { used_at?: string }>();
  refresh = new Map<string, RefreshRec & { rotated_at?: string; revoked_at?: string }>();
  async getClient(id: string) { return this.clients.get(id) ?? null; }
  async putClient(rec: ClientRec) { this.clients.set(rec.client_id, rec); }
  async saveCode(rec: CodeRec) { this.codes.set(rec.code_hash, { ...rec }); }
  async consumeCode(h: string, now: string) {
    const c = this.codes.get(h);
    if (!c || c.used_at || c.expires_at <= now) return null;
    c.used_at = now; return c;
  }
  async saveRefresh(rec: RefreshRec) { this.refresh.set(rec.token_hash, { ...rec }); }
  async rotateRefresh(h: string, now: string) {
    const r = this.refresh.get(h);
    if (!r) return { status: "unknown" as const };
    if (r.rotated_at || r.revoked_at) return { status: "reused" as const, familyId: r.family_id };
    if (r.expires_at <= now) return { status: "unknown" as const };
    r.rotated_at = now; return { status: "ok" as const, rec: r };
  }
  async revokeFamily(f: string, now: string) { for (const r of this.refresh.values()) if (r.family_id === f && !r.revoked_at) r.revoked_at = now; }
}

const verifier = "a".repeat(20) + "B-._~" + "c".repeat(30);
const challenge = createHash("sha256").update(verifier).digest("base64url");

let store: MemStore, now: Date, staff: Set<string>, deps: OAuthDeps;
beforeEach(() => {
  store = new MemStore();
  now = new Date("2026-10-27T12:00:00Z");
  staff = new Set([STAFF]);
  deps = {
    store, secret: SECRET, origin: ORIGIN, now: () => now,
    isStaff: async (id) => staff.has(id),
    verifyAppSession: async (t) => (t === "staff-session" ? { id: STAFF, email: "arno@example.com" } : t === "client-session" ? { id: CLIENT_USER, email: "client@example.com" } : null),
    fetchClientMetadata: async () => null,
  };
});

async function registered(redirect = "https://claude.ai/api/mcp/auth_callback") {
  const r = await register(deps, { client_name: "Claude", redirect_uris: [redirect], token_endpoint_auth_method: "none" });
  expect(r.status).toBe(201);
  return (r.body as { client_id: string }).client_id;
}
const authParams = (client_id: string, extra: Record<string, string> = {}) => ({
  response_type: "code", client_id, redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  code_challenge: challenge, code_challenge_method: "S256", state: "st-1", scope: "fortress.read fortress.write offline_access",
  resource: `${ORIGIN}/api/mcp`, ...extra,
});
async function codeFor(client_id: string, session = "staff-session") {
  const r = await approveAuthorize(deps, authParams(client_id), session, true);
  expect(r.status).toBe(200);
  const to = new URL((r.body as { redirect_to: string }).redirect_to);
  expect(to.searchParams.get("state")).toBe("st-1");
  expect(to.searchParams.get("iss")).toBe(ORIGIN);
  return to.searchParams.get("code")!;
}
const form = (o: Record<string, string>) => new URLSearchParams(o);

describe("metadata", () => {
  it("protected resource points at this server and names /api/mcp exactly", () => {
    const m = protectedResourceMetadata(ORIGIN);
    expect(m.resource).toBe("https://watsonmattheus.com/api/mcp");
    expect(m.authorization_servers).toEqual([ORIGIN]);
  });
  it("authorization server advertises DCR, PKCE S256, public clients, CIMD and the three scopes", () => {
    const m = authorizationServerMetadata(ORIGIN);
    expect(m).toMatchObject({
      authorization_endpoint: `${ORIGIN}/oauth/authorize`, token_endpoint: `${ORIGIN}/oauth/token`,
      registration_endpoint: `${ORIGIN}/oauth/register`, code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"], client_id_metadata_document_supported: true,
      scopes_supported: ["fortress.read", "fortress.write", "offline_access"],
    });
  });
});

describe("redirect URI policy", () => {
  it("allows claude.ai exactly and loopback callbacks on any port", () => {
    expect(redirectUriAllowed("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectUriAllowed("http://localhost/callback")).toBe(true);
    expect(redirectUriAllowed("http://127.0.0.1:53682/callback")).toBe(true);
    expect(redirectUriAllowed("http://localhost:6274/oauth/callback")).toBe(true);
  });
  it("refuses everything else", () => {
    for (const u of ["https://claude.ai/api/mcp/auth_callback/", "https://evil.example/cb", "http://claude.ai/api/mcp/auth_callback",
      "https://localhost/callback", "http://localhost.evil.com/callback", "http://localhost:80/other", "http://localhost/callback?x=1", "javascript:alert(1)"]) {
      expect(redirectUriAllowed(u), u).toBe(false);
    }
  });
  it("matches a registered loopback URI on another port, never another path or host", () => {
    expect(redirectUriMatches("http://127.0.0.1:9000/callback", ["http://127.0.0.1:5000/callback"])).toBe(true);
    expect(redirectUriMatches("http://localhost:9000/callback", ["http://127.0.0.1:5000/callback"])).toBe(false);
    expect(redirectUriMatches("https://claude.ai/api/mcp/auth_callback", ["http://localhost/callback"])).toBe(false);
  });
});

describe("dynamic client registration", () => {
  it("registers a public client", async () => {
    const r = await register(deps, { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ token_endpoint_auth_method: "none", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect(store.clients.size).toBe(1);
  });
  it("refuses a disallowed redirect URI and confidential clients", async () => {
    expect((await register(deps, { redirect_uris: ["https://evil.example/cb"] })).status).toBe(400);
    expect((await register(deps, { redirect_uris: ["http://localhost/callback"], token_endpoint_auth_method: "client_secret_basic" })).status).toBe(400);
    expect(store.clients.size).toBe(0);
  });
});

describe("authorize with PKCE", () => {
  it("shows consent with the client name and redirect host", async () => {
    const id = await registered();
    const c = await checkAuthorize(deps, authParams(id));
    expect(c).toMatchObject({ kind: "consent", client_name: "Claude", redirect_host: "claude.ai", scopes: ["fortress.read", "fortress.write", "offline_access"] });
  });
  it("never redirects to an unregistered redirect URI", async () => {
    const id = await registered();
    const c = await checkAuthorize(deps, authParams(id, { redirect_uri: "https://evil.example/cb" }));
    expect(c.kind).toBe("fatal");
  });
  it("requires S256 PKCE (error goes back to the client)", async () => {
    const id = await registered();
    const c = await checkAuthorize(deps, authParams(id, { code_challenge_method: "plain" }));
    expect(c.kind).toBe("redirect");
    expect(new URL((c as { redirect_to: string }).redirect_to).searchParams.get("error")).toBe("invalid_request");
  });
  it("refuses an unknown scope and a foreign resource", async () => {
    const id = await registered();
    const a = await checkAuthorize(deps, authParams(id, { scope: "fortress.admin" }));
    expect(new URL((a as { redirect_to: string }).redirect_to).searchParams.get("error")).toBe("invalid_scope");
    const b = await checkAuthorize(deps, authParams(id, { resource: "https://other.example/mcp" }));
    expect(new URL((b as { redirect_to: string }).redirect_to).searchParams.get("error")).toBe("invalid_target");
  });
  it("needs a signed-in app user", async () => {
    const id = await registered();
    expect((await approveAuthorize(deps, authParams(id), null, true)).status).toBe(401);
    expect((await approveAuthorize(deps, authParams(id), "forged", true)).status).toBe(401);
  });
  it("refuses a non-staff user and issues no code", async () => {
    const id = await registered();
    const r = await approveAuthorize(deps, authParams(id), "client-session", true);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: "access_denied" });
    expect(store.codes.size).toBe(0);
  });
  it("deny sends access_denied back", async () => {
    const id = await registered();
    const r = await approveAuthorize(deps, authParams(id), "staff-session", false);
    expect(new URL((r.body as { redirect_to: string }).redirect_to).searchParams.get("error")).toBe("access_denied");
  });
});

describe("token endpoint", () => {
  it("exchanges a code with the right verifier for a 1-hour access token and a refresh token", async () => {
    const id = await registered();
    const code = await codeFor(id);
    const r = await token(deps, form({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: id, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }));
    expect(r.status).toBe(200);
    const b = r.body as { access_token: string; refresh_token: string; expires_in: number; token_type: string; scope: string };
    expect(b).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "fortress.read fortress.write offline_access" });
    const claims = verifyAccessToken(b.access_token, SECRET, { issuer: ORIGIN, resource: `${ORIGIN}/api/mcp` }, Math.floor(now.getTime() / 1000));
    expect(claims).toMatchObject({ sub: STAFF, client_id: id });
    expect(claims!.exp - claims!.iat).toBe(3600);
    expect(r.headers?.["Cache-Control"]).toBe("no-store");
  });
  it("invalid_grant: wrong verifier, reused code, expired code, other client, other redirect", async () => {
    const id = await registered();
    const other = await registered("http://localhost/callback");
    const base = { grant_type: "authorization_code", code_verifier: verifier, client_id: id, redirect_uri: "https://claude.ai/api/mcp/auth_callback" };
    const err = async (o: Record<string, string>) => (await token(deps, form(o))).body as { error: string };

    expect((await err({ ...base, code: await codeFor(id), code_verifier: "x".repeat(50) })).error).toBe("invalid_grant");
    const once = await codeFor(id);
    expect((await token(deps, form({ ...base, code: once }))).status).toBe(200);
    expect((await err({ ...base, code: once })).error).toBe("invalid_grant");
    const late = await codeFor(id);
    now = new Date(now.getTime() + 5 * 60 * 1000 + 1000);
    expect((await err({ ...base, code: late })).error).toBe("invalid_grant");
    now = new Date("2026-10-27T12:00:00Z");
    expect((await err({ ...base, code: await codeFor(id), client_id: other })).error).toBe("invalid_grant");
    expect((await err({ ...base, code: await codeFor(id), redirect_uri: "http://localhost/callback" })).error).toBe("invalid_grant");
  });
  it("rotates the refresh token on every use; a reused one is invalid_grant and revokes the family", async () => {
    const id = await registered();
    const first = (await token(deps, form({ grant_type: "authorization_code", code: await codeFor(id), code_verifier: verifier, client_id: id, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }))).body as { refresh_token: string };
    const r2 = await token(deps, form({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: id }));
    expect(r2.status).toBe(200);
    const second = r2.body as { refresh_token: string; access_token: string };
    expect(second.refresh_token).not.toBe(first.refresh_token);

    const replay = await token(deps, form({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: id }));
    expect(replay.status).toBe(400);
    expect((replay.body as { error: string }).error).toBe("invalid_grant");
    // The family is revoked, so even the newest token is now refused.
    const after = await token(deps, form({ grant_type: "refresh_token", refresh_token: second.refresh_token, client_id: id }));
    expect((after.body as { error: string }).error).toBe("invalid_grant");
    expect((await token(deps, form({ grant_type: "refresh_token", refresh_token: "garbage", client_id: id }))).body).toMatchObject({ error: "invalid_grant" });
  });
  it("refuses refresh for a user who is no longer staff", async () => {
    const id = await registered();
    const t = (await token(deps, form({ grant_type: "authorization_code", code: await codeFor(id), code_verifier: verifier, client_id: id, redirect_uri: "https://claude.ai/api/mcp/auth_callback" }))).body as { refresh_token: string };
    staff.delete(STAFF);
    expect((await token(deps, form({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: id }))).body).toMatchObject({ error: "invalid_grant" });
  });
  it("unknown grant types and clients", async () => {
    const id = await registered();
    expect((await token(deps, form({ grant_type: "password", client_id: id }))).body).toMatchObject({ error: "unsupported_grant_type" });
    expect((await token(deps, form({ grant_type: "authorization_code", client_id: "nope", code: "x", code_verifier: verifier }))).status).toBe(401);
  });
});

describe("client ID metadata documents", () => {
  it("accepts an https client_id whose document lists an allowed redirect", async () => {
    const url = "https://claude.ai/oauth/mcp-oauth-client-metadata";
    deps.fetchClientMetadata = async (u) => (u === url ? { client_id: url, client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] } : null);
    const c = await checkAuthorize(deps, authParams(url));
    expect(c).toMatchObject({ kind: "consent", client_name: "Claude" });
  });
  it("refuses a document whose client_id does not match its URL", async () => {
    const url = "https://evil.example/meta.json";
    deps.fetchClientMetadata = async () => ({ client_id: "https://claude.ai/x", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
    expect((await checkAuthorize(deps, authParams(url))).kind).toBe("fatal");
  });
});

describe("MCP endpoint", () => {
  it("returns 401 with the protected-resource metadata pointer when unauthenticated", async () => {
    const res = await handleMcp(new Request(`${ORIGIN}/api/mcp`, { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Bearer resource_metadata="https://watsonmattheus.com/.well-known/oauth-protected-resource"');
  });
  it("returns 401 invalid_token for a forged token", async () => {
    process.env.MCP_OAUTH_SECRET = SECRET;
    const res = await handleMcp(new Request(`${ORIGIN}/api/mcp`, { method: "POST", body: "{}", headers: { Authorization: "Bearer a.b.c" } }));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
  });
  it("audit args never store verdicts.json content or confirm tokens", () => {
    expect(auditArgs({ site_id: "s", json: { docs: [1] }, confirm_token: "tok" })).toEqual({ site_id: "s", json: { sha256: expect.any(String), bytes: 12 }, confirm_token: "[redacted]" });
  });
});
