import { Navigate, useSearchParams, useLocation } from "@/lib/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useOnboardingStatus } from "@/components/auth/useOnboardingStatus";
import { AuthLoading } from "@/components/auth/AuthLoading";
import { OnboardingGate } from "@/components/auth/OnboardingGate";

const ClientProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const previewClientId = searchParams.get("preview");
  const { data: onboardingStatus, refetch } = useOnboardingStatus(!!session);

  if (sessionLoading || roleLoading) return <AuthLoading variant="skeleton" />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + (location.search || ""));
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }
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
