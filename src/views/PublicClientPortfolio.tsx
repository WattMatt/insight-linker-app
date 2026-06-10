import { useEffect, useState } from "react";
import { useParams, Link } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { VisitorRegistrationGate, getVisitorSession } from "@/components/VisitorRegistrationGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  MapPin,
  Search,
  AlertTriangle,
  FileText,
  ChevronRight,
  Loader2,
  XCircle,
  BarChart3,
} from "lucide-react";

interface SiteWithStats {
  id: string;
  name: string;
  address?: string;
  site_type?: string;
  site_image_url?: string;
  totalSubsections: number;
  failedCount: number;
  openSnags: number;
}

interface ClientInfo {
  id: string;
  name: string;
  company_name?: string;
  logo_url?: string;
}

const PublicClientPortfolio = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [sites, setSites] = useState<SiteWithStats[]>([]);
  const [companySettings, setCompanySettings] = useState<{ company_name?: string; company_logo_url?: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [linkId, setLinkId] = useState<string | null>(null);
  const [visitorRegistered, setVisitorRegistered] = useState(false);

  useEffect(() => {
    if (token) {
      // Sign out any stale session so anonymous RPC calls work cleanly
      // Catch errors gracefully — signOut can fail on custom domains due to auth-bridge mismatch
      supabase.auth.signOut({ scope: 'local' }).catch(() => {}).finally(() => fetchData());
    }
  }, [token]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Add a timeout so the page never hangs indefinitely
      const timeoutMs = 15000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Validate the access token
      const { data: linkResult, error: linkError } = await supabase
        .rpc("validate_access_link", { token });

      clearTimeout(timeoutId);

      console.log('[Portfolio] Token validation result:', { linkResult, linkError, token });

      if (linkError) {
        console.error('[Portfolio] RPC error:', linkError);
        setError("Unable to validate this link. Please try again.");
        return;
      }

      if (!linkResult || !Array.isArray(linkResult) || linkResult.length === 0) {
        setError("This link is invalid or has expired");
        return;
      }

      if (!linkResult[0].is_valid) {
        setError("This link has expired or been deactivated");
        return;
      }

      const link = linkResult[0];
      setLinkId(link.link_id);

      // Check if visitor already registered in this session
      if (getVisitorSession(link.link_id)) {
        setVisitorRegistered(true);
      }

      if (link.link_type !== "client" || !link.client_id) {
        setError("This link is not a client portfolio link");
        return;
      }

      // Fetch the scoped portfolio payload (settings + client + sites with stats)
      const { data: portfolio, error: portfolioError } = await supabase
        .rpc("get_public_portfolio", { p_token: token });

      if (portfolioError || !portfolio) {
        setError("Unable to load client data");
        return;
      }

      const payload = portfolio as any;

      if (payload.settings) setCompanySettings(payload.settings);
      setClient(payload.client);

      const sitesData: any[] = payload.sites || [];
      if (sitesData.length === 0) {
        setSites([]);
        return;
      }

      // Generate signed URLs for site images
      const sitesWithSignedUrls = await Promise.all(
        sitesData.map(async (site) => {
          if (site.site_image_url) {
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
            } catch {}
          }
          return site;
        })
      );

      // Map the RPC stats into the view's state shape
      const enriched: SiteWithStats[] = sitesWithSignedUrls.map((site) => ({
        id: site.id,
        name: site.name,
        address: site.address,
        site_type: site.site_type,
        site_image_url: site.site_image_url,
        totalSubsections: site.total_subsections ?? 0,
        failedCount: 0,
        openSnags: site.open_snags ?? 0,
      }));

      setSites(enriched);
    } catch (err) {
      console.error("Error loading portfolio:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading portfolio...</p>
        </div>
      </div>
    );
  }

  // Show visitor registration gate before content
  if (!visitorRegistered && linkId && !error) {
    return (
      <VisitorRegistrationGate
        accessLinkId={linkId}
        companyLogoUrl={companySettings?.company_logo_url}
        companyName={companySettings?.company_name}
        onRegistered={() => setVisitorRegistered(true)}
      />
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <XCircle className="h-12 w-12 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Portfolio-wide stats
  const totalSubs = sites.reduce((a, s) => a + s.totalSubsections, 0);
  const totalSnags = sites.reduce((a, s) => a + s.openSnags, 0);

  const filteredSites = sites.filter((site) => {
    const q = searchQuery.toLowerCase();
    return (
      site.name.toLowerCase().includes(q) ||
      site.address?.toLowerCase().includes(q) ||
      site.site_type?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            {client?.logo_url ? (
              <img
                src={client.logo_url}
                alt="Client Logo"
                className="h-14 w-14 object-contain rounded-lg border bg-white p-1"
              />
            ) : companySettings?.company_logo_url ? (
              <img
                src={companySettings.company_logo_url}
                alt="Company Logo"
                className="h-14 w-14 object-contain rounded-lg border bg-white p-1"
              />
            ) : (
              <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">
                {client?.company_name || client?.name}
              </h1>
              <p className="text-muted-foreground">
                Portfolio Overview — {sites.length} site{sites.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <Building2 className="h-6 w-6 mx-auto text-primary mb-1" />
              <p className="text-2xl font-bold">{sites.length}</p>
              <p className="text-xs text-muted-foreground">Total Sites</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <FileText className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
              <p className="text-2xl font-bold">{totalSubs}</p>
              <p className="text-xs text-muted-foreground">Subsections</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5 pb-4 text-center">
              <AlertTriangle className="h-6 w-6 mx-auto text-red-600 mb-1" />
              <p className="text-2xl font-bold text-red-600">{totalSnags}</p>
              <p className="text-xs text-muted-foreground">Open Snags</p>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sites by name, address, or type..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Sites Grid */}
        {filteredSites.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">
                {searchQuery ? "No sites match your search" : "No sites found"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {filteredSites.map((site) => {
              return (
                <Link key={site.id} to={`/portfolio/${token}/site/${site.id}`}>
                  <Card className="h-full hover:shadow-lg transition-all duration-200 hover:border-primary/50 cursor-pointer group">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                          {site.site_image_url ? (
                            <img
                              src={site.site_image_url}
                              alt={site.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Building2 className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <CardTitle className="text-lg group-hover:text-primary transition-colors truncate">
                                {site.name}
                              </CardTitle>
                              {site.address && (
                                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1 truncate">
                                  <MapPin className="h-3 w-3 flex-shrink-0" />
                                  {site.address}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                          </div>
                          {site.site_type && (
                            <Badge variant="outline" className="mt-2 text-xs">
                              {site.site_type}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="p-1.5 rounded bg-muted">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">{site.totalSubsections}</p>
                            <p className="text-xs text-muted-foreground">Subsections</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <div className="p-1.5 rounded bg-red-100">
                            <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                          </div>
                          <div>
                            <p className="font-medium text-red-600">{site.openSnags}</p>
                            <p className="text-xs text-muted-foreground">Open Snags</p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground text-center group-hover:text-primary transition-colors">
                          Click to view details →
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground pt-4 border-t">
          <p>
            Powered by {companySettings?.company_name || "WM Compliance"} • This is a read-only view
          </p>
        </div>
      </div>
    </div>
  );
};

export default PublicClientPortfolio;
