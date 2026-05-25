import { Navigate } from "@/lib/navigation";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { AuthLoading } from "@/components/auth/AuthLoading";

const AuthOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, isLoading } = useAuthSession();

  if (isLoading) return <AuthLoading variant="spinner" />;
  if (!session) return <Navigate to="/auth/login" replace />;
  return <>{children}</>;
};

export default AuthOnlyRoute;
