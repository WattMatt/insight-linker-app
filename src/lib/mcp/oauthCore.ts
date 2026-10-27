// Pure OAuth 2.1 helpers for the remote MCP server: PKCE, HS256 JWTs, redirect-URI policy and scopes.
// No I/O, so the whole flow is unit-tested (oauthHandlers.test.ts).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SCOPES = ["fortress.read", "fortress.write", "offline_access"] as const;
export type Scope = (typeof SCOPES)[number];
export const DEFAULT_SCOPE = "fortress.read";

export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;
export const CODE_TTL_S = 5 * 60;

/** The redirect URI claude.ai uses, accepted exactly. */
export const CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback";
/** Loopback callback paths (any port, RFC 8252 §7.3). "/oauth/callback" is the MCP Inspector's. */
export const LOOPBACK_PATHS = ["/callback", "/oauth/callback"];

export const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");
export const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function isLoopback(u: URL): boolean {
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

/** Is this redirect URI allowed at all (registration time)? */
export function redirectUriAllowed(raw: string): boolean {
  if (raw === CLAUDE_CALLBACK) return true;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  return isLoopback(u) && LOOPBACK_PATHS.includes(u.pathname) && !u.search && !u.hash && !u.username && !u.password;
}

/** Does the redirect URI in an authorize/token request match one registered for the client?
 *  Exact match, except a loopback URI may use any port. */
export function redirectUriMatches(requested: string, registered: string[]): boolean {
  if (!redirectUriAllowed(requested)) return false;
  if (registered.includes(requested)) return true;
  const r = new URL(requested);
  if (!isLoopback(r)) return false;
  return registered.some((x) => {
    try {
      const u = new URL(x);
      return isLoopback(u) && u.hostname === r.hostname && u.pathname === r.pathname;
    } catch { return false; }
  });
}

/** Parse a space-separated scope string; null when any scope is unknown. Empty -> default. */
export function parseScope(raw: string | null | undefined): Scope[] | null {
  const parts = (raw ?? "").split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [DEFAULT_SCOPE];
  if (parts.some((p) => !(SCOPES as readonly string[]).includes(p))) return null;
  return [...new Set(parts)] as Scope[];
}

export function pkceS256Matches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const want = Buffer.from(b64url(createHash("sha256").update(verifier).digest()));
  const got = Buffer.from(challenge);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ── HS256 JWT ─────────────────────────────────────────────────────────────────────────────────
export type JwtClaims = Record<string, unknown> & { exp: number; iat: number };

export function signJwt(claims: JwtClaims, secret: string, typ = "JWT"): string {
  const head = b64url(JSON.stringify({ alg: "HS256", typ }));
  const body = b64url(JSON.stringify(claims));
  const sig = b64url(createHmac("sha256", secret).update(`${head}.${body}`).digest());
  return `${head}.${body}.${sig}`;
}

/** Returns the claims, or null when malformed, wrongly signed, not HS256 or expired. */
export function verifyJwt(token: string, secret: string, nowS = Math.floor(Date.now() / 1000)): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    const h = JSON.parse(Buffer.from(head, "base64url").toString("utf8"));
    if (h.alg !== "HS256") return null;
    const want = Buffer.from(b64url(createHmac("sha256", secret).update(`${head}.${body}`).digest()));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as JwtClaims;
    if (typeof c.exp !== "number" || c.exp <= nowS) return null;
    return c;
  } catch {
    return null;
  }
}

export interface AccessClaims extends JwtClaims {
  iss: string; aud: string; sub: string; client_id: string; scope: string; jti: string;
}

export function issueAccessToken(a: { issuer: string; resource: string; userId: string; clientId: string; scope: string }, secret: string, nowS = Math.floor(Date.now() / 1000)): string {
  const claims: AccessClaims = {
    iss: a.issuer, aud: a.resource, sub: a.userId, client_id: a.clientId, scope: a.scope,
    iat: nowS, exp: nowS + ACCESS_TOKEN_TTL_S, jti: randomToken(12),
  };
  return signJwt(claims, secret, "at+jwt");
}

export function verifyAccessToken(token: string, secret: string, expect: { issuer: string; resource: string }, nowS?: number): AccessClaims | null {
  const c = verifyJwt(token, secret, nowS) as AccessClaims | null;
  if (!c || c.iss !== expect.issuer || c.aud !== expect.resource || typeof c.sub !== "string") return null;
  return c;
}

/** Short-lived Supabase JWT for the resolved staff user, so RLS and auth.uid() apply to every query. */
export function mintSupabaseJwt(a: { supabaseUrl: string; userId: string; email: string | null; ttlS: number }, secret: string, nowS = Math.floor(Date.now() / 1000)): string {
  return signJwt({
    iss: `${a.supabaseUrl.replace(/\/$/, "")}/auth/v1`, sub: a.userId, aud: "authenticated", role: "authenticated",
    email: a.email ?? undefined, iat: nowS, exp: nowS + a.ttlS,
  }, secret);
}
