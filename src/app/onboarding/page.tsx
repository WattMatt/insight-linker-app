"use client";

import { Suspense, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useOnboardingStatus } from "@/components/auth/useOnboardingStatus";
import { useRoleRedirect } from "@/views/auth/useRoleRedirect";
import { AuthLoading } from "@/components/auth/AuthLoading";
import { LoadingState } from "@/components/LoadingState";

// /onboarding — dedicated first-run route (STANDARD D2). The route guards
// (ProtectedRoute, ClientProtectedRoute, ContractorProtectedRoute) redirect
// here while profiles.onboarding_completed is false; this page redirects back
// out (by role) once onboarding is complete, so it can't trap a finished user.

// Small effect-wrapper so redirectByRole (async role lookup) can run from render.
function RoleRedirect({ userId }: { userId: string }) {
  const { redirectByRole } = useRoleRedirect();
  useEffect(() => {
    void redirectByRole(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once on mount
  }, []);
  return <AuthLoading variant="spinner" />;
}

function OnboardingInner() {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { data: onboardingStatus, isLoading, isError, refetch } = useOnboardingStatus(!!session);
  const { redirectByRole } = useRoleRedirect();
  const queryClient = useQueryClient();

  if (sessionLoading) return <AuthLoading variant="spinner" />;
  if (!session) return <Navigate to="/auth/login" replace />;
  if (isLoading) return <AuthLoading variant="spinner" />;

  // Already onboarded (or status unknowable): leave via the role-based
  // landing decision rather than blocking the user here (fail safe).
  if (isError || !onboardingStatus || onboardingStatus.onboarding_completed) {
    return <RoleRedirect userId={session.user.id} />;
  }

  return (
    <OnboardingWizard
      fullPage
      onComplete={async () => {
        await refetch();
        queryClient.invalidateQueries({ queryKey: ["onboarding-status"] });
        const { data } = await supabase.auth.getUser();
        await redirectByRole(data.user?.id ?? session.user.id);
      }}
    />
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<LoadingState variant="full-page" message="Loading..." />}>
      <OnboardingInner />
    </Suspense>
  );
}
