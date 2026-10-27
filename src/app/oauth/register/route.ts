// RFC 7591 dynamic client registration for MCP clients (public clients, PKCE).
import { register } from "@/lib/mcp/oauthHandlers";
import { fromHandler, jsonResponse, preflight, serverError } from "@/lib/mcp/http";
import { oauthDeps } from "@/lib/mcp/serverDeps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return jsonResponse(400, { error: "invalid_client_metadata", error_description: "body must be JSON" }); }
  try {
    return fromHandler(await register(oauthDeps(req), body));
  } catch (e) {
    return serverError(e);
  }
}
export const OPTIONS = preflight;
