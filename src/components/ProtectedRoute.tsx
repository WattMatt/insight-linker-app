import { useEffect, useState } from "react";
import { Navigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { useUserRole } from "@/hooks/useUserRole";
import { useQuery } from "@tanstack/react-query";
import { OnboardingWizard } from "@/components/OnboardingWizard";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
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
    enabled: !!session,
  });

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth/login" replace />;
  }

  if (userRole === "Contractor") {
    return <Navigate to="/contractor" replace />;
  }

  if (userRole === "Client") {
    return <Navigate to="/client-portal" replace />;
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

export default ProtectedRoute;
