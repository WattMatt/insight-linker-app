// HTTP helpers shared by the MCP / OAuth route handlers. CORS is open (no cookies are involved:
// everything is bearer tokens or public metadata), so browser-based clients like the MCP Inspector work.
import type { HandlerResult } from "./oauthHandlers";

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, mcp-session-id, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new Response(null, { status: 204, headers: CORS });

export function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS, ...headers } });

export const fromHandler = (r: HandlerResult) => jsonResponse(r.status, r.body, r.headers);

/** Last-resort error response: logs the detail, returns a generic OAuth-style error. */
export function serverError(e: unknown) {
  console.error("[mcp/oauth]", e instanceof Error ? e.stack ?? e.message : e);
  return jsonResponse(500, { error: "server_error", error_description: "internal error" });
}
