"use client";

import { Navigate } from "@/lib/navigation";
import { useUserRole } from "@/hooks/useUserRole";
import { AuthLoading } from "@/components/auth/AuthLoading";

// AdminOnlyRoute — route-level Admin gate (STANDARD A9) for admin-only pages
// inside the (admin) group, e.g. /users. The group's ProtectedRoute already
// guarantees a session and bounces Client/Contractor roles; this narrows the
// remainder (User, no-role, unknown) to Admin only.
//
// FAILS CLOSED: loading shows the loader; error, null, or any non-Admin role
// redirects to /dashboard. RLS remains the hard boundary underneath.
const AdminOnlyRoute = ({ children }: { children: React.ReactNode }) => {
  const { data: userRole, isLoading, isError } = useUserRole();

  if (isLoading) return <AuthLoading variant="spinner" />;
  if (isError || userRole !== "Admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

export default AdminOnlyRoute;
