"use client";
import { Suspense } from "react";
import ForgotPassword from "@/views/auth/ForgotPassword";
export default function ForgotPasswordPage() {
  // Suspense: ForgotPassword reads ?step=code via useSearchParams.
  return (
    <Suspense>
      <ForgotPassword />
    </Suspense>
  );
}
