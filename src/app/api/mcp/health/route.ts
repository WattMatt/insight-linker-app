// Diagnostics for the MCP server's configuration: which Supabase project the server-side keys point
// at and whether the OAuth/JWT secrets are set (short SHA-256 fingerprints only, never the values),
// plus a live read of mcp_oauth_clients. Lets a deploy be checked against prod before it is trusted.
import { createHash } from "node:crypto";
import { jsonResponse, preflight } from "@/lib/mcp/http";
import { serviceClient, supabaseUrl } from "@/lib/mcp/serverDeps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fp = (v: string | undefined) => (v ? createHash("sha256").update(v).digest("hex").slice(0, 8) : null);
const jwtRef = (k: string | undefined) => {
  try { return k ? (JSON.parse(Buffer.from(k.split(".")[1], "base64url").toString()).ref ?? null) : null; } catch { return null; }
};

export async function GET() {
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let db: Record<string, unknown>;
  try {
    const { count, error } = await serviceClient().from("mcp_oauth_clients").select("client_id", { count: "exact", head: true });
    db = error ? { ok: false, error: error.message } : { ok: true, mcp_oauth_clients: count };
  } catch (e) {
    db = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return jsonResponse(200, {
    supabase_host: new URL(supabaseUrl()).host,
    supabase_url_source: process.env.SUPABASE_URL ? "SUPABASE_URL" : "NEXT_PUBLIC_SUPABASE_URL",
    service_key: { set: !!svc, kind: svc?.startsWith("sb_") ? "secret-key" : svc ? "jwt" : null, project_ref: jwtRef(svc), fp: fp(svc) },
    anon_key_ref: jwtRef(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabase_jwt_secret: { set: !!process.env.SUPABASE_JWT_SECRET, fp: fp(process.env.SUPABASE_JWT_SECRET) },
    mcp_oauth_secret: { set: !!process.env.MCP_OAUTH_SECRET, fp: fp(process.env.MCP_OAUTH_SECRET) },
    db,
    vercel_env: process.env.VERCEL_ENV ?? null,
  }, { "Cache-Control": "no-store" });
}
export const OPTIONS = preflight;
