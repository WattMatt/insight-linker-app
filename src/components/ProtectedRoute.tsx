import { Navigate, useLocation } from "@/lib/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useOnboardingStatus } from "@/components/auth/useOnboardingStatus";
import { AuthLoading } from "@/components/auth/AuthLoading";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const location = useLocation();
  const {
    data: onboardingStatus,
    isLoading: onboardingLoading,
    isError: onboardingError,
  } = useOnboardingStatus(!!session);

  if (sessionLoading || roleLoading) return <AuthLoading variant="spinner" />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + (location.search || ""));
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }
  // Forced password change is enforced at the guard, not just on the login
  // pages — a user who deep-links past /auth/login still lands on set-password.
  // The flag is cleared by SetPassword/ResetPassword after a successful change.
  if (session.user?.user_metadata?.requires_password_change === true) {
    return <Navigate to="/auth/set-password" replace />;
  }
  if (userRole === "Contractor") return <Navigate to="/contractor" replace />;
  if (userRole === "Client") return <Navigate to="/client-portal" replace />;

  // First-run gate (STANDARD D2): redirect to the dedicated /onboarding route.
  // Never redirect while the status is loading/unknown, and fail SAFE on
  // lookup errors (admit rather than trap — RLS remains the hard boundary).
  if (
    !onboardingLoading &&
    !onboardingError &&
    onboardingStatus &&
    onboardingStatus.onboarding_completed === false
  ) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
