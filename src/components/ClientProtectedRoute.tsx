import { Navigate, useSearchParams, useLocation } from "@/lib/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useOnboardingStatus } from "@/components/auth/useOnboardingStatus";
import { AuthLoading } from "@/components/auth/AuthLoading";

const ClientProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const previewClientId = searchParams.get("preview");
  const {
    data: onboardingStatus,
    isLoading: onboardingLoading,
    isError: onboardingError,
  } = useOnboardingStatus(!!session);

  if (sessionLoading || roleLoading) return <AuthLoading variant="skeleton" />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + (location.search || ""));
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }
  // Forced password change enforced at the guard (see ProtectedRoute).
  if (session.user?.user_metadata?.requires_password_change === true) {
    return <Navigate to="/auth/set-password" replace />;
  }
  // Admin preview path — render children without role match (so admins can
  // visit a Client portal as another user).
  if (userRole === "Admin" && previewClientId) return <>{children}</>;
  if (userRole !== "Client") return <Navigate to="/dashboard" replace />;

  // First-run gate (STANDARD D2): redirect-style, never while loading/unknown,
  // fail safe on lookup errors.
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

export default ClientProtectedRoute;
