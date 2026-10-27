// RFC 8414 authorization-server metadata for the MCP connector's OAuth 2.1 flow.
import { authorizationServerMetadata } from "@/lib/mcp/oauthHandlers";
import { jsonResponse, preflight } from "@/lib/mcp/http";
import { originOf } from "@/lib/mcp/serverDeps";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return jsonResponse(200, authorizationServerMetadata(originOf(req)), { "Cache-Control": "public, max-age=300" });
}
export const OPTIONS = preflight;
