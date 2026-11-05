/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";

const { state } = vi.hoisted(() => ({
  state: {
    calls: [] as Array<{ name: string; body: Record<string, unknown> }>,
    reply: { data: { success: true, message: "done" }, error: null } as { data: unknown; error: unknown },
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (name: string, opts: { body: Record<string, unknown> }) => {
        state.calls.push({ name, body: opts.body });
        return Promise.resolve(state.reply);
      },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

import { AdminResetPasswordDialog } from "./AdminResetPasswordDialog";

function renderDialog() {
  return render(
    createElement(AdminResetPasswordDialog, {
      user: { email: "alice@example.com", full_name: "Alice A" },
      open: true,
      onOpenChange: () => {},
    }),
  );
}

beforeEach(() => {
  state.calls = [];
  state.reply = { data: { success: true, message: "done" }, error: null };
});

describe("AdminResetPasswordDialog", () => {
  it("offers the two actions and says neither changes access", () => {
    renderDialog();
    expect(screen.getByText(/Neither option changes their role or what they can access/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Email reset code/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Replace password and email it/ })).toBeTruthy();
    expect(screen.queryByLabelText(/Temporary Password/i)).toBeNull(); // no free-text password box any more
  });

  it("'Email reset code' sends only the reset action — no password, role or sites", async () => {
    state.reply = { data: { success: true, message: "Reset code emailed to alice@example.com." }, error: null };
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Email reset code/ }));

    expect(await screen.findByRole("status")).toHaveProperty("textContent", "Reset code emailed to alice@example.com.");
    expect(state.calls).toEqual([
      { name: "invite-user", body: { action: "reset_password", method: "email_code", email: "alice@example.com" } },
    ]);
  });

  it("'Replace password' sends a generated 16-character password and never shows it", async () => {
    state.reply = { data: { success: true, message: "A temporary password was emailed to alice@example.com." }, error: null };
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Replace password and email it/ }));

    await screen.findByRole("status");
    const body = state.calls[0].body;
    expect(body).toMatchObject({ action: "reset_password", method: "temporary_password", email: "alice@example.com" });
    expect(typeof body.temporaryPassword).toBe("string");
    expect((body.temporaryPassword as string).length).toBe(16);
    expect(document.body.textContent).not.toContain(body.temporaryPassword as string);
    expect(body).not.toHaveProperty("role");
  });

  it("shows the function's own error text, not the generic non-2xx message", async () => {
    const context = new Response(
      JSON.stringify({ success: false, error: "Supabase rejected the temporary password: weak (ref: weak_password). Nothing was changed - try again." }),
      { status: 400 },
    );
    state.reply = { data: null, error: { message: "Edge Function returned a non-2xx status code", context } };
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Replace password and email it/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Nothing was changed");
    expect(alert.textContent).not.toContain("non-2xx");
  });

  it("disables both actions while one is running", async () => {
    let release: () => void = () => {};
    state.reply = undefined as never;
    const gate = new Promise<void>((r) => { release = r; });
    const { supabase } = await import("@/integrations/supabase/client");
    const spy = vi.spyOn(supabase.functions, "invoke").mockImplementation(async () => {
      await gate;
      return { data: { success: true, message: "ok" }, error: null } as never;
    });
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /Email reset code/ }));
    await waitFor(() =>
      expect((screen.getByRole("button", { name: /Replace password and email it/ }) as HTMLButtonElement).disabled).toBe(true),
    );
    release();
    await screen.findByRole("status");
    spy.mockRestore();
  });
});
