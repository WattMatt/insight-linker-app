/**
 * Central query-key factory for TanStack Query.
 *
 * Every useQuery/invalidateQueries call should build its key from this factory
 * instead of ad-hoc string arrays ("recent-site-assignments", "company-settings", ...).
 * Hierarchical keys make targeted invalidation possible:
 *
 *   queryClient.invalidateQueries({ queryKey: queryKeys.sites.all });          // every sites query
 *   queryClient.invalidateQueries({ queryKey: queryKeys.sites.detail(id) });   // one site
 *
 * Convention (TkDodo): each entity exposes `all` as the root, `lists`/`list(filters)`
 * for collections, and `detail(id)` for single records. Filters must be serialisable
 * and stable (no functions, no class instances).
 */

export interface SiteListFilters {
  clientId?: string;
}

export interface InspectionListFilters {
  siteId?: string;
  subsectionId?: string;
  status?: string;
}

export const queryKeys = {
  clients: {
    all: ["clients"] as const,
    lists: () => [...queryKeys.clients.all, "list"] as const,
    detail: (clientId: string) => [...queryKeys.clients.all, "detail", clientId] as const,
  },
  sites: {
    all: ["sites"] as const,
    lists: () => [...queryKeys.sites.all, "list"] as const,
    list: (filters: SiteListFilters = {}) => [...queryKeys.sites.lists(), filters] as const,
    detail: (siteId: string) => [...queryKeys.sites.all, "detail", siteId] as const,
    assets: (siteId: string) => [...queryKeys.sites.detail(siteId), "assets"] as const,
    documents: (siteId: string) => [...queryKeys.sites.detail(siteId), "documents"] as const,
  },
  subsections: {
    all: ["subsections"] as const,
    bySite: (siteId: string) => [...queryKeys.subsections.all, "site", siteId] as const,
    detail: (subsectionId: string) => [...queryKeys.subsections.all, "detail", subsectionId] as const,
  },
  inspections: {
    all: ["inspections"] as const,
    lists: () => [...queryKeys.inspections.all, "list"] as const,
    list: (filters: InspectionListFilters = {}) => [...queryKeys.inspections.lists(), filters] as const,
    detail: (inspectionId: string) => [...queryKeys.inspections.all, "detail", inspectionId] as const,
    templates: () => ["inspection-templates"] as const,
  },
  snags: {
    all: ["snags"] as const,
    bySite: (siteId: string) => [...queryKeys.snags.all, "site", siteId] as const,
    bySubsection: (subsectionId: string) => [...queryKeys.snags.all, "subsection", subsectionId] as const,
  },
  settings: {
    all: ["settings"] as const,
    company: () => [...queryKeys.settings.all, "company"] as const,
  },
  profiles: {
    all: ["profiles"] as const,
    current: () => [...queryKeys.profiles.all, "current"] as const,
    detail: (userId: string) => [...queryKeys.profiles.all, "detail", userId] as const,
  },
  calendar: {
    all: ["calendar-events"] as const,
    range: (fromIso: string, toIso: string) => [...queryKeys.calendar.all, { fromIso, toIso }] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    stats: () => [...queryKeys.dashboard.all, "stats"] as const,
    triage: () => [...queryKeys.dashboard.all, "triage"] as const,
  },
} as const;
