"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import { useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/views/auth/AuthLayout";
import { useRoleRedirect } from "@/views/auth/useRoleRedirect";
import { PasswordStrengthMeter } from "@/views/auth/PasswordStrengthMeter";
import { recordAuthEvent } from "@/lib/auth-audit";
import { evaluatePassword } from "@/lib/password-strength";
import { isRecoverySession } from "@/lib/auth/recoveryFlow";
import { setPasswordSchema, type SetPasswordInput } from "@/lib/validation-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ResetPassword — recovery-completion flow. Reached after the /auth dispatcher
// has verified a `?type=recovery&token=...` link (or the SDK's PASSWORD_RECOVERY
// event has fired) and established a recovery session. The user types their
// new password.
export default function ResetPassword() {
  const navigate = useNavigate();
  const { redirectByRole } = useRoleRedirect();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordInput>({ resolver: zodResolver(setPasswordSchema) });

  const passwordValue = watch("password") ?? "";

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        toast.error("Your reset session has ended. Request a new code.", { duration: 6000 });
        navigate("/auth/forgot-password");
      }
    });
  }, [navigate]);

  async function onSubmit({ password }: SetPasswordInput) {
    setServerError(null);
    const { data: { session: sessionAtSubmit } } = await supabase.auth.getSession();
    if (!sessionAtSubmit) {
      setServerError("Your reset session has ended. Request a new code.");
      return;
    }

    // Strength + breach gate (best-effort; HIBP network failure does not block).
    const evalRes = await evaluatePassword(password);
    if (evalRes.score < 2) {
      setError("password", { message: "Password is too weak. Mix words, length, and symbols." });
      return;
    }
    if (evalRes.pwned) {
      setError("password", {
        message: `Found in ${evalRes.pwnCount?.toLocaleString() ?? "known"} data breaches. Choose a unique password.`,
      });
      return;
    }

    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      const msg = isWeakPasswordError(error)
        ? "This password is too common or has appeared in a data breach. Choose a stronger one."
        : error.message;
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (!data.user?.email) {
      setServerError("Failed to update password.");
      return;
    }
    const method = isRecoverySession(sessionAtSubmit) ? "recovery" : "self";

    // Clear the forced-change flag if present. If this fails the user would be
    // sent back here on every login, so say so rather than carry on silently.
    const { error: flagError } = await supabase.auth.updateUser({ data: { requires_password_change: false } });

    // Replace the recovery session with a normal password sign-in. That ends
    // the recovery session (which would otherwise keep routing the user back
    // here) and proves the new password actually works before we say it does.
    // NB: if server-side captcha is ever enabled this call needs a token.
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
      email: data.user.email,
      password,
    });
    if (signInError || !signIn.session) {
      const ref = signInError?.code ?? (signInError?.status ? `http_${signInError.status}` : "no_session");
      recordAuthEvent("password_changed", { method, reason: "resignin_failed", error_code: ref });
      setServerError(
        `Your new password was saved, but signing in with it failed (ref: ${ref}). Go to the login page and sign in with your new password.`,
      );
      return;
    }

    recordAuthEvent("password_changed", { method, reason: flagError ? "flag_clear_failed" : "verified" });
    toast.success(
      flagError
        ? "Password updated. If you're asked to change it again, contact your administrator."
        : "Password updated. Signing you in...",
    );
    await redirectByRole(signIn.session.user.id);
  }

  return (
    <AuthLayout subtitle="Set your new password">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <PasswordField
          id="password"
          label="New Password"
          autoComplete="new-password"
          placeholder="At least 8 characters"
          {...register("password")}
          error={errors.password?.message}
        />
        <PasswordStrengthMeter password={passwordValue} />
        <PasswordField
          id="confirmPassword"
          label="Confirm Password"
          autoComplete="new-password"
          {...register("confirmPassword")}
          error={errors.confirmPassword?.message}
        />

        {serverError && (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Updating..." : "Update Password"}
        </Button>
      </form>
    </AuthLayout>
  );
}

function isWeakPasswordError(error: { message?: string; code?: unknown }): boolean {
  const msg = error.message ?? "";
  return (
    msg.includes("weak") ||
    msg.includes("pwned") ||
    (typeof error.code === "string" && error.code === "weak_password")
  );
}

interface PasswordFieldProps
  extends React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> {
  id: string;
  label: string;
  error?: string;
}

const PasswordField = function PasswordField({ id, label, error, ...rest }: PasswordFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input id={id} type="password" className="pl-10" {...rest} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};
