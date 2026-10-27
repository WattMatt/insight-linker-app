// Remote MCP server for Fortress COC records (Streamable HTTP). OAuth 2.1 bearer tokens only:
// see src/lib/mcp/ and /.well-known/oauth-protected-resource.
import { handleMcp } from "@/lib/mcp/mcpServer";
import { preflight, serverError, withCors } from "@/lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  try {
    return withCors(await handleMcp(req));
  } catch (e) {
    return serverError(e);
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
export const OPTIONS = preflight;
