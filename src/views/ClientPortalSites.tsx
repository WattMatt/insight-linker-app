import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, MapPin, Eye, Search, Briefcase } from "lucide-react";
import { useClientInfo } from "@/hooks/useUserRole";
import { useClientSites, type ClientSite } from "@/hooks/useClientSites";
import { useSiteScores } from "@/hooks/useSiteScores";
import { SiteHealthBadge } from "@/components/SiteHealthBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useSearchParams } from "@/lib/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const UNSECTORED = "Other";
const UNASSIGNED = "No managing agency";

/** sector → agency → sites; sectors by portfolio share, agencies A→Z. */
const groupSites = (sites: ClientSite[]) => {
  const sectors = new Map<string, Map<string, ClientSite[]>>();
  for (const site of sites) {
    const sector = site.site_type?.trim() || UNSECTORED;
    const agency = site.managing_agencies?.name || UNASSIGNED;
    if (!sectors.has(sector)) sectors.set(sector, new Map());
    const agencies = sectors.get(sector)!;
    if (!agencies.has(agency)) agencies.set(agency, []);
    agencies.get(agency)!.push(site);
  }
  const sectorCount = (agencies: Map<string, ClientSite[]>) =>
    [...agencies.values()].reduce((sum, list) => sum + list.length, 0);
  return [...sectors.entries()]
    .sort((a, b) => sectorCount(b[1]) - sectorCount(a[1]) || a[0].localeCompare(b[0]))
    .map(([sector, agencies]) => ({
      sector,
      count: sectorCount(agencies),
      agencies: [...agencies.entries()]
        .sort((a, b) =>
          a[0] === UNASSIGNED ? 1 : b[0] === UNASSIGNED ? -1 : a[0].localeCompare(b[0]),
        )
        .map(([agency, list]) => ({ agency, sites: list })),
    }));
};

const ClientPortalSites = () => {
  const [searchParams] = useSearchParams();
  const previewClientId = searchParams.get("preview");
  const { data: clientInfo } = useClientInfo(previewClientId || undefined);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: sites, isLoading } = useClientSites(clientInfo, { withSignedImages: true });
  const { data: siteScores, isLoading: scoresLoading } = useSiteScores(sites?.map(s => s.id));

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  const filteredSites = sites?.filter(site => {
    const searchLower = searchQuery.toLowerCase();
    return (
      site.name.toLowerCase().includes(searchLower) ||
      site.address?.toLowerCase().includes(searchLower) ||
      site.site_type?.toLowerCase().includes(searchLower) ||
      site.managing_agencies?.name.toLowerCase().includes(searchLower)
    );
  });

  // The grouped layout exists for agency-managed portfolios (sector, then
  // managing agency). Portfolios without agencies keep the flat grid.
  const hasAgencies = (sites ?? []).some(site => site.managing_agency_id);
  const grouped = hasAgencies ? groupSites(filteredSites ?? []) : null;

  const renderSiteCard = (site: ClientSite) => (
    <Card key={site.id} className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {site.site_image_url ? (
              <img
                src={site.site_image_url}
                alt={site.name}
                className="h-12 w-12 object-cover rounded-lg"
              />
            ) : (
              <div className="h-12 w-12 bg-primary/10 rounded-lg flex items-center justify-center">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
            )}
            <div>
              <CardTitle className="text-xl">{site.name}</CardTitle>
              {site.site_type && (
                <p className="text-sm text-muted-foreground">{site.site_type}</p>
              )}
            </div>
          </div>
          <SiteHealthBadge score={siteScores?.get(site.id)} isLoading={scoresLoading} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {site.address && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" />
            <span>{site.address}</span>
          </div>
        )}

        <Link to={`/client-portal/sites/${site.id}${previewClientId ? `?preview=${previewClientId}` : ''}`}>
          <Button className="w-full gap-2">
            <Eye className="h-4 w-4" />
            View Site Details
          </Button>
        </Link>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {previewClientId && (
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Admin Preview Mode:</strong> Viewing sites for{" "}
            {clientInfo?.clients?.company_name || clientInfo?.clients?.name}
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h1 className="text-3xl font-bold">Your Sites</h1>
        <p className="text-muted-foreground mt-2">
          {clientInfo?.managing_agency_name
            ? `Sites under your management via ${clientInfo.managing_agency_name}`
            : "View and access all sites under your management"}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search sites by name, address, type, or agency..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredSites && filteredSites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">
              {searchQuery ? "No sites match your search" : "No sites found"}
            </p>
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "Try adjusting your search terms"
                : "There are no sites associated with your account yet."}
            </p>
          </CardContent>
        </Card>
      ) : grouped ? (
        <div className="space-y-10">
          {grouped.map(({ sector, count, agencies }) => (
            <section key={sector} className="space-y-6">
              <div className="flex items-center gap-3 border-b pb-2">
                <h2 className="text-2xl font-semibold">{sector}</h2>
                <Badge variant="secondary">{count} {count === 1 ? "site" : "sites"}</Badge>
              </div>
              {agencies.map(({ agency, sites: agencySites }) => (
                <div key={agency} className="space-y-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Briefcase className="h-4 w-4" />
                    <h3 className="text-sm font-medium uppercase tracking-wide">
                      {agency}
                    </h3>
                    <Badge variant="outline">{agencySites.length}</Badge>
                  </div>
                  <div className="grid gap-6 md:grid-cols-2">
                    {agencySites.map(renderSiteCard)}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filteredSites?.map(renderSiteCard)}
        </div>
      )}
    </div>
  );
};

export default ClientPortalSites;
