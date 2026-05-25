"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/views/auth/AuthLayout";
import { recordAuthEvent } from "@/lib/auth-audit";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validation-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit({ email }: ForgotPasswordInput) {
    setServerError(null);
    const { error } = await supabase.functions.invoke("send-password-reset", {
      body: { email: email.trim().toLowerCase() },
    });

    // Never reveal whether the address exists — always show success state.
    recordAuthEvent("password_reset_requested", { method: "recovery" });

    if (error && process.env.NODE_ENV === "development") {
      console.warn("[forgot-password] send-password-reset error", error);
    }

    setSent(true);
    toast.success("Check your email for the reset link");
  }

  if (sent) {
    return (
      <AuthLayout subtitle="Check your email for the reset link">
        <div className="space-y-4">
          <div className="rounded-lg bg-muted p-6 text-center space-y-3">
            <Mail className="h-10 w-10 mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">
              We&apos;ve sent a password reset link to your email. Check your inbox and spam folder.
            </p>
            <p className="text-xs text-muted-foreground">The link expires in 1 hour.</p>
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
    <AuthLayout subtitle="Enter your email to receive a password reset link">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          {isSubmitting ? "Sending..." : "Send Reset Link"}
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
