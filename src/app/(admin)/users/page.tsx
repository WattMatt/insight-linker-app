"use client";
import Users from "@/views/Users";
import AdminOnlyRoute from "@/components/AdminOnlyRoute";

// /users is Admin-only (STANDARD A9): gated at the page level so the rest of
// the (admin) group keeps its existing ProtectedRoute-only behaviour.
export default function Page() {
  return (
    <AdminOnlyRoute>
      <Users />
    </AdminOnlyRoute>
  );
}
