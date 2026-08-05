import { Navigate, useSearchParams, useLocation } from "@/lib/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useOnboardingStatus } from "@/components/auth/useOnboardingStatus";
import { AuthLoading } from "@/components/auth/AuthLoading";
import { OrphanResolutionModal } from "@/components/OrphanResolutionModal";

const ContractorProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading: sessionLoading } = useAuthSession();
  const { data: userRole, isLoading: roleLoading } = useUserRole();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const previewSiteId = searchParams.get("preview");
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
  if (userRole === "Admin" && previewSiteId) return <>{children}</>;
  if (userRole !== "Contractor") return <Navigate to="/dashboard" replace />;
  if (!location.pathname.startsWith("/contractor")) return <Navigate to="/contractor" replace />;

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

  return (
    <>
      {/* Stage 4b force-at-login: blocks the app until any orphan inspections
          owned by this user are resolved. Auto-hides when none are left.
          Server-side guards in resolve_my_orphan / archive_my_orphan RPCs. */}
      <OrphanResolutionModal />
      {children}
    </>
  );
};

export default ContractorProtectedRoute;
