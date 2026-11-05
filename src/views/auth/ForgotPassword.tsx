"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { useNavigate, useSearchParams } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/views/auth/AuthLayout";
import {
  CaptchaTurnstile,
  CAPTCHA_ENABLED,
  type CaptchaTurnstileHandle,
} from "@/components/CaptchaTurnstile";
import { recordAuthEvent } from "@/lib/auth-audit";
import {
  describeCodeError,
  describeSendError,
  markRecoverySession,
  RESEND_COOLDOWN_SECONDS,
} from "@/lib/auth/recoveryFlow";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ForgotPassword — code-only password recovery.
//
// Step 1: user enters email. resetPasswordForEmail makes Supabase email a
// 6-digit code (template: supabase/templates/recovery.html).
//
// Step 2: user enters the code. verifyOtp establishes a recovery session and we
// route to /auth/reset-password.
//
// The email deliberately carries NO sign-in link. The code and any link in the
// same email are one single-use token, and mail scanners (Microsoft Defender
// Safe Links, Mimecast, Proofpoint) open links on arrival — which used up the
// token before the user could type the code. The email's button opens
// /auth/forgot-password?step=code instead, which holds no token.
//
// Every new send replaces the previous code, so this screen says plainly that
// only the most recent email works and paces resends to Supabase's 60-second
// limit instead of letting a refused send look like a successful one.
//
// Audit (until dedicated event types land server-side): each send and each
// rejected code is recorded as password_reset_requested with
// reason = sent | send_failed | code_rejected and the Supabase error code; a
// verified code is recorded as login (method recovery) against the user.

type Step = "email" | "code";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<Step>(searchParams.get("step") === "code" ? "code" : "email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<CaptchaTurnstileHandle>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  function startCooldown(seconds: number) {
    const until = Date.now() + seconds * 1000;
    setNow(Date.now());
    setCooldownUntil(until);
  }

  async function sendCode(emailInput: string) {
    setServerError(null);
    setInfo(null);
    if (CAPTCHA_ENABLED && !captchaToken) {
      setServerError("Please complete the verification challenge.");
      return;
    }
    const trimmed = emailInput.trim().toLowerCase();
    setSending(true);

    // MED #7: flatten timing to defeat user-enumeration via response time.
    // resetPasswordForEmail short-circuits faster when the user doesn't
    // exist; pad to a minimum 1.0-1.3s so the two cases look the same.
    const minDuration = 1000 + Math.random() * 300;
    const started = Date.now();

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/auth`,
      ...(captchaToken ? { captchaToken } : {}),
    });

    const elapsed = Date.now() - started;
    if (elapsed < minDuration) {
      await new Promise((r) => setTimeout(r, minDuration - elapsed));
    }

    // Turnstile tokens are single-use; a resend needs a fresh one.
    setCaptchaToken(null);
    captchaRef.current?.reset();
    setSending(false);
    setEmail(trimmed);

    if (error) {
      const described = describeSendError(error);
      recordAuthEvent(
        "password_reset_requested",
        { method: "recovery", reason: "send_failed", error_code: described.ref },
        { email: trimmed },
      );
      if (described.retryAfterSeconds) {
        // A code went out recently and is still the valid one — carry on to
        // the code screen rather than treating this as a dead end.
        startCooldown(described.retryAfterSeconds);
        setStep("code");
        setInfo(described.message);
        return;
      }
      setServerError(`${described.message} (ref: ${described.ref})`);
      toast.error("The email wasn't sent");
      return;
    }

    // Supabase answers the same way whether or not the address has an account,
    // so this message must not claim the address exists.
    recordAuthEvent("password_reset_requested", { method: "recovery", reason: "sent" }, { email: trimmed });
    startCooldown(RESEND_COOLDOWN_SECONDS);
    setCode("");
    setStep("code");
    setInfo(
      `If ${trimmed} has an account, a 6-digit code is on its way. Only the code in the most recent email works, and it lasts 1 hour.`,
    );
    toast.success("Check your email for the 6-digit code");
  }

  async function verifyCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!forgotPasswordSchema.safeParse({ email: trimmedEmail }).success) {
      setServerError("Enter the email address the code was sent to.");
      return;
    }
    setVerifying(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: code,
      type: "recovery",
    });

    if (error || !data.session) {
      const described = error
        ? describeCodeError(error)
        : { message: "The code couldn't be checked. Try again.", ref: "no_session" };
      recordAuthEvent(
        "password_reset_requested",
        { method: "recovery", reason: "code_rejected", error_code: described.ref },
        { email: trimmedEmail },
      );
      setServerError(`${described.message} (ref: ${described.ref})`);
      toast.error("Code not accepted");
      setVerifying(false);
      return;
    }

    // The token can't identify this as a reset (amr says "otp"), so record it:
    // until the new password is set, every page sends this session back here.
    markRecoverySession(data.session);
    recordAuthEvent("login", { method: "recovery" });
    toast.success("Code verified");
    navigate("/auth/reset-password");
  }

  if (step === "code") {
    return (
      <AuthLayout subtitle="Enter the 6-digit code from your email">
        <form onSubmit={verifyCode} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code-email">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="code-email"
                type="email"
                autoComplete="email"
                placeholder="your@email.com"
                className="pl-10"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Verification Code</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="pl-10 text-lg tracking-widest"
                value={code}
                // Keep digits only, then cap at 6: a pasted "123 456" must
                // survive, which an input maxLength would truncate first.
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use the code from the most recent email. Asking for a new code cancels the old one.
            </p>
          </div>

          {info && (
            <p className="text-sm text-muted-foreground" role="status">
              {info}
            </p>
          )}

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

          <CaptchaTurnstile ref={captchaRef} onTokenChange={setCaptchaToken} />

          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            disabled={sending || cooldownLeft > 0 || !email.trim()}
            onClick={() => void sendCode(email)}
          >
            {sending
              ? "Sending..."
              : cooldownLeft > 0
                ? `Send a new code (${cooldownLeft}s)`
                : "Send a new code"}
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

  return (
    <AuthLayout subtitle="Enter your email — we&apos;ll send a 6-digit code">
      <form onSubmit={handleSubmit(({ email: e }) => sendCode(e))} className="space-y-4">
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

        <CaptchaTurnstile ref={captchaRef} onTokenChange={setCaptchaToken} />

        <Button type="submit" className="w-full" size="lg" disabled={sending}>
          {sending ? "Sending..." : "Send Code"}
        </Button>

        <Button
          type="button"
          variant="link"
          className="w-full"
          onClick={() => {
            setServerError(null);
            setStep("code");
          }}
        >
          I already have a code
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
