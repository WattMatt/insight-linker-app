"use client";

import Link from "next/link";
import { Mail } from "lucide-react";
import { AuthLayout } from "@/views/auth/AuthLayout";
import { Button } from "@/components/ui/button";

// Self-signup is disabled — this product is invite-only. Admins create
// accounts via Admin -> Users (which calls the `invite-user` Edge Function).
// The /auth/signup route is preserved so old links and bookmarks don't 404,
// but it now shows a notice rather than a form.
//
// To re-enable self-signup later: restore the previous form (see commit
// 180822d) and remove this notice.
export default function Signup() {
  return (
    <AuthLayout subtitle="This system is invite-only">
      <div className="space-y-6">
        <div className="rounded-lg bg-muted p-6 text-center space-y-3">
          <Mail className="h-10 w-10 mx-auto text-primary" />
          <p className="text-sm text-muted-foreground">
            Accounts are created by your administrator. If you need access,
            contact the person who manages your organisation&apos;s account.
          </p>
          <p className="text-xs text-muted-foreground">
            You&apos;ll receive an email invitation to set your password.
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
