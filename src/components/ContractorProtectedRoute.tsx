import { Navigate, useSearchParams, useLocation } from "@/lib/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useOnboardingStatus } from "@/components/auth/useOnboardingStatus";
import { AuthLoading } from "@/components/auth/AuthLoading";
import { OnboardingGate } from "@/components/auth/OnboardingGate";
import { OrphanResolutionModal } from "@/components/OrphanResolutionModal";

const ContractorProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const previewSiteId = searchParams.get("preview");
  const { data: onboardingStatus, refetch } = useOnboardingStatus(!!session);

  if (sessionLoading || roleLoading) return <AuthLoading variant="skeleton" />;
  if (!session) {
    const next = encodeURIComponent(location.pathname + (location.search || ""));
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }
  if (userRole === "Admin" && previewSiteId) return <>{children}</>;
  if (userRole !== "Contractor") return <Navigate to="/dashboard" replace />;
  if (!location.pathname.startsWith("/contractor")) return <Navigate to="/contractor" replace />;

  return (
    <OnboardingGate onboardingStatus={onboardingStatus} onComplete={() => refetch()}>
      {/* Stage 4b force-at-login: blocks the app until any orphan inspections
          owned by this user are resolved. Auto-hides when none are left.
          Server-side guards in resolve_my_orphan / archive_my_orphan RPCs. */}
      <OrphanResolutionModal />
      {children}
    </OnboardingGate>
  );
};

export default ContractorProtectedRoute;
