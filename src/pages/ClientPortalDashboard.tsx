import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, FileText, Calendar, CheckCircle, AlertTriangle, TrendingUp, ArrowRight } from "lucide-react";
import { useClientInfo } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearchParams, Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Info } from "lucide-react";
import { ComplianceHealthWidget } from "@/components/client-portal/ComplianceHealthWidget";
import { SiteOverviewCard } from "@/components/client-portal/SiteOverviewCard";

const ClientPortalDashboard = () => {
  const [searchParams] = useSearchParams();
  const previewClientId = searchParams.get("preview");
  const { data: clientInfo, isLoading: clientLoading } = useClientInfo(previewClientId || undefined);
  
  // Fetch dashboard stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["client-dashboard-stats", clientInfo?.client_id],
    enabled: !!clientInfo?.client_id,
    queryFn: async () => {
      const clientId = clientInfo?.client_id;
      
      const { count: sitesCount } = await supabase
        .from("sites")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);

      const { data: sites } = await supabase
        .from("sites")
        .select("id")
        .eq("client_id", clientId);
      
      const siteIds = sites?.map(s => s.id) || [];
      
      if (siteIds.length === 0) {
        return {
          sites: 0,
          subsections: 0,
          inspections: 0,
          upcoming: 0,
          complianceStats: { approved: 0, pending: 0, failed: 0, missing: 0, notRequired: 0, total: 0 },
          openSnags: 0,
        };
      }
      
      const { count: subsectionsCount } = await supabase
        .from("subsections")
        .select("*", { count: "exact", head: true })
        .in("site_id", siteIds);

      // Get subsections for compliance calculation
      const { data: subsectionsData } = await supabase
        .from("subsections")
        .select("id, is_coc_required, coc_status")
        .in("site_id", siteIds);

      // Calculate compliance stats
      let approved = 0, pending = 0, failed = 0, missing = 0, notRequired = 0;
      (subsectionsData || []).forEach(s => {
        if (!s.is_coc_required) {
          notRequired++;
        } else {
          const status = s.coc_status?.toLowerCase();
          if (status === 'approved' || status === 'valid' || status === 'pass') {
            approved++;
          } else if (status === 'pending' || status === 'review') {
            pending++;
          } else if (status === 'fail' || status === 'failed' || status === 'expired') {
            failed++;
          } else {
            missing++;
          }
        }
      });

      const { count: inspectionsCount } = await supabase
        .from("inspections")
        .select("*", { count: "exact", head: true })
        .in("site_id", siteIds);

      const { count: upcomingCount } = await supabase
        .from("inspections")
        .select("*", { count: "exact", head: true })
        .in("site_id", siteIds)
        .gte("inspection_date", new Date().toISOString().split('T')[0])
        .eq("status", "Scheduled");

      // Get open snags count
      const { data: snagsData } = await supabase
        .from("snags")
        .select("id, status, subsection_id")
        .in("subsection_id", subsectionsData?.map(s => s.id) || []);
      
      const openSnags = (snagsData || []).filter(s => 
        !['Rectified', 'Closed', 'rectified'].includes(s.status)
      ).length;

      return {
        sites: sitesCount || 0,
        subsections: subsectionsCount || 0,
        inspections: inspectionsCount || 0,
        upcoming: upcomingCount || 0,
        complianceStats: { 
          approved, 
          pending, 
          failed, 
          missing, 
          notRequired, 
          total: subsectionsData?.length || 0 
        },
        openSnags,
      };
    },
  });

  // Fetch sites with stats for overview cards
  const { data: sitesWithStats } = useQuery({
    queryKey: ["client-sites-with-stats", clientInfo?.client_id],
    enabled: !!clientInfo?.client_id,
    queryFn: async () => {
      const clientId = clientInfo?.client_id;
      
      const { data: sites, error } = await supabase
        .from("sites")
        .select(`
          id, name, address, site_type, site_image_url,
          subsections (
            id, is_coc_required, coc_status
          )
        `)
        .eq("client_id", clientId)
        .order("name")
        .limit(4);

      if (error) throw error;

      // Get snags for all subsections
      const allSubsectionIds = sites?.flatMap(s => s.subsections?.map(sub => sub.id) || []) || [];
      let snagsMap: Record<string, number> = {};
      
      if (allSubsectionIds.length > 0) {
        const { data: snagsData } = await supabase
          .from("snags")
          .select("subsection_id, status")
          .in("subsection_id", allSubsectionIds);
        
        (snagsData || []).forEach(snag => {
          if (!['Rectified', 'Closed', 'rectified'].includes(snag.status)) {
            snagsMap[snag.subsection_id] = (snagsMap[snag.subsection_id] || 0) + 1;
          }
        });
      }

      // Generate signed URLs for images
      const sitesWithUrls = await Promise.all(
        (sites || []).map(async (site) => {
          let imageUrl = site.site_image_url;
          if (imageUrl) {
            try {
              const urlParts = imageUrl.split('/site-images/');
              if (urlParts.length > 1) {
                const path = urlParts[1].split('?')[0];
                const { data: signedData } = await supabase.storage
                  .from('site-images')
                  .createSignedUrl(path, 3600);
                if (signedData?.signedUrl) {
                  imageUrl = signedData.signedUrl;
                }
              }
            } catch (error) {
              console.error('Error generating signed URL:', error);
            }
          }

          // Calculate stats for each site
          const subs = site.subsections || [];
          let compliantCount = 0, pendingCount = 0, failedCount = 0;
          let totalSnags = 0;
          
          subs.forEach(s => {
            totalSnags += snagsMap[s.id] || 0;
            if (!s.is_coc_required) {
              compliantCount++;
            } else {
              const status = s.coc_status?.toLowerCase();
              if (status === 'approved' || status === 'valid' || status === 'pass') {
                compliantCount++;
              } else if (status === 'pending' || status === 'review') {
                pendingCount++;
              } else {
                failedCount++;
              }
            }
          });

          return {
            ...site,
            site_image_url: imageUrl,
            stats: {
              totalSubsections: subs.length,
              compliantCount,
              pendingCount,
              failedCount,
              openSnags: totalSnags,
            }
          };
        })
      );

      return sitesWithUrls;
    },
  });

  const client = clientInfo?.clients;

  if (clientLoading || statsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const complianceScore = stats?.complianceStats.total 
    ? Math.round(((stats.complianceStats.approved + stats.complianceStats.notRequired) / stats.complianceStats.total) * 100)
    : 0;

  return (
    <div className="space-y-8">
      {previewClientId && (
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Admin Preview Mode:</strong> You are viewing this portal as{" "}
            {client?.company_name || client?.name}. This is exactly what they will see.
          </AlertDescription>
        </Alert>
      )}
      
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          {client?.logo_url && (
            <img 
              src={client.logo_url} 
              alt={client.company_name || client.name}
              className="h-16 w-16 object-contain rounded-lg border"
            />
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              Welcome back
            </h1>
            <p className="text-muted-foreground">
              {client?.company_name || client?.name} • Compliance Overview
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to={`/client-portal/calendar${previewClientId ? `?preview=${previewClientId}` : ''}`}>
              <Calendar className="h-4 w-4 mr-2" />
              Calendar
            </Link>
          </Button>
          <Button asChild>
            <Link to={`/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`}>
              <Building2 className="h-4 w-4 mr-2" />
              View All Sites
            </Link>
          </Button>
        </div>
      </div>

      {/* Main Stats Row */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Compliance Score - Large */}
        <Card className="md:col-span-2 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-6">
              <div className="relative w-24 h-24">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-primary/20"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    strokeDasharray={`${(complianceScore / 100) * 264} 264`}
                    strokeLinecap="round"
                    className="text-primary"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold">{complianceScore}%</span>
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold mb-1">Compliance Score</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Based on {stats?.complianceStats.total || 0} subsections across {stats?.sites || 0} sites
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {stats?.complianceStats.approved || 0} Approved
                  </Badge>
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                    {stats?.complianceStats.pending || 0} Pending
                  </Badge>
                  {(stats?.complianceStats.failed || 0) + (stats?.complianceStats.missing || 0) > 0 && (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {(stats?.complianceStats.failed || 0) + (stats?.complianceStats.missing || 0)} Issues
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sites Count */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.sites || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Under your management
            </p>
          </CardContent>
        </Card>

        {/* Open Snags */}
        <Card className={stats?.openSnags && stats.openSnags > 0 ? "border-red-200 bg-red-50/30" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Snags</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${stats?.openSnags && stats.openSnags > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${stats?.openSnags && stats.openSnags > 0 ? "text-red-600" : ""}`}>
              {stats?.openSnags || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Requiring attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sites Overview */}
      {sitesWithStats && sitesWithStats.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Your Sites</h2>
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`}>
                View all
                <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {sitesWithStats.map(site => (
              <SiteOverviewCard
                key={site.id}
                site={site}
                stats={site.stats}
                linkPrefix={`/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Link 
            to={`/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`}
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Browse Sites</p>
              <p className="text-sm text-muted-foreground">View all your sites</p>
            </div>
          </Link>
          <Link 
            to={`/client-portal/calendar${previewClientId ? `?preview=${previewClientId}` : ''}`}
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Inspection Calendar</p>
              <p className="text-sm text-muted-foreground">{stats?.upcoming || 0} upcoming</p>
            </div>
          </Link>
          <Link 
            to={`/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`}
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">View Documents</p>
              <p className="text-sm text-muted-foreground">Access compliance docs</p>
            </div>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientPortalDashboard;