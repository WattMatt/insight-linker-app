import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SearchResultType = "client" | "site" | "subsection" | "inspection";

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  description?: string;
  url: string;
  metadata?: {
    clientId?: string;
    siteId?: string;
    subsectionId?: string;
    cocStatus?: string;
    status?: string;
  };
}

export interface SearchFilters {
  clientIds?: string[];
  siteTypes?: string[];
  cocStatuses?: string[];
  inspectionStatuses?: string[];
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Sanitize a user query before interpolating it into PostgREST `.or(...)`/`.ilike(...)`
 * filter strings.
 * - Removes the `.or` delimiter `,` and the grouping chars `(`/`)` which would
 *   produce malformed filters (PostgREST 400 -> silent empty results).
 * - Backslash-escapes the LIKE wildcards `%` and `_` so they match literally.
 */
const sanitizeSearchQuery = (raw: string): string =>
  raw
    .replace(/[,()]/g, " ")
    .replace(/[%_]/g, (ch) => `\\${ch}`)
    .trim();

export const useGlobalSearch = (
  searchQuery: string,
  filters: SearchFilters = {}
) => {
  return useQuery({
    queryKey: ["global-search", searchQuery, filters],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) {
        return [];
      }

      const results: SearchResult[] = [];
      const query = sanitizeSearchQuery(searchQuery.toLowerCase());

      // Search Clients
      let clientQuery = supabase
        .from("clients")
        .select("id, name, company_name, email")
        .or(`name.ilike.%${query}%,company_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);

      if (filters.clientIds?.length) {
        clientQuery = clientQuery.in("id", filters.clientIds);
      }

      const { data: clients } = await clientQuery;

      clients?.forEach((client) => {
        results.push({
          id: client.id,
          type: "client",
          title: client.name,
          subtitle: client.company_name || undefined,
          description: client.email || undefined,
          url: `/clients/${client.id}`,
          metadata: { clientId: client.id },
        });
      });

      // Search Sites
      let siteQuery = supabase
        .from("sites")
        .select("id, name, address, site_type, client_id, clients(name)")
        .or(`name.ilike.%${query}%,address.ilike.%${query}%`)
        .limit(10);

      if (filters.clientIds?.length) {
        siteQuery = siteQuery.in("client_id", filters.clientIds);
      }
      if (filters.siteTypes?.length) {
        siteQuery = siteQuery.in("site_type", filters.siteTypes);
      }

      const { data: sites } = await siteQuery;

      sites?.forEach((site) => {
        results.push({
          id: site.id,
          type: "site",
          title: site.name,
          subtitle: site.site_type || undefined,
          description: site.address || undefined,
          url: site.client_id ? `/clients/${site.client_id}/sites/${site.id}` : `/sites/${site.id}`,
          metadata: {
            clientId: site.client_id,
            siteId: site.id,
          },
        });
      });

      // Search Subsections
      let subsectionQuery = supabase
        .from("subsections")
        .select(
          "id, name, tenant_name, coc_number, meter_serial_number, coc_status, site_id, sites(name, client_id)"
        )
        .or(
          `name.ilike.%${query}%,tenant_name.ilike.%${query}%,coc_number.ilike.%${query}%,meter_serial_number.ilike.%${query}%`
        )
        .limit(10);

      if (filters.cocStatuses?.length) {
        subsectionQuery = subsectionQuery.in("coc_status", filters.cocStatuses);
      }

      const { data: subsections } = await subsectionQuery;

      subsections?.forEach((subsection) => {
        // Apply client filter manually since we can't do nested filtering
        if (
          filters.clientIds?.length &&
          !filters.clientIds.includes(subsection.sites?.client_id || "")
        ) {
          return;
        }

        const clientId = subsection.sites?.client_id;
        const subsectionUrl = clientId 
          ? `/clients/${clientId}/sites/${subsection.site_id}/subsections/${subsection.id}`
          : `/sites/${subsection.site_id}/subsections/${subsection.id}`;

        results.push({
          id: subsection.id,
          type: "subsection",
          title: subsection.name,
          subtitle: subsection.tenant_name || subsection.sites?.name || undefined,
          description: subsection.coc_number
            ? `COC: ${subsection.coc_number}`
            : subsection.meter_serial_number
            ? `Meter: ${subsection.meter_serial_number}`
            : undefined,
          url: subsectionUrl,
          metadata: {
            clientId: clientId,
            siteId: subsection.site_id,
            subsectionId: subsection.id,
            cocStatus: subsection.coc_status || undefined,
          },
        });
      });

      // Search Inspections
      let inspectionQuery = supabase
        .from("inspections")
        .select(
          "id, title, description, status, inspection_date, site_id, subsection_id, sites(name, client_id)"
        )
        .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(10);

      if (filters.inspectionStatuses?.length) {
        inspectionQuery = inspectionQuery.in("status", filters.inspectionStatuses);
      }

      if (filters.dateFrom) {
        inspectionQuery = inspectionQuery.gte(
          "inspection_date",
          filters.dateFrom.toISOString().split("T")[0]
        );
      }

      if (filters.dateTo) {
        inspectionQuery = inspectionQuery.lte(
          "inspection_date",
          filters.dateTo.toISOString().split("T")[0]
        );
      }

      const { data: inspections } = await inspectionQuery;

      inspections?.forEach((inspection) => {
        // Apply client filter manually
        if (
          filters.clientIds?.length &&
          !filters.clientIds.includes(inspection.sites?.client_id || "")
        ) {
          return;
        }

        const clientId = inspection.sites?.client_id;
        let inspectionUrl: string;
        
        if (inspection.subsection_id) {
          // Inspection linked to a subsection
          inspectionUrl = clientId
            ? `/clients/${clientId}/sites/${inspection.site_id}/subsections/${inspection.subsection_id}/inspections/${inspection.id}`
            : `/sites/${inspection.site_id}/subsections/${inspection.subsection_id}/inspections/${inspection.id}`;
        } else {
          // Site-level inspection - go to site with inspections tab
          inspectionUrl = clientId
            ? `/clients/${clientId}/sites/${inspection.site_id}?tab=inspections`
            : `/sites/${inspection.site_id}?tab=inspections`;
        }

        results.push({
          id: inspection.id,
          type: "inspection",
          title: inspection.title,
          subtitle: inspection.sites?.name || undefined,
          description: inspection.description || undefined,
          url: inspectionUrl,
          metadata: {
            clientId: clientId,
            siteId: inspection.site_id,
            status: inspection.status || undefined,
          },
        });
      });

      return results;
    },
    enabled: searchQuery.length >= 2,
  });
};

export const useSearchFilterOptions = () => {
  const { data: clients } = useQuery({
    queryKey: ["search-filter-clients"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      return data || [];
    },
  });

  const { data: siteTypes } = useQuery({
    queryKey: ["search-filter-site-types"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sites")
        .select("site_type")
        .not("site_type", "is", null);
      
      const uniqueTypes = [...new Set(data?.map((s) => s.site_type).filter(Boolean))];
      return uniqueTypes as string[];
    },
  });

  return {
    clients: clients || [],
    siteTypes: siteTypes || [],
    cocStatuses: ["Valid", "Expired", "Missing", "Pending"],
    inspectionStatuses: ["Pending", "In Progress", "Completed", "Failed"],
  };
};
