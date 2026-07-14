/**
 * React Query hooks over the sites repository — the pattern every view should
 * use instead of useEffect + useState + inline supabase.from() (see Sites.tsx,
 * Dashboard.tsx, SiteDetail.tsx for the pattern being replaced).
 *
 * What views gain by switching:
 *  - shared cache: admin, portal and contractor screens reading the same site
 *    no longer refetch it independently
 *  - loading/error state handled by React Query instead of hand-rolled useState
 *  - targeted invalidation via the query-key factory instead of blanket
 *    queryClient.invalidateQueries()
 */
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchClientOptions, fetchSites } from "@/lib/data/sites";

export function useSitesList(options: { clientId?: string; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.sites.list({ clientId: options.clientId }),
    queryFn: () => fetchSites({ clientId: options.clientId }),
    enabled: options.enabled ?? true,
    // Site metadata changes rarely; signed URLs live for 3600s. Refresh before
    // the URLs expire but stop the refetch-on-every-focus the default (0) causes.
    staleTime: 5 * 60 * 1000,
  });
}

export function useClientOptions(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.clients.lists(),
    queryFn: fetchClientOptions,
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}
