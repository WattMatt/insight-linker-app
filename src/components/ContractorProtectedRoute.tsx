import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Skeleton } from "./ui/skeleton";

const ContractorProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [searchParams] = useSearchParams();
  const previewSiteId = searchParams.get("preview");
  const { data: userRole, isLoading: roleLoading } = useUserRole();

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

  // Allow admins with preview parameter to access contractor portal
  if (userRole === "Admin" && previewSiteId) {
    return <>{children}</>;
  }

  // Redirect to dashboard if user is not a contractor
  if (userRole !== "Contractor") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ContractorProtectedRoute;
