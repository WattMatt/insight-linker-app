"use client";

import { useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";

// useRoleRedirect — single place to decide where a freshly-authenticated user
// lands. Mirrors the logic that used to live three times inside Auth.tsx.
//
// Roles known to the app: Admin, User, Client, Contractor, Moderator (per
// public.app_role enum). Clients → /client-portal; Contractors → /contractor;
// everyone else (including no-role-set yet) → /dashboard.
export function useRoleRedirect() {
  const navigate = useNavigate();

  async function redirectByRole(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (error && process.env.NODE_ENV === "development") {
      console.warn("[useRoleRedirect] failed to fetch role", error);
    }

    if (data?.role === "Client") {
      navigate("/client-portal");
    } else if (data?.role === "Contractor") {
      navigate("/contractor");
    } else {
      navigate("/dashboard");
    }
  }

  return { redirectByRole };
}
