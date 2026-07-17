import { Navigate, useSearchParams } from "@/lib/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useOnboardingStatus } from "@/components/auth/useOnboardingStatus";
import { AuthLoading } from "@/components/auth/AuthLoading";
import { OnboardingGate } from "@/components/auth/OnboardingGate";

const ClientProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { data: userRole, isPending: rolePending } = useUserRole();
  const [searchParams] = useSearchParams();
  const previewClientId = searchParams.get("preview");
  const { data: onboardingStatus, refetch } = useOnboardingStatus(!!session);

  if (sessionLoading) return <AuthLoading variant="skeleton" />;
  if (!session) return <Navigate to="/auth/login" replace />;
  // isPending, not isLoading: the role query is *disabled* until the session's
  // userId lands, and a disabled query reports isLoading=false while userRole
  // is still undefined — routing on it then bounces admins to /dashboard.
  // Signed-out users never reach here (redirected above), so this settles.
  if (rolePending) return <AuthLoading variant="skeleton" />;
  // Admin preview path — render children without role match (so admins can
  // visit a Client portal as another user).
  if (userRole === "Admin" && previewClientId) return <>{children}</>;
  if (userRole !== "Client") return <Navigate to="/dashboard" replace />;

  return (
    <OnboardingGate onboardingStatus={onboardingStatus} onComplete={() => refetch()}>
      {children}
    </OnboardingGate>
  );
};

export default ClientProtectedRoute;
