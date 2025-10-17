import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "Admin" | "Client" | null;

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

export const useClientInfo = () => {
  return useQuery({
    queryKey: ["user-client-info"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Get the client mapping
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
