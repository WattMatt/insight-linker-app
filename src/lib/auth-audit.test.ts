/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    bodies: [] as Array<Record<string, unknown>>,
    fail: false,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (_name: string, opts: { body: Record<string, unknown> }) => {
        state.bodies.push(opts.body);
        return Promise.resolve(state.fail ? { error: { message: "down" } } : { error: null });
      },
    },
  },
}));

import { recordAuthEvent } from "./auth-audit";

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  state.bodies = [];
  state.fail = false;
  window.localStorage.clear();
});

describe("recordAuthEvent", () => {
  it("sends the typed email with a pre-sign-in event (the server keeps only its hash)", async () => {
    recordAuthEvent("password_reset_requested", { method: "recovery", reason: "code_rejected" }, { email: "a@example.com" });
    await flush();
    expect(state.bodies.at(-1)).toEqual({
      event_type: "password_reset_requested",
      metadata: { method: "recovery", reason: "code_rejected" },
      email: "a@example.com",
    });
  });

  it("sends no email field when none is given", async () => {
    recordAuthEvent("login", { method: "password" });
    await flush();
    expect(state.bodies.at(-1)).not.toHaveProperty("email");
  });

  it("never writes the email into the browser's retry queue", async () => {
    state.fail = true;
    recordAuthEvent("password_reset_requested", { reason: "sent" }, { email: "a@example.com" });
    await flush();
    const queued = window.localStorage.getItem("wm_auth_audit_retry_queue") ?? "";
    expect(queued).toContain("password_reset_requested");
    expect(queued).not.toContain("a@example.com");
  });
});
