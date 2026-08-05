import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type ClientSite = Tables<"sites"> & {
  managing_agencies: { id: string; name: string } | null;
};

type ClientScope = {
  client_id: string;
  managing_agency_id?: string | null;
} | null | undefined;

/**
 * The one client-portal sites query. RLS already scopes rows to the user's
 * client — and to their managing agency when their mapping carries one — so
 * the filters here mirror the server-side scope for defense in depth rather
 * than implementing it.
 *
 * withSignedImages swaps each site_image_url for a short-lived signed URL
 * (site-images is a private bucket); leave it off for consumers that only
 * need counts/ids so a dashboard load doesn't sign 40 image URLs.
 */
export const useClientSites = (
  clientInfo: ClientScope,
  options?: { withSignedImages?: boolean },
) => {
  const withSignedImages = options?.withSignedImages ?? false;

  return useQuery({
    queryKey: [
      "client-sites",
      clientInfo?.client_id,
      clientInfo?.managing_agency_id ?? null,
      withSignedImages,
    ],
    enabled: !!clientInfo?.client_id,
    queryFn: async (): Promise<ClientSite[]> => {
      let query = supabase
        .from("sites")
        .select("*, managing_agencies(id, name)")
        .eq("client_id", clientInfo!.client_id)
        .order("name");
      if (clientInfo!.managing_agency_id) {
        query = query.eq("managing_agency_id", clientInfo!.managing_agency_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      const sites = (data ?? []) as ClientSite[];

      if (!withSignedImages) return sites;

      return Promise.all(
        sites.map(async (site) => {
          if (!site.site_image_url) return site;
          try {
            const urlParts = site.site_image_url.split("/site-images/");
            if (urlParts.length > 1) {
              const path = urlParts[1].split("?")[0];
              const { data: signedData } = await supabase.storage
                .from("site-images")
                .createSignedUrl(path, 3600);
              if (signedData?.signedUrl) {
                return { ...site, site_image_url: signedData.signedUrl };
              }
            }
          } catch (error) {
            console.error("Error generating signed URL for site image:", error);
          }
          return site;
        }),
      );
    },
  });
};
