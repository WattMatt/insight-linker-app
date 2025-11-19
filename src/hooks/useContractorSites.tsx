import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "./useUserRole";

const generateSignedUrl = async (siteImageUrl: string | null) => {
  if (!siteImageUrl) return null;
  
  try {
    const urlParts = siteImageUrl.split('/site-images/');
    if (urlParts.length > 1) {
      const path = urlParts[1].split('?')[0];
      const { data: signedData } = await supabase.storage
        .from('site-images')
        .createSignedUrl(path, 3600);
      
      if (signedData?.signedUrl) {
        return signedData.signedUrl;
      }
    }
  } catch (error) {
    console.error('Error generating signed URL for site image:', error);
  }
  return siteImageUrl;
};

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
        if (!site) return [];
        
        // Generate signed URL for site image
        const signedUrl = await generateSignedUrl(site.site_image_url);
        return [{ ...site, site_image_url: signedUrl }];
      }

      // Normal contractor flow
      const { data: siteAssignments, error } = await supabase
        .from("user_sites")
        .select("site_id, sites(id, name, address, site_type, site_image_url, client_id, clients(name, company_name, logo_url))")
        .eq("user_id", user.id);

      if (error) throw error;
      
      // Generate signed URLs for all site images
      const sites = siteAssignments?.map(assignment => assignment.sites).filter(Boolean) || [];
      const sitesWithSignedUrls = await Promise.all(
        sites.map(async (site: any) => {
          if (!site) return null;
          const signedUrl = await generateSignedUrl(site.site_image_url);
          return { ...site, site_image_url: signedUrl };
        })
      );
      
      return sitesWithSignedUrls.filter(Boolean);
    },
  });
};
