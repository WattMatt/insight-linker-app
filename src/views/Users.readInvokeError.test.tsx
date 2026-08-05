/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { readInvokeError } from "./Users";

const FALLBACK = "Failed to send invitation";
const OPAQUE = "Edge Function returned a non-2xx status code";

// What supabase-js hands back for a non-2xx Edge Function reply: a blanked message
// plus the untouched Response on `context`.
const invokeError = (context?: Response) => Object.assign(new Error(OPAQUE), { context });

const reply = (body: string, contentType = "application/json") =>
  new Response(body, { status: 400, headers: { "Content-Type": contentType } });

describe("readInvokeError", () => {
  it("recovers the error field from the function's JSON body", async () => {
    const context = reply(JSON.stringify({ success: false, error: "Only admins can invite users" }));
    const recovered = await readInvokeError(invokeError(context), FALLBACK);
    expect(recovered.message).toBe("Only admins can invite users");
  });

  it("keeps the original message when the body is not JSON", async () => {
    const context = reply("<html>502 Bad Gateway</html>", "text/html");
    const recovered = await readInvokeError(invokeError(context), FALLBACK);
    expect(recovered.message).toBe(OPAQUE);
  });

  it("keeps the original message when the JSON body carries no error field", async () => {
    const context = reply(JSON.stringify({ success: false }));
    const recovered = await readInvokeError(invokeError(context), FALLBACK);
    expect(recovered.message).toBe(OPAQUE);
  });

  it("keeps the original message when there is no context", async () => {
    const recovered = await readInvokeError(invokeError(), FALLBACK);
    expect(recovered.message).toBe(OPAQUE);
  });

  it("keeps the original message for a network-level failure", async () => {
    const recovered = await readInvokeError(new TypeError("Failed to fetch"), FALLBACK);
    expect(recovered.message).toBe("Failed to fetch");
  });

  it("uses the supplied fallback when the failure carries no message at all", async () => {
    expect((await readInvokeError({}, FALLBACK)).message).toBe(FALLBACK);
    expect((await readInvokeError(null, FALLBACK)).message).toBe(FALLBACK);
  });

  it("leaves the caller's response body unread", async () => {
    const context = reply(JSON.stringify({ error: "Client ID is required for Client role users" }));
    await readInvokeError(invokeError(context), FALLBACK);
    expect(context.bodyUsed).toBe(false);
  });

  it("resolves rather than throws when the body has already been consumed", async () => {
    const context = reply(JSON.stringify({ error: "swallowed" }));
    await context.text();
    const recovered = await readInvokeError(invokeError(context), FALLBACK);
    expect(recovered.message).toBe(OPAQUE);
  });
});
