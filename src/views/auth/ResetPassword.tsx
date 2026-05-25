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
import { recordAuthEvent } from "@/lib/auth-audit";
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
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordInput>({ resolver: zodResolver(setPasswordSchema) });

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        toast.error("Reset link expired. Request a new one.", { duration: 6000 });
        navigate("/auth/forgot-password");
      }
    });
  }, [navigate]);

  async function onSubmit({ password }: SetPasswordInput) {
    setServerError(null);

    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) {
      const msg = isWeakPasswordError(error)
        ? "This password is too common or has appeared in a data breach. Choose a stronger one."
        : error.message;
      setServerError(msg);
      toast.error(msg);
      return;
    }
    if (!data.user) {
      setServerError("Failed to update password.");
      return;
    }

    // Clear the forced-change flag if present.
    await supabase.auth.updateUser({ data: { requires_password_change: false } });

    recordAuthEvent("password_changed", { method: "recovery" });
    toast.success("Password updated. Signing you in...");
    await redirectByRole(data.user.id);
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
