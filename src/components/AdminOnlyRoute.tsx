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
  const { data: userRole, isPending, isError } = useUserRole();

  // isPending, not isLoading: the role query is *disabled* until getSession()
  // supplies the user id, and a disabled query reports isLoading=false with no
  // data — this gate then bounced every Admin from /users to /dashboard
  // (same trap as ClientProtectedRoute). isPending stays true until a result
  // or an error arrives; an error is not pending, so it still fails closed.
  if (isPending && !isError) return <AuthLoading variant="spinner" />;
  if (isError || userRole !== "Admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

export default AdminOnlyRoute;
