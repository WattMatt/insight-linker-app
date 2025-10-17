import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "./useUserRole";

export const useContractorSites = (previewSiteId?: string) => {
  const { data: userRole } = useUserRole();
  
  return useQuery({
    queryKey: ["contractor-sites", previewSiteId],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // If admin is previewing a specific site
      if (userRole === "Admin" && previewSiteId) {
        const { data: site, error } = await supabase
          .from("sites")
          .select("id, name, address, site_type, site_image_url, client_id, clients(name, company_name, logo_url)")
          .eq("id", previewSiteId)
          .single();

        if (error) throw error;
        return site ? [site] : [];
      }

      // Normal contractor flow
      const { data: siteAssignments, error } = await supabase
        .from("user_sites")
        .select("site_id, sites(id, name, address, site_type, site_image_url, client_id, clients(name, company_name, logo_url))")
        .eq("user_id", user.id);

      if (error) throw error;
      return siteAssignments?.map(assignment => assignment.sites).filter(Boolean) || [];
    },
  });
};
