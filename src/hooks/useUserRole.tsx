import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "Admin" | "Client" | "Contractor" | null;

export const useUserRole = () => {
  return useQuery({
    queryKey: ["user-role"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data?.role as UserRole;
    },
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
