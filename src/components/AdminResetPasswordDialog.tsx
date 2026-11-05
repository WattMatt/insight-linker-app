import { useEffect, useState } from "react";
import { KeyRound, Mail } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { generateInitialPassword } from "@/lib/auth/initialInvite";
import { readInvokeError } from "@/lib/edgeFunctionError";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Admin "Reset Password" — two explicit actions instead of one button that did
// different things depending on whether a text box was empty
// (docs/AUTH_PASSWORD_REVIEW_2026-10-29.md, RC-4). Both go through the
// invite-user function's `action: "reset_password"` path, which never touches
// the user's role, client or site access, and reports any failure verbatim.
//
// The temporary password is generated here and goes straight to the function,
// which emails it to the user. It is never shown to the admin.

type Method = "email_code" | "temporary_password";

export interface AdminResetPasswordDialogProps {
  user: { email: string; full_name?: string | null } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminResetPasswordDialog({ user, open, onOpenChange }: AdminResetPasswordDialogProps) {
  const [pending, setPending] = useState<Method | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // A fresh dialog for each user: never show the previous user's outcome.
  useEffect(() => {
    if (open) {
      setResult(null);
      setPending(null);
    }
  }, [open, user?.email]);

  async function run(method: Method) {
    if (!user) return;
    setPending(method);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: {
          action: "reset_password",
          method,
          email: user.email,
          ...(method === "temporary_password" ? { temporaryPassword: generateInitialPassword() } : {}),
        },
      });
      if (error) throw await readInvokeError(error, "The reset failed");
      if (!data?.success) throw new Error(data?.error || "The reset failed");
      setResult({ ok: true, text: data.message });
      toast.success(method === "email_code" ? "Reset code emailed" : "Temporary password emailed");
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      setResult({ ok: false, text });
      toast.error("Reset failed");
    } finally {
      setPending(null);
    }
  }

  const name = user?.full_name || user?.email || "this user";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {name}</DialogTitle>
          <DialogDescription>
            Choose one. Neither option changes their role or what they can access.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md border p-4 space-y-2">
            <p className="font-medium">Email a reset code (try this first)</p>
            <p className="text-sm text-muted-foreground">
              Sends a 6-digit code to {user?.email}. They open the email&apos;s &quot;Enter your code&quot; button
              and choose a new password. Their current password keeps working until they do.
            </p>
            <Button
              className="w-full"
              disabled={pending !== null}
              onClick={() => void run("email_code")}
            >
              <Mail className="mr-2 h-4 w-4" />
              {pending === "email_code" ? "Sending..." : "Email reset code"}
            </Button>
          </div>

          <div className="rounded-md border p-4 space-y-2">
            <p className="font-medium">Email a temporary password</p>
            <p className="text-sm text-muted-foreground">
              Replaces their current password with a generated one and emails it to {user?.email}. They must choose
              their own the first time they sign in. Use this if the code isn&apos;t working for them.
            </p>
            <Button
              className="w-full"
              variant="outline"
              disabled={pending !== null}
              onClick={() => void run("temporary_password")}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {pending === "temporary_password" ? "Setting..." : "Replace password and email it"}
            </Button>
          </div>

          {result && (
            <p
              className={`text-sm ${result.ok ? "text-green-700 dark:text-green-400" : "text-destructive"}`}
              role={result.ok ? "status" : "alert"}
            >
              {result.text}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
