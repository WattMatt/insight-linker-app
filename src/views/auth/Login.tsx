"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, KeyRound } from "lucide-react";
import { toast } from "sonner";

import { useNavigate, useSearchParams } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/views/auth/AuthLayout";
import { useRoleRedirect } from "@/views/auth/useRoleRedirect";
import { safeNext } from "@/lib/loginNext";
import {
  CaptchaTurnstile,
  CAPTCHA_ENABLED,
  type CaptchaTurnstileHandle,
} from "@/components/CaptchaTurnstile";
import { recordAuthEvent } from "@/lib/auth-audit";
import {
  describeCodeError,
  describeSendError,
  isRecoverySession,
  RESEND_COOLDOWN_SECONDS,
} from "@/lib/auth/recoveryFlow";
import { signInSchema, forgotPasswordSchema, type SignInInput, type ForgotPasswordInput } from "@/lib/validation-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Login — supports two modes (EC-6):
//   "password"   : email + password (default)
//   "magic-link" : email-only; Supabase emails a 6-digit code; verify code
//                  to sign in. Useful for users who forgot their password
//                  AND for first-time users who just got an invite-style
//                  account creation flow.
//
// Captcha (EC-5) is required for both modes when NEXT_PUBLIC_TURNSTILE_SITE_KEY
// is set. Audit events (EC-3) logged on both submit + (for magic link) on
// the request-code step.
//
// The sign-in email is code-only (supabase/templates/magic_link.html): a link
// in the same email is the same single-use token, and mail scanners used it up
// before the user typed the code. The email's button opens
// /auth/login?mode=code, which carries no token. As on the reset screen, send
// failures are shown, resends wait out Supabase's 60-second limit, and the
// screen says only the most recent code works
// (docs/AUTH_PASSWORD_REVIEW_2026-10-29.md).

type Mode = "password" | "magic-link";
type MagicLinkStep = "email" | "code";

export default function Login() {
  const navigate = useNavigate();
  const { redirectByRole } = useRoleRedirect();
  const [searchParams] = useSearchParams();

  // ?mode=code — opened from the sign-in email's "Enter your code" button.
  const openOnCode = searchParams.get("mode") === "code";
  const [mode, setMode] = useState<Mode>(openOnCode ? "magic-link" : "password");
  const [serverError, setServerError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRef = useRef<CaptchaTurnstileHandle>(null);
  const [mlStep, setMlStep] = useState<MagicLinkStep>(openOnCode ? "code" : "email");
  const [mlEmail, setMlEmail] = useState("");
  const [mlCode, setMlCode] = useState("");
  const [mlVerifying, setMlVerifying] = useState(false);
  const [mlSending, setMlSending] = useState(false);
  const [mlInfo, setMlInfo] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  function startCooldown(seconds: number) {
    setNow(Date.now());
    setCooldownUntil(Date.now() + seconds * 1000);
  }

  // Reset captcha after any failed attempt — Turnstile tokens are single-use
  // server-side; carrying a stale token over to the retry will fail silently.
  function resetCaptcha() {
    setCaptchaToken(null);
    captchaRef.current?.reset();
  }

  // Already-signed-in redirect
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const needsChange =
          data.session.user.user_metadata?.requires_password_change || isRecoverySession(data.session);
        if (needsChange) {
          navigate("/auth/reset-password");
        } else {
          const next = safeNext(searchParams.get("next"));
          if (next) {
            navigate(next);
          } else {
            void redirectByRole(data.session.user.id);
          }
        }
      }
    });
  }, [navigate, redirectByRole, searchParams]);

  const pw = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });
  const ml = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onPasswordSubmit({ email, password }: SignInInput) {
    setServerError(null);
    if (CAPTCHA_ENABLED && !captchaToken) {
      setServerError("Please complete the verification challenge.");
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });

    if (error) {
      const msg = error.message.includes("Invalid login credentials")
        ? "Invalid email or password"
        : error.message;
      setServerError(msg);
      toast.error(msg);
      resetCaptcha();
      return;
    }

    if (data.session) {
      recordAuthEvent("login", { method: "password" });
      const needsChange = data.user?.user_metadata?.requires_password_change;
      if (needsChange) {
        navigate("/auth/reset-password");
        return;
      }
      toast.success("Signed in");
      const next = safeNext(searchParams.get("next"));
      if (next) {
        navigate(next);
      } else {
        await redirectByRole(data.user!.id);
      }
    }
  }

  async function onMagicLinkRequest({ email }: ForgotPasswordInput) {
    await sendSignInCode(email);
  }

  async function sendSignInCode(email: string) {
    setServerError(null);
    setMlInfo(null);
    if (CAPTCHA_ENABLED && !captchaToken) {
      setServerError("Please complete the verification challenge.");
      return;
    }
    const trimmed = email.trim().toLowerCase();
    setMlSending(true);

    // MED #7: flatten timing to defeat user-enumeration via response time.
    // signInWithOtp({shouldCreateUser:false}) short-circuits faster for
    // unknown emails; pad to 1.0-1.3s so the two cases are indistinguishable.
    const minDuration = 1000 + Math.random() * 300;
    const started = Date.now();

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        shouldCreateUser: false,
        ...(captchaToken ? { captchaToken } : {}),
      },
    });

    const elapsed = Date.now() - started;
    if (elapsed < minDuration) {
      await new Promise((r) => setTimeout(r, minDuration - elapsed));
    }

    // Turnstile tokens are single-use; a resend needs a fresh one.
    resetCaptcha();
    setMlSending(false);
    setMlEmail(trimmed);

    if (error) {
      const described = describeSendError(error);
      recordAuthEvent(
        "magic_link_requested",
        { method: "magic_link", reason: "send_failed", error_code: described.ref },
        { email: trimmed },
      );
      if (described.retryAfterSeconds) {
        // A code went out recently and is still the valid one.
        startCooldown(described.retryAfterSeconds);
        setMlStep("code");
        setMlInfo(described.message);
        return;
      }
      setServerError(`${described.message} (ref: ${described.ref})`);
      toast.error("The email wasn't sent");
      return;
    }

    // Supabase answers the same way whether or not the address has an account
    // (shouldCreateUser: false), so this must not claim the address exists.
    recordAuthEvent("magic_link_requested", { method: "magic_link", reason: "sent" }, { email: trimmed });
    startCooldown(RESEND_COOLDOWN_SECONDS);
    setMlCode("");
    setMlStep("code");
    setMlInfo(
      `If ${trimmed} has an account, a 6-digit sign-in code is on its way. Only the code in the most recent email works, and it lasts 1 hour.`,
    );
    toast.success("Check your email for the 6-digit code");
  }

  async function onMagicLinkVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    const email = mlEmail.trim().toLowerCase();
    if (!forgotPasswordSchema.safeParse({ email }).success) {
      setServerError("Enter the email address the code was sent to.");
      return;
    }
    setMlVerifying(true);

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: mlCode,
      type: "email",
    });

    if (error || !data.session) {
      const described = error
        ? describeCodeError(error)
        : { message: "The code couldn't be checked. Try again.", ref: "no_session" };
      recordAuthEvent(
        "magic_link_requested",
        { method: "magic_link", reason: "code_rejected", error_code: described.ref },
        { email },
      );
      const msg = `${described.message} (ref: ${described.ref})`;
      setServerError(msg);
      toast.error(msg);
      setMlVerifying(false);
      // verifyOtp doesn't consume the captcha (the request-code step did)
      // — nothing to reset here.
      return;
    }

    recordAuthEvent("login", { method: "magic_link" });
    const needsChange = data.user?.user_metadata?.requires_password_change;
    if (needsChange) {
      navigate("/auth/reset-password");
      return;
    }
    toast.success("Signed in");
    const next = safeNext(searchParams.get("next"));
    if (next) {
      navigate(next);
    } else {
      await redirectByRole(data.user!.id);
    }
  }

  // ---------- Magic-link code-entry step ----------
  if (mode === "magic-link" && mlStep === "code") {
    return (
      <AuthLayout subtitle="Enter the 6-digit sign-in code from your email">
        <form onSubmit={onMagicLinkVerify} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ml-code-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="ml-code-email"
                type="email"
                autoComplete="email"
                placeholder="your@email.com"
                className="pl-10"
                value={mlEmail}
                onChange={(e) => setMlEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ml-code">Verification Code</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="ml-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                className="pl-10 text-lg tracking-widest"
                value={mlCode}
                // Digits only, then cap at 6, so a pasted "123 456" survives.
                onChange={(e) => setMlCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use the code from the most recent email. Asking for a new code cancels the old one.
            </p>
          </div>

          {mlInfo && (
            <p className="text-sm text-muted-foreground" role="status">
              {mlInfo}
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
            disabled={mlVerifying || mlCode.length !== 6}
          >
            {mlVerifying ? "Verifying..." : "Verify & Sign In"}
          </Button>

          <CaptchaTurnstile ref={captchaRef} onTokenChange={setCaptchaToken} />

          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            disabled={mlSending || cooldownLeft > 0 || !mlEmail.trim()}
            onClick={() => void sendSignInCode(mlEmail)}
          >
            {mlSending
              ? "Sending..."
              : cooldownLeft > 0
                ? `Send a new code (${cooldownLeft}s)`
                : "Send a new code"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full"
            size="lg"
            onClick={() => {
              setMlStep("email");
              setMlCode("");
              setServerError(null);
              setMlInfo(null);
            }}
          >
            Back
          </Button>
        </form>
      </AuthLayout>
    );
  }

  // ---------- Default: mode tabs + form ----------
  return (
    <AuthLayout subtitle="Enter your email below to login to your account">
      <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-md text-sm">
        <button
          type="button"
          onClick={() => { setMode("password"); setServerError(null); }}
          className={`py-2 rounded ${mode === "password" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => { setMode("magic-link"); setServerError(null); }}
          className={`py-2 rounded ${mode === "magic-link" ? "bg-background shadow-sm font-medium" : "text-muted-foreground"}`}
        >
          Sign-in code
        </button>
      </div>

      {mode === "password" ? (
        <form onSubmit={pw.handleSubmit(onPasswordSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                placeholder="your@email.com"
                autoComplete="email"
                className="pl-10"
                {...pw.register("email")}
              />
            </div>
            {pw.formState.errors.email && (
              <p className="text-sm text-destructive">{pw.formState.errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/auth/forgot-password" className="text-sm text-primary hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="pl-10"
                {...pw.register("password")}
              />
            </div>
            {pw.formState.errors.password && (
              <p className="text-sm text-destructive">{pw.formState.errors.password.message}</p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          <CaptchaTurnstile ref={captchaRef} onTokenChange={setCaptchaToken} />

          <Button type="submit" className="w-full" size="lg" disabled={pw.formState.isSubmitting}>
            {pw.formState.isSubmitting ? "Signing in..." : "Sign in"}
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            No account? This system is invite-only — contact your administrator.
          </div>
        </form>
      ) : (
        <form onSubmit={ml.handleSubmit(onMagicLinkRequest)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ml-email">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="ml-email"
                type="email"
                placeholder="your@email.com"
                autoComplete="email"
                className="pl-10"
                {...ml.register("email")}
              />
            </div>
            {ml.formState.errors.email && (
              <p className="text-sm text-destructive">{ml.formState.errors.email.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              We&apos;ll email you a 6-digit code. No password needed.
            </p>
          </div>

          {serverError && (
            <p className="text-sm text-destructive" role="alert">
              {serverError}
            </p>
          )}

          <CaptchaTurnstile ref={captchaRef} onTokenChange={setCaptchaToken} />

          <Button type="submit" className="w-full" size="lg" disabled={ml.formState.isSubmitting}>
            {ml.formState.isSubmitting ? "Sending..." : "Send Code"}
          </Button>

          <Button
            type="button"
            variant="link"
            className="w-full"
            onClick={() => {
              setServerError(null);
              setMlStep("code");
            }}
          >
            I already have a code
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            No account? This system is invite-only — contact your administrator.
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
