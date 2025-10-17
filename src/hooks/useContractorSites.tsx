import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useContractorSites = () => {
  return useQuery({
    queryKey: ["contractor-sites"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: siteAssignments, error } = await supabase
        .from("user_sites")
        .select("site_id, sites(id, name, address, site_type, site_image_url, client_id, clients(name, company_name, logo_url))")
        .eq("user_id", user.id);

      if (error) throw error;
      return siteAssignments?.map(assignment => assignment.sites).filter(Boolean) || [];
    },
  });
};
