// Backend for the /oauth/authorize consent page. The page runs in the browser with the user's app
// session; "check" validates the request (no login needed), "approve"/"deny" carry the user's Supabase
// access token in the Authorization header and return where to send the browser next.
import { approveAuthorize, checkAuthorize, type AuthorizeParams } from "@/lib/mcp/oauthHandlers";
import { jsonResponse, serverError } from "@/lib/mcp/http";
import { oauthDeps } from "@/lib/mcp/serverDeps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEYS = ["response_type", "client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

export async function POST(req: Request) {
  let body: { action?: string; params?: Record<string, unknown> };
  try { body = await req.json(); } catch { return jsonResponse(400, { kind: "fatal", error: "invalid_request", error_description: "body must be JSON" }); }
  const params: AuthorizeParams = {};
  for (const k of KEYS) { const v = body.params?.[k]; if (typeof v === "string") params[k] = v; }
  try {
    const deps = oauthDeps(req);
    if (body.action === "check") {
      const r = await checkAuthorize(deps, params);
      return jsonResponse(r.kind === "fatal" ? 400 : 200, r, { "Cache-Control": "no-store" });
    }
    if (body.action === "approve" || body.action === "deny") {
      const auth = req.headers.get("authorization") ?? "";
      const appToken = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
      const r = await approveAuthorize(deps, params, appToken, body.action === "approve");
      return jsonResponse(r.status, r.body, { "Cache-Control": "no-store" });
    }
    return jsonResponse(400, { kind: "fatal", error: "invalid_request", error_description: "action must be check, approve or deny" });
  } catch (e) {
    return serverError(e);
  }
}
