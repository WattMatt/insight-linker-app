"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/views/auth/AuthLayout";
import { recordAuthEvent } from "@/lib/auth-audit";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ForgotPassword — OTP-first password recovery (EC-4).
//
// Step 1: user enters email. We call supabase.auth.resetPasswordForEmail —
// Supabase emails a 6-digit OTP code AND a clickable link.
//
// Step 2 (default): user enters the 6-digit code. We call verifyOtp; on
// success a recovery session is established and we route to /auth/reset-password.
//
// The link in the email still works (it routes through Supabase /verify →
// /auth?type=recovery&token=... → our dispatcher → /auth/reset-password).
// But corporate email scanners (Microsoft Defender, Mimecast, Proofpoint)
// pre-fetch single-use links and burn the token before the user clicks.
// OTP-first defends against that — the user types the code instead.

type Step = "email" | "code";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function sendCode({ email: emailInput }: ForgotPasswordInput) {
    setServerError(null);
    const trimmed = emailInput.trim().toLowerCase();

    // Supabase email contains both the OTP and a clickable link as fallback.
    const redirectTo = `${window.location.origin}/auth`;
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, { redirectTo });

    // Don't reveal whether the address exists. Always show the code step.
    recordAuthEvent("password_reset_requested", { method: "recovery" });

    if (error && process.env.NODE_ENV === "development") {
      console.warn("[forgot-password] resetPasswordForEmail error", error);
    }

    setEmail(trimmed);
    setStep("code");
    toast.success("Check your email for the 6-digit code");
  }

  async function verifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    setVerifying(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "recovery",
    });

    if (error || !data.session) {
      const msg = error?.message?.includes("expired")
        ? "Code expired. Request a new one."
        : "Invalid code. Check the email and try again.";
      setServerError(msg);
      toast.error(msg);
      setVerifying(false);
      return;
    }

    toast.success("Code verified");
    navigate("/auth/reset-password");
  }

  if (step === "code") {
    return (
      <AuthLayout subtitle={`Enter the 6-digit code sent to ${email}`}>
        <form onSubmit={verifyCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Verification Code</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="123456"
                className="pl-10 text-lg tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Email scanners may burn the clickable link in your email. Typing the code is more reliable.
            </p>
          </div>

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={verifying || code.length !== 6}
          >
            {verifying ? "Verifying..." : "Verify & Continue"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            size="lg"
            onClick={() => {
              setStep("email");
              setCode("");
              setServerError(null);
            }}
          >
            Back
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Enter your email — we&apos;ll send a 6-digit code">
      <form onSubmit={handleSubmit(sendCode)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="your@email.com"
              className="pl-10"
              {...register("email")}
            />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        {serverError && (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        )}

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send Code"}
        </Button>

        <Link href="/auth/login" className="block">
          <Button type="button" variant="ghost" className="w-full" size="lg">
            Back to Login
          </Button>
        </Link>
      </form>
    </AuthLayout>
  );
}
