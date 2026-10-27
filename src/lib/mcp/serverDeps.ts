// Server-only wiring for the MCP OAuth server and endpoint: service-role client for the OAuth and
// audit tables, the staff check, the app-session check, client-metadata fetch, and the per-call
// Supabase client that acts as the user (minted JWT, so RLS and auth.uid() apply).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mintSupabaseJwt } from "./oauthCore";
import type { ClientRec, CodeRec, OAuthDeps, OAuthStore, RefreshRec } from "./oauthHandlers";

/** Env values with copy/paste artifacts removed: surrounding whitespace, quotes and a literal "\\n"
 *  (Vercel `env pull` output pasted back into the dashboard carries one; on a URL it turns
 *  "/rest/v1" into "/n/rest/v1" and every query 404s silently). */
export const cleanEnv = (v: string | undefined) => v?.trim().replace(/^"|"$/g, "").replace(/(\\n)+$/, "").trim() || undefined;
const env = (k: string) => {
  const v = cleanEnv(process.env[k]);
  if (!v) throw new Error(`server is missing ${k}`);
  return v;
};
export const supabaseUrl = () => (cleanEnv(process.env.SUPABASE_URL) ?? env("NEXT_PUBLIC_SUPABASE_URL")).replace(/\/+$/, "");

let service: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  service ??= createClient(supabaseUrl(), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  return service;
}

/** A client that acts as the user for `ttlS` seconds. Never shared between requests. */
export function userClient(userId: string, email: string | null, ttlS = 300): SupabaseClient {
  const jwt = mintSupabaseJwt({ supabaseUrl: supabaseUrl(), userId, email, ttlS }, env("SUPABASE_JWT_SECRET"));
  return createClient(supabaseUrl(), env("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}
export const mintUserJwt = (userId: string, email: string | null, ttlS: number) =>
  mintSupabaseJwt({ supabaseUrl: supabaseUrl(), userId, email, ttlS }, env("SUPABASE_JWT_SECRET"));

/** Public origin of this deployment (https://watsonmattheus.com on production). */
export function originOf(req: Request): string {
  const fixed = cleanEnv(process.env.MCP_PUBLIC_ORIGIN);
  if (fixed) return fixed.replace(/\/$/, "");
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? u.host;
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const STAFF_ROLES = ["Admin", "User", "Moderator"];
export const NON_STAFF_ROLES = ["Client", "Contractor"];

/** Staff = holds Admin, User or Moderator and none of Client / Contractor. */
export async function userRoles(userId: string): Promise<string[]> {
  const { data, error } = await serviceClient().from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(`user_roles: ${error.message}`);
  return (data ?? []).map((r) => String(r.role));
}
export const rolesAreStaff = (roles: string[]) =>
  roles.some((r) => STAFF_ROLES.includes(r)) && !roles.some((r) => NON_STAFF_ROLES.includes(r));
export const isStaff = async (userId: string) => rolesAreStaff(await userRoles(userId));

export async function userEmail(userId: string): Promise<string | null> {
  const { data } = await serviceClient().auth.admin.getUserById(userId);
  return data?.user?.email ?? null;
}

class SupabaseOAuthStore implements OAuthStore {
  private sb = serviceClient();
  async getClient(clientId: string) {
    const { data, error } = await this.sb.from("mcp_oauth_clients").select("*").eq("client_id", clientId).maybeSingle();
    if (error) throw new Error(`mcp_oauth_clients: ${error.message}`);
    return (data as ClientRec | null) ?? null;
  }
  async putClient(rec: ClientRec) {
    const { error } = await this.sb.from("mcp_oauth_clients").upsert({ ...rec, updated_at: rec.updated_at ?? new Date().toISOString() });
    if (error) throw new Error(`mcp_oauth_clients: ${error.message}`);
  }
  async saveCode(rec: CodeRec) {
    const { error } = await this.sb.from("mcp_oauth_codes").insert(rec);
    if (error) throw new Error(`mcp_oauth_codes: ${error.message}`);
  }
  async consumeCode(codeHash: string, nowIso: string) {
    // One UPDATE … WHERE used_at IS NULL: two concurrent redemptions cannot both succeed.
    const { data, error } = await this.sb.from("mcp_oauth_codes").update({ used_at: nowIso })
      .eq("code_hash", codeHash).is("used_at", null).gt("expires_at", nowIso).select("*");
    if (error) throw new Error(`mcp_oauth_codes: ${error.message}`);
    return ((data ?? [])[0] as CodeRec | undefined) ?? null;
  }
  async saveRefresh(rec: RefreshRec) {
    const { error } = await this.sb.from("mcp_oauth_refresh_tokens").insert(rec);
    if (error) throw new Error(`mcp_oauth_refresh_tokens: ${error.message}`);
  }
  async rotateRefresh(tokenHash: string, nowIso: string) {
    const { data, error } = await this.sb.from("mcp_oauth_refresh_tokens").update({ rotated_at: nowIso })
      .eq("token_hash", tokenHash).is("rotated_at", null).is("revoked_at", null).gt("expires_at", nowIso).select("*");
    if (error) throw new Error(`mcp_oauth_refresh_tokens: ${error.message}`);
    const rec = (data ?? [])[0] as RefreshRec | undefined;
    if (rec) return { status: "ok" as const, rec };
    const { data: old } = await this.sb.from("mcp_oauth_refresh_tokens").select("family_id, rotated_at, revoked_at").eq("token_hash", tokenHash).maybeSingle();
    if (old && (old.rotated_at || old.revoked_at)) return { status: "reused" as const, familyId: old.family_id as string };
    return { status: "unknown" as const };
  }
  async revokeFamily(familyId: string, nowIso: string) {
    await this.sb.from("mcp_oauth_refresh_tokens").update({ revoked_at: nowIso }).eq("family_id", familyId).is("revoked_at", null);
  }
}

/** Fetch a client ID metadata document: https only, 1.5 s timeout, 16 KB cap, JSON object. */
export async function fetchClientMetadata(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500), headers: { Accept: "application/json" }, redirect: "error" });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 16_384) return null;
    const doc = JSON.parse(text);
    return doc && typeof doc === "object" && !Array.isArray(doc) ? doc : null;
  } catch {
    return null;
  }
}

export function oauthDeps(req: Request): OAuthDeps {
  return {
    store: new SupabaseOAuthStore(),
    secret: env("MCP_OAUTH_SECRET"),
    origin: originOf(req),
    isStaff,
    async verifyAppSession(token: string) {
      const { data, error } = await serviceClient().auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
    fetchClientMetadata,
    now: () => new Date(),
  };
}
