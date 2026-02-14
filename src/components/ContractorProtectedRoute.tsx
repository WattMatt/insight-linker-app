import { useEffect, useState } from "react";
import { Navigate, useSearchParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "./ui/skeleton";
import { OnboardingWizard } from "@/components/OnboardingWizard";

const ContractorProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const previewSiteId = searchParams.get("preview");
  const { data: userRole, isLoading: roleLoading } = useUserRole();

  const { data: onboardingStatus, refetch: refetchOnboarding } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", user.id)
        .single();
      return data;
    },
    enabled: isAuthenticated === true,
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (isAuthenticated === null || roleLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 w-full max-w-md p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  if (userRole === "Admin" && previewSiteId) {
    return <>{children}</>;
  }

  if (userRole !== "Contractor") {
    return <Navigate to="/dashboard" replace />;
  }

  if (!location.pathname.startsWith("/contractor")) {
    return <Navigate to="/contractor" replace />;
  }

  const showOnboarding = onboardingStatus && !onboardingStatus.onboarding_completed && !onboardingDismissed;

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard
          open={true}
          onComplete={() => {
            setOnboardingDismissed(true);
            refetchOnboarding();
          }}
        />
      )}
      {children}
    </>
  );
};

export default ContractorProtectedRoute;
