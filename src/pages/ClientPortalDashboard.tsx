import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileText, Calendar, CheckCircle } from "lucide-react";
import { useClientInfo } from "@/hooks/useUserRole";
import { Skeleton } from "@/components/ui/skeleton";

const ClientPortalDashboard = () => {
  const { data: clientInfo, isLoading: clientLoading } = useClientInfo();
  
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["client-dashboard-stats", clientInfo?.client_id],
    enabled: !!clientInfo?.client_id,
    queryFn: async () => {
      const clientId = clientInfo?.client_id;
      
      // Get sites count
      const { count: sitesCount } = await supabase
        .from("sites")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);

      // Get subsections count
      const { data: sites } = await supabase
        .from("sites")
        .select("id")
        .eq("client_id", clientId);
      
      const siteIds = sites?.map(s => s.id) || [];
      
      const { count: subsectionsCount } = await supabase
        .from("subsections")
        .select("*", { count: "exact", head: true })
        .in("site_id", siteIds);

      // Get inspections count
      const { count: inspectionsCount } = await supabase
        .from("inspections")
        .select("*", { count: "exact", head: true })
        .in("site_id", siteIds);

      // Get upcoming inspections
      const { count: upcomingCount } = await supabase
        .from("inspections")
        .select("*", { count: "exact", head: true })
        .in("site_id", siteIds)
        .gte("inspection_date", new Date().toISOString().split('T')[0])
        .eq("status", "Scheduled");

      return {
        sites: sitesCount || 0,
        subsections: subsectionsCount || 0,
        inspections: inspectionsCount || 0,
        upcoming: upcomingCount || 0,
      };
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

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            {client?.logo_url && (
              <img 
                src={client.logo_url} 
                alt={client.company_name || client.name}
                className="h-16 w-16 object-contain rounded-lg"
              />
            )}
            <div>
              <CardTitle className="text-2xl">
                Welcome to {client?.company_name || client?.name}
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                View your sites, inspections, and compliance status
              </p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.sites || 0}</div>
            <p className="text-xs text-muted-foreground">
              Active sites under management
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subsections</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.subsections || 0}</div>
            <p className="text-xs text-muted-foreground">
              Total subsections across all sites
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inspections</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.inspections || 0}</div>
            <p className="text-xs text-muted-foreground">
              Completed and scheduled inspections
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.upcoming || 0}</div>
            <p className="text-xs text-muted-foreground">
              Scheduled inspections
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Access</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <a 
            href="/client-portal/sites"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <Building2 className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium">View Sites</p>
              <p className="text-sm text-muted-foreground">Browse all your sites</p>
            </div>
          </a>
          <a 
            href="/client-portal/calendar"
            className="flex items-center gap-3 p-4 rounded-lg border hover:bg-accent transition-colors"
          >
            <Calendar className="h-8 w-8 text-primary" />
            <div>
              <p className="font-medium">Inspection Calendar</p>
              <p className="text-sm text-muted-foreground">View scheduled inspections</p>
            </div>
          </a>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClientPortalDashboard;
