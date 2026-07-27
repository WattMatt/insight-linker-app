import { Navigate, useLocation } from "@/lib/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useOnboardingStatus } from "@/components/auth/useOnboardingStatus";
import { AuthLoading } from "@/components/auth/AuthLoading";
import { OnboardingGate } from "@/components/auth/OnboardingGate";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const location = useLocation();
  const { data: onboardingStatus, refetch } = useOnboardingStatus(!!session);

  if (sessionLoading || roleLoading) return <AuthLoading variant="spinner" />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + (location.search || ""));
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }
  if (userRole === "Contractor") return <Navigate to="/contractor" replace />;
  if (userRole === "Client") return <Navigate to="/client-portal" replace />;

  return (
    <OnboardingGate onboardingStatus={onboardingStatus} onComplete={() => refetch()}>
      {children}
    </OnboardingGate>
  );
};

export default ProtectedRoute;
