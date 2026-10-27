// OAuth 2.1 authorization server for the remote MCP connector, independent of Next.js: each handler
// takes plain inputs and returns { status, body, headers }. Storage, the Supabase session check, the
// staff check and client-metadata fetching are injected, so the whole flow runs in unit tests.
import {
  CODE_TTL_S, REFRESH_TOKEN_TTL_S, ACCESS_TOKEN_TTL_S, SCOPES, issueAccessToken, parseScope, pkceS256Matches,
  randomToken, redirectUriAllowed, redirectUriMatches, sha256hex,
} from "./oauthCore";

export interface ClientRec {
  client_id: string; client_name: string | null; redirect_uris: string[];
  source: "dcr" | "metadata_document"; metadata: Record<string, unknown>; updated_at?: string;
}
export interface CodeRec {
  code_hash: string; client_id: string; user_id: string; redirect_uri: string; code_challenge: string;
  scope: string; resource: string | null; expires_at: string;
}
export interface RefreshRec {
  token_hash: string; family_id: string; client_id: string; user_id: string; scope: string;
  resource: string | null; expires_at: string;
}
export interface OAuthStore {
  getClient(clientId: string): Promise<ClientRec | null>;
  putClient(rec: ClientRec): Promise<void>;
  saveCode(rec: CodeRec): Promise<void>;
  /** Atomically marks the code used; returns it only if it was unused and unexpired. */
  consumeCode(codeHash: string, nowIso: string): Promise<CodeRec | null>;
  saveRefresh(rec: RefreshRec): Promise<void>;
  /** Atomically marks a live refresh token rotated. "reused" = it exists but was already rotated/revoked. */
  rotateRefresh(tokenHash: string, nowIso: string): Promise<{ status: "ok"; rec: RefreshRec } | { status: "reused"; familyId: string } | { status: "unknown" }>;
  revokeFamily(familyId: string, nowIso: string): Promise<void>;
}
export interface OAuthDeps {
  store: OAuthStore;
  secret: string;
  origin: string;                 // e.g. https://watsonmattheus.com
  isStaff(userId: string): Promise<boolean>;
  /** Validates an app (Supabase) access token from the consent page. */
  verifyAppSession(token: string): Promise<{ id: string; email: string | null } | null>;
  /** Fetches a client ID metadata document (https URL). null when unreachable/invalid. */
  fetchClientMetadata(url: string): Promise<Record<string, unknown> | null>;
  now(): Date;
}
export interface HandlerResult { status: number; body: unknown; headers?: Record<string, string> }

export const resourceOf = (origin: string) => `${origin}/api/mcp`;
const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };
const oauthError = (status: number, error: string, description: string): HandlerResult =>
  ({ status, body: { error, error_description: description }, headers: NO_STORE });

// ── Metadata ───────────────────────────────────────────────────────────────────────────────────
export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceOf(origin),
    authorization_servers: [origin],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "WM Compliance — Fortress",
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    scopes_supported: [...SCOPES],
  };
}

export const wwwAuthenticate = (origin: string, error?: "invalid_token" | "insufficient_scope") =>
  `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"${error ? `, error="${error}"` : ""}`;

// ── Clients ────────────────────────────────────────────────────────────────────────────────────
const isUrlClientId = (id: string) => /^https:\/\/[^/]+\/.+/.test(id);
const METADATA_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Registered (DCR) client, or a client ID metadata document fetched and cached. */
export async function resolveClient(deps: OAuthDeps, clientId: string): Promise<ClientRec | null> {
  const cached = await deps.store.getClient(clientId);
  if (!isUrlClientId(clientId)) return cached;
  if (cached && cached.updated_at && deps.now().getTime() - new Date(cached.updated_at).getTime() < METADATA_MAX_AGE_MS) return cached;
  const doc = await deps.fetchClientMetadata(clientId);
  if (!doc || doc.client_id !== clientId || !Array.isArray(doc.redirect_uris)) return cached;
  const uris = (doc.redirect_uris as unknown[]).filter((u): u is string => typeof u === "string" && redirectUriAllowed(u));
  if (!uris.length) return null;
  const rec: ClientRec = {
    client_id: clientId, client_name: typeof doc.client_name === "string" ? doc.client_name.slice(0, 120) : null,
    redirect_uris: uris, source: "metadata_document", metadata: doc, updated_at: deps.now().toISOString(),
  };
  await deps.store.putClient(rec);
  return rec;
}

/** RFC 7591 dynamic client registration (public clients only). */
export async function register(deps: OAuthDeps, body: unknown): Promise<HandlerResult> {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.some((u) => typeof u !== "string")) {
    return oauthError(400, "invalid_redirect_uri", "redirect_uris must be a non-empty array of strings");
  }
  const bad = (uris as string[]).filter((u) => !redirectUriAllowed(u));
  if (bad.length) {
    return oauthError(400, "invalid_redirect_uri", `redirect URI not allowed: ${bad.join(", ")} (allowed: ${"https://claude.ai/api/mcp/auth_callback"} and loopback http://localhost|127.0.0.1:<port>/callback)`);
  }
  const method = b.token_endpoint_auth_method ?? "none";
  if (method !== "none") return oauthError(400, "invalid_client_metadata", "only public clients (token_endpoint_auth_method none) are supported");
  const grantTypes = Array.isArray(b.grant_types) ? b.grant_types : ["authorization_code", "refresh_token"];
  if (grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    return oauthError(400, "invalid_client_metadata", "grant_types may only be authorization_code and refresh_token");
  }
  const rec: ClientRec = {
    client_id: `mcp_${randomToken(18)}`,
    client_name: typeof b.client_name === "string" ? b.client_name.slice(0, 120) : null,
    redirect_uris: uris as string[], source: "dcr",
    metadata: { client_uri: b.client_uri, software_id: b.software_id, software_version: b.software_version },
    updated_at: deps.now().toISOString(),
  };
  await deps.store.putClient(rec);
  return {
    status: 201, headers: NO_STORE,
    body: {
      client_id: rec.client_id, client_id_issued_at: Math.floor(deps.now().getTime() / 1000),
      client_name: rec.client_name ?? undefined, redirect_uris: rec.redirect_uris,
      token_endpoint_auth_method: "none", grant_types: grantTypes, response_types: ["code"],
    },
  };
}

// ── Authorize ──────────────────────────────────────────────────────────────────────────────────
export interface AuthorizeParams {
  response_type?: string; client_id?: string; redirect_uri?: string; code_challenge?: string;
  code_challenge_method?: string; state?: string; scope?: string; resource?: string;
}
export type AuthorizeCheck =
  | { kind: "consent"; client_id: string; client_name: string | null; redirect_uri: string; redirect_host: string; scopes: string[]; resource: string }
  /** The redirect URI cannot be trusted: show the error, never redirect. */
  | { kind: "fatal"; error: string; error_description: string }
  /** Redirect back to the client with an error. */
  | { kind: "redirect"; redirect_to: string };

const withParams = (uri: string, params: Record<string, string | undefined>) => {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
};

export async function checkAuthorize(deps: OAuthDeps, p: AuthorizeParams): Promise<AuthorizeCheck> {
  if (!p.client_id) return { kind: "fatal", error: "invalid_request", error_description: "client_id is required" };
  const client = await resolveClient(deps, p.client_id);
  if (!client) return { kind: "fatal", error: "invalid_client", error_description: "unknown client_id" };
  if (!p.redirect_uri || !redirectUriMatches(p.redirect_uri, client.redirect_uris)) {
    return { kind: "fatal", error: "invalid_request", error_description: "redirect_uri is not registered for this client" };
  }
  const back = (error: string, error_description: string): AuthorizeCheck =>
    ({ kind: "redirect", redirect_to: withParams(p.redirect_uri!, { error, error_description, state: p.state, iss: deps.origin }) });
  if (p.response_type !== "code") return back("unsupported_response_type", "response_type must be code");
  if (!p.code_challenge || p.code_challenge_method !== "S256") return back("invalid_request", "PKCE with code_challenge_method S256 is required");
  if (!/^[A-Za-z0-9\-_]{43}$/.test(p.code_challenge)) return back("invalid_request", "code_challenge must be a base64url SHA-256 (43 characters)");
  const scopes = parseScope(p.scope);
  if (!scopes) return back("invalid_scope", `scope must be drawn from: ${SCOPES.join(" ")}`);
  const resource = p.resource ?? resourceOf(deps.origin);
  if (resource !== resourceOf(deps.origin)) return back("invalid_target", `resource must be ${resourceOf(deps.origin)}`);
  return {
    kind: "consent", client_id: client.client_id, client_name: client.client_name, redirect_uri: p.redirect_uri,
    redirect_host: new URL(p.redirect_uri).host, scopes, resource,
  };
}

/** The consent screen's Approve/Deny. `appToken` is the signed-in user's Supabase access token. */
export async function approveAuthorize(deps: OAuthDeps, p: AuthorizeParams, appToken: string | null, approve: boolean): Promise<HandlerResult> {
  const check = await checkAuthorize(deps, p);
  if (check.kind === "fatal") return { status: 400, body: check };
  if (check.kind === "redirect") return { status: 200, body: check };
  const user = appToken ? await deps.verifyAppSession(appToken) : null;
  if (!user) return { status: 401, body: { kind: "fatal", error: "login_required", error_description: "sign in to WM Compliance first" } };
  const back = (params: Record<string, string | undefined>) =>
    ({ status: 200, body: { kind: "redirect", redirect_to: withParams(check.redirect_uri, { ...params, state: p.state, iss: deps.origin }) } });
  if (!approve) return back({ error: "access_denied", error_description: "the user declined" });
  if (!(await deps.isStaff(user.id))) {
    return { status: 403, body: { kind: "refused", error: "access_denied", error_description: "only WM staff accounts can connect this server", redirect_to: withParams(check.redirect_uri, { error: "access_denied", error_description: "staff accounts only", state: p.state, iss: deps.origin }) } };
  }
  const code = randomToken(32);
  await deps.store.saveCode({
    code_hash: sha256hex(code), client_id: check.client_id, user_id: user.id, redirect_uri: check.redirect_uri,
    code_challenge: p.code_challenge!, scope: check.scopes.join(" "), resource: check.resource,
    expires_at: new Date(deps.now().getTime() + CODE_TTL_S * 1000).toISOString(),
  });
  return back({ code });
}

// ── Token ──────────────────────────────────────────────────────────────────────────────────────
async function issueTokens(deps: OAuthDeps, a: { clientId: string; userId: string; scope: string; resource: string | null; familyId?: string }): Promise<HandlerResult> {
  const now = deps.now();
  const access = issueAccessToken({ issuer: deps.origin, resource: resourceOf(deps.origin), userId: a.userId, clientId: a.clientId, scope: a.scope }, deps.secret, Math.floor(now.getTime() / 1000));
  const refresh = randomToken(32);
  await deps.store.saveRefresh({
    token_hash: sha256hex(refresh), family_id: a.familyId ?? crypto.randomUUID(), client_id: a.clientId, user_id: a.userId,
    scope: a.scope, resource: a.resource, expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL_S * 1000).toISOString(),
  });
  return {
    status: 200, headers: NO_STORE,
    body: { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL_S, refresh_token: refresh, scope: a.scope },
  };
}

export async function token(deps: OAuthDeps, form: URLSearchParams): Promise<HandlerResult> {
  const grant = form.get("grant_type");
  const clientId = form.get("client_id");
  if (!clientId) return oauthError(401, "invalid_client", "client_id is required (public client)");
  const client = await resolveClient(deps, clientId);
  if (!client) return oauthError(401, "invalid_client", "unknown client_id");
  const nowIso = deps.now().toISOString();

  if (grant === "authorization_code") {
    const code = form.get("code"), verifier = form.get("code_verifier"), redirectUri = form.get("redirect_uri");
    if (!code || !verifier) return oauthError(400, "invalid_request", "code and code_verifier are required");
    const rec = await deps.store.consumeCode(sha256hex(code), nowIso);
    if (!rec) return oauthError(400, "invalid_grant", "authorization code is invalid, expired or already used");
    if (rec.client_id !== clientId) return oauthError(400, "invalid_grant", "code was issued to another client");
    if (redirectUri !== rec.redirect_uri) return oauthError(400, "invalid_grant", "redirect_uri does not match the authorization request");
    if (!pkceS256Matches(verifier, rec.code_challenge)) return oauthError(400, "invalid_grant", "PKCE verification failed");
    const resource = form.get("resource");
    if (resource && resource !== resourceOf(deps.origin)) return oauthError(400, "invalid_target", `resource must be ${resourceOf(deps.origin)}`);
    if (!(await deps.isStaff(rec.user_id))) return oauthError(400, "invalid_grant", "user is no longer a staff account");
    return issueTokens(deps, { clientId, userId: rec.user_id, scope: rec.scope, resource: rec.resource });
  }

  if (grant === "refresh_token") {
    const refresh = form.get("refresh_token");
    if (!refresh) return oauthError(400, "invalid_request", "refresh_token is required");
    const r = await deps.store.rotateRefresh(sha256hex(refresh), nowIso);
    if (r.status === "reused") {
      // A rotated token presented again: treat the whole family as compromised.
      await deps.store.revokeFamily(r.familyId, nowIso);
      return oauthError(400, "invalid_grant", "refresh token was already used; sign in again");
    }
    if (r.status === "unknown") return oauthError(400, "invalid_grant", "refresh token is invalid or expired");
    if (r.rec.client_id !== clientId) return oauthError(400, "invalid_grant", "refresh token was issued to another client");
    let scope = r.rec.scope;
    const asked = form.get("scope");
    if (asked) {
      const s = parseScope(asked);
      const have = new Set(r.rec.scope.split(" "));
      if (!s || s.some((x) => !have.has(x))) return oauthError(400, "invalid_scope", "scope exceeds the original grant");
      scope = s.join(" ");
    }
    if (!(await deps.isStaff(r.rec.user_id))) return oauthError(400, "invalid_grant", "user is no longer a staff account");
    return issueTokens(deps, { clientId, userId: r.rec.user_id, scope, resource: r.rec.resource, familyId: r.rec.family_id });
  }

  return oauthError(400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
}
