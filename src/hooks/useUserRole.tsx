import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export type UserRole = "Admin" | "Client" | "Contractor" | null;

export const useUserRole = () => {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Get the initial user id from getSession (reads localStorage — works OFFLINE) rather
    // than getUser (network). Offline, getUser fails → no userId → the role query stays
    // disabled → a returning user is treated as role-less and misrouted off their pages.
    // With the id from the cached session, the role query serves its react-query cache.
    supabase.auth.getSession()
      .then(({ data: { session } }) => setUserId(session?.user?.id ?? null))
      .catch((err) => {
        console.error("Failed to read session for user role:", err);
        setUserId(null);
      });

    // Listen for auth changes and invalidate role cache when user changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id ?? null;
      setUserId((prev) => {
        if (prev !== newUserId) {
          // User changed — clear all role/onboarding caches immediately
          queryClient.removeQueries({ queryKey: ["user-role"] });
          queryClient.removeQueries({ queryKey: ["onboarding-status"] });
          queryClient.removeQueries({ queryKey: ["user-client-info"] });
        }
        return newUserId;
      });
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  return useQuery({
    queryKey: ["user-role", userId],
    queryFn: async () => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw error;
      return data?.role as UserRole;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useClientInfo = (previewClientId?: string) => {
  const { data: userRole, isPending: roleIsPending } = useUserRole();

  return useQuery({
    // The role is part of the key: the queryFn branches on it, so a result
    // computed before the role resolved must not be served once it has.
    queryKey: ["user-client-info", previewClientId ?? null, userRole ?? null],
    // Wait for the role query to settle (isPending covers its disabled phase
    // before the session's userId lands) — otherwise an admin preview would
    // run the normal-client branch and cache null.
    enabled: !roleIsPending,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // If admin is previewing a specific client
      if (userRole === "Admin" && previewClientId) {
        const { data: client, error } = await supabase
          .from("clients")
          .select("id, name, logo_url, company_name")
          .eq("id", previewClientId)
          .single();

        if (error) throw error;
        return {
          client_id: client.id,
          clients: client,
        };
      }

      // Normal client user flow
      const { data: mapping, error: mappingError } = await supabase
        .from("user_clients")
        .select("client_id, clients(id, name, logo_url, company_name)")
        .eq("user_id", user.id)
        .maybeSingle();

      if (mappingError) throw mappingError;
      return mapping;
    },
  });
};
