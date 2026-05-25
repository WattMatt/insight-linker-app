"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, User } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/views/auth/AuthLayout";
import { CaptchaTurnstile, CAPTCHA_ENABLED } from "@/components/CaptchaTurnstile";
import { recordAuthEvent } from "@/lib/auth-audit";
import { signUpSchema, type SignUpInput } from "@/lib/validation-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Signup() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });

  async function onSubmit({ email, password, fullName }: SignUpInput) {
    setServerError(null);
    if (CAPTCHA_ENABLED && !captchaToken) {
      setServerError("Please complete the verification challenge.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/dashboard`,
        ...(captchaToken ? { captchaToken } : {}),
      },
    });

    if (error) {
      const msg = error.message.includes("already registered")
        ? "This email is already registered. Please sign in instead."
        : error.message;
      setServerError(msg);
      toast.error(msg);
      return;
    }

    if (data.user) {
      recordAuthEvent("user_created", { method: "self" });
      toast.success("Account created. An admin will assign your role.", { duration: 8000 });
      setDone(true);
    }
  }

  if (done) {
    return (
      <AuthLayout subtitle="Account created">
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-6 text-center space-y-3">
            <Mail className="h-10 w-10 mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">
              Your account has been created. An admin will review and assign your role.
              You&apos;ll receive an email once you have access.
            </p>
          </div>
          <Link href="/auth/login" className="block">
            <Button type="button" variant="outline" className="w-full" size="lg">
              Back to Login
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout subtitle="Create your account to get started">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full Name</Label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="fullName"
              type="text"
              autoComplete="name"
              className="pl-10"
              {...register("fullName")}
            />
          </div>
          {errors.fullName && (
            <p className="text-sm text-destructive">{errors.fullName.message}</p>
          )}
        </div>

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
              {...register("email")}
            />
          </div>
          {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="pl-10"
              {...register("password")}
            />
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        {serverError && (
          <p className="text-sm text-destructive" role="alert">
            {serverError}
          </p>
        )}

        <CaptchaTurnstile onTokenChange={setCaptchaToken} />

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Sign up"}
        </Button>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Already have an account? </span>
          <Link href="/auth/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
