// RFC 9728 protected-resource metadata for /api/mcp (also served at the path-suffixed form
// /.well-known/oauth-protected-resource/api/mcp).
import { protectedResourceMetadata } from "@/lib/mcp/oauthHandlers";
import { jsonResponse, preflight } from "@/lib/mcp/http";
import { originOf } from "@/lib/mcp/serverDeps";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return jsonResponse(200, protectedResourceMetadata(originOf(req)), { "Cache-Control": "public, max-age=300" });
}
export const OPTIONS = preflight;
