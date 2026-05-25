"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock } from "lucide-react";
import { toast } from "sonner";

import { useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/views/auth/AuthLayout";
import { useRoleRedirect } from "@/views/auth/useRoleRedirect";
import { recordAuthEvent } from "@/lib/auth-audit";
import { signInSchema, type SignInInput } from "@/lib/validation-schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const navigate = useNavigate();
  const { redirectByRole } = useRoleRedirect();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });

  // If the user is already signed in, route them home immediately.
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const needsChange = data.session.user.user_metadata?.requires_password_change;
        if (needsChange) {
          navigate("/auth/reset-password");
        } else {
          void redirectByRole(data.session.user.id);
        }
      }
    });
  }, [navigate, redirectByRole]);

  async function onSubmit({ email, password }: SignInInput) {
    setServerError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const msg = error.message.includes("Invalid login credentials")
        ? "Invalid email or password"
        : error.message;
      setServerError(msg);
      toast.error(msg);
      return;
    }

    if (data.session) {
      recordAuthEvent("login", { method: "password" });
      const needsChange = data.user?.user_metadata?.requires_password_change;
      if (needsChange) {
        navigate("/auth/reset-password");
        return;
      }
      toast.success("Signed in successfully");
      await redirectByRole(data.user!.id);
    }
  }

  return (
    <AuthLayout subtitle="Enter your email below to login to your account">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/auth/forgot-password"
              className="text-sm text-primary hover:underline"
            >
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

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </Button>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">Don&apos;t have an account? </span>
          <Link href="/auth/signup" className="text-primary hover:underline font-medium">
            Sign up
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
