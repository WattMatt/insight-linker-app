import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export type UserRole = "Admin" | "Client" | "Contractor" | null;

export const useUserRole = () => {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
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
      return (data?.role as UserRole) ?? null;
    },
    enabled: !!userId,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });
};

export const useClientInfo = (previewClientId?: string) => {
  const { data: userRole } = useUserRole();
  
  return useQuery({
    queryKey: ["user-client-info", previewClientId],
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
