// OAuth 2.1 token endpoint: authorization_code (PKCE S256) and refresh_token (rotated every use).
import { token } from "@/lib/mcp/oauthHandlers";
import { fromHandler, jsonResponse, preflight, serverError } from "@/lib/mcp/http";
import { oauthDeps } from "@/lib/mcp/serverDeps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/x-www-form-urlencoded")) {
    return jsonResponse(400, { error: "invalid_request", error_description: "use application/x-www-form-urlencoded" }, { "Cache-Control": "no-store" });
  }
  try {
    return fromHandler(await token(oauthDeps(req), new URLSearchParams(await req.text())));
  } catch (e) {
    return serverError(e);
  }
}
export const OPTIONS = preflight;
