import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Users, Activity, CheckCircle, AlertTriangle, FileText, Layers, Shield, AlertCircle, Plus, QrCode, FileText as TemplateIcon, BarChart3, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { useNavigate, useSearchParams } from "@/lib/navigation";
import { RecentAssignmentsWidget } from "@/components/RecentAssignmentsWidget";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calculateCocComplianceStats } from "@/lib/complianceCalculations";
import { SitesNeedingAttention } from "@/components/dashboard/SitesNeedingAttention";
import { summarizeSitesForTriage, type SiteDeliverablesInput, type SiteTriageRow } from "@/lib/siteDeliverables";

interface DashboardStats {
  totalClients: number;
  totalSites: number;
  totalSubsections: number;
  totalInspections: number;
  totalSnags: number;
  openSnags: number;
  closedSnags: number;
  cocCompliantCount: number;
  cocRequiredCount: number;
}

interface ActivityLog {
  id: string;
  user_email: string;
  action: string;
  details: string | null;
  created_at: string;
}

interface UpcomingEvent {
  id: string;
  title: string;
  site_name: string;
  start_date: string;
  status: string;
}

interface HighRiskSnag {
  id: string;
  title: string;
  risk_level: string;
  status: string;
  created_at: string;
  updated_at: string;
  subsection_id: string;
  subsections: {
    name: string;
    site_id: string;
    sites: {
      name: string;
      client_id: string;
    };
  };
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    totalSites: 0,
    totalSubsections: 0,
    totalInspections: 0,
    totalSnags: 0,
    openSnags: 0,
    closedSnags: 0,
    cocCompliantCount: 0,
    cocRequiredCount: 0,
  });
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [highRiskSnags, setHighRiskSnags] = useState<HighRiskSnag[]>([]);
  const [loading, setLoading] = useState(true);
  const [triageRows, setTriageRows] = useState<SiteTriageRow[]>([]);
  const [siteClientMap, setSiteClientMap] = useState<Record<string, string>>({});
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "kpis";
  const handleTabChange = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", tab);
      return next;
    });
  };

  useEffect(() => {
    fetchDashboardData();
    fetchTriageData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [
        supabaseClientsRes,
        supabaseSitesRes,
        supabaseSubsectionsRes,
        supabaseInspectionsRes,
        supabaseSnagsRes,
        activityRes,
        eventsRes,
        highRiskSnagsRes
      ] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("sites").select("id", { count: "exact", head: true }),
        supabase.from("subsections").select("id, coc_status, is_coc_required", { count: "exact" }),
        supabase.from("inspections").select("id", { count: "exact" }),
        supabase.from("snags").select("id, status", { count: "exact" }),
        supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("calendar_events").select("*").gte("start_date", today).order("start_date", { ascending: true }).limit(5),
        supabase.from("snags")
          .select(`
            id,
            title,
            risk_level,
            status,
            created_at,
            updated_at,
            subsection_id,
            subsections (
              name,
              site_id,
              sites (
                name,
                client_id
              )
            )
          `)
          .in("risk_level", ["High", "Critical"])
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const totalClients = supabaseClientsRes.count || 0;
      const totalSites = supabaseSitesRes.count || 0;
      const totalSubsections = supabaseSubsectionsRes.count || 0;
      const totalInspections = supabaseInspectionsRes.count || 0;

      const totalSnags = supabaseSnagsRes.count || 0;
      const openSnags = supabaseSnagsRes.data?.filter(s => s.status === 'Open' || s.status === 'In Progress').length || 0;
      const closedSnags = supabaseSnagsRes.data?.filter(s => s.status === 'Closed' || s.status === 'Resolved').length || 0;

      const subsectionsData = supabaseSubsectionsRes.data || [];

      // Use shared utility for COC compliance calculation
      const complianceStats = calculateCocComplianceStats(subsectionsData);

      setStats({
        totalClients,
        totalSites,
        totalSubsections,
        totalInspections,
        totalSnags,
        openSnags,
        closedSnags,
        cocCompliantCount: complianceStats.cocApprovedCount,
        cocRequiredCount: complianceStats.cocRequiredCount,
      });

      setActivities(activityRes.data || []);
      setUpcomingEvents(eventsRes.data || []);
      setHighRiskSnags(highRiskSnagsRes.data || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTriageData = async () => {
    try {
      const [sitesRes, subsRes, snagsRes, inspRes, schematicsRes, assetsRes, docsRes] = await Promise.all([
        supabase.from("sites").select("id, name, client_id"),
        supabase.from("subsections").select("id, site_id, name, coc_status, is_coc_required, metering_status, meter_serial_number"),
        supabase.from("snags").select("id, subsection_id, status, risk_level, title"),
        supabase.from("inspections").select("subsection_id, status, site_id"),
        supabase.from("site_schematics").select("site_id"),
        supabase.from("site_assets").select("site_id"),
        supabase.from("site_documents").select("site_id, category"),
      ]);

      const sites = sitesRes.data || [];
      const subs = subsRes.data || [];
      const snags = snagsRes.data || [];
      const insps = inspRes.data || [];

      // Map subsection -> site for snags (snags are subsection-scoped)
      const subToSite = new Map<string, string>(subs.map((s: any) => [s.id, s.site_id]));
      const schematicSites = new Set((schematicsRes.data || []).map((r: any) => r.site_id));
      const assetSites = new Set((assetsRes.data || []).map((r: any) => r.site_id));

      const group = <T,>(rows: T[], key: (r: T) => string | undefined) => {
        const m = new Map<string, T[]>();
        for (const r of rows) {
          const k = key(r);
          if (!k) continue;
          (m.get(k) ?? m.set(k, []).get(k)!).push(r);
        }
        return m;
      };

      const subsBySite = group(subs, (s: any) => s.site_id);
      const snagsBySite = group(snags, (n: any) => subToSite.get(n.subsection_id));
      const inspBySite = group(insps, (i: any) => i.site_id);
      const docsBySite = group(docsRes.data || [], (d: any) => d.site_id);

      const inputs: SiteDeliverablesInput[] = sites.map((site: any) => ({
        siteId: site.id,
        siteName: site.name,
        subsections: subsBySite.get(site.id) || [],
        snags: snagsBySite.get(site.id) || [],
        inspections: inspBySite.get(site.id) || [],
        hasSchematic: schematicSites.has(site.id),
        assetCount: (assetSites.has(site.id) ? 1 : 0),
        documentCategories: (docsBySite.get(site.id) || []).map((d: any) => d.category),
      }));

      setSiteClientMap(Object.fromEntries(sites.map((s: any) => [s.id, s.client_id])));
      setTriageRows(summarizeSitesForTriage(inputs));
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.error("Error loading triage data:", error);
    }
  };

  const cocComplianceRate = stats.cocRequiredCount > 0
    ? Math.round((stats.cocCompliantCount / stats.cocRequiredCount) * 100)
    : 100;

  const snagResolutionRate = stats.totalSnags > 0
    ? Math.round((stats.closedSnags / stats.totalSnags) * 100)
    : 100;

  // Count of sites with outstanding work — surfaced as a badge on the Outstanding tab
  // so urgency is visible even though the dashboard lands on KPIs by default.
  const outstandingSiteCount = triageRows.filter(r => r.outstandingCount > 0).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your operations and compliance</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={() => navigate("/clients")} className="flex-1 sm:flex-none gap-2">
            <Users className="h-4 w-4" />
            Clients
          </Button>
          <Button onClick={() => navigate("/sites")} variant="outline" className="flex-1 sm:flex-none gap-2">
            <Building2 className="h-4 w-4" />
            Sites
          </Button>
          <Button onClick={() => navigate("/qr-codes")} variant="outline" className="flex-1 sm:flex-none gap-2">
            <QrCode className="h-4 w-4" />
            QR Codes
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap w-full h-auto gap-1 p-1 overflow-visible">
          <TabsTrigger value="kpis" className="gap-2 shrink-0">
            <BarChart3 className="h-4 w-4 shrink-0" />
            KPIs
          </TabsTrigger>
          <TabsTrigger value="outstanding" className="gap-2 shrink-0">
            <ListChecks className="h-4 w-4 shrink-0" />
            Outstanding Items
            {outstandingSiteCount > 0 && (
              <Badge variant="destructive" className="ml-1">{outstandingSiteCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kpis" className="space-y-8 mt-6">
          {/* Primary KPIs */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="glass-card border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sites</CardTitle>
                <div className="p-2 bg-blue-500/10 rounded-full">
                  <Building2 className="h-4 w-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSites}</div>
                <p className="text-xs text-muted-foreground">Under management</p>
              </CardContent>
            </Card>

            <Card className="glass-card border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Subsections</CardTitle>
                <div className="p-2 bg-purple-500/10 rounded-full">
                  <Layers className="h-4 w-4 text-purple-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalSubsections}</div>
                <p className="text-xs text-muted-foreground">Across all sites</p>
              </CardContent>
            </Card>

            <Card className="glass-card border-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                <div className="p-2 bg-green-500/10 rounded-full">
                  <Users className="h-4 w-4 text-green-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalClients}</div>
                <p className="text-xs text-muted-foreground">Active clients</p>
              </CardContent>
            </Card>
          </div>

          {/* Secondary KPIs - Compliance & Snags */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">COC Compliance</CardTitle>
                <Shield className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{cocComplianceRate}%</div>
                <Progress value={cocComplianceRate} className="mt-2 h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {stats.cocCompliantCount} of {stats.cocRequiredCount} compliant
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Snags</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.openSnags}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.closedSnags} resolved of {stats.totalSnags} total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Snag Resolution</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{snagResolutionRate}%</div>
                <Progress value={snagResolutionRate} className="mt-2 h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  Resolution rate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Schedule, activity & assignments */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Upcoming Schedule */}
            <Card>
              <CardHeader>
                <CardTitle>Upcoming Schedule</CardTitle>
                <CardDescription>A summary of the next 5 scheduled events.</CardDescription>
              </CardHeader>
              <CardContent>
                {upcomingEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upcoming events</p>
                ) : (
                  <div className="space-y-3">
                    {upcomingEvents.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 p-3 border rounded-lg">
                        <Activity className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{event.title} at {event.site_name}</p>
                          <p className="text-xs text-muted-foreground">{event.start_date}</p>
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            event.status === "Scheduled" ? "bg-blue-500/10 text-blue-500" :
                              event.status === "In Progress" ? "bg-orange-500/10 text-orange-500" :
                                "bg-green-500/10 text-green-500"
                          }
                        >
                          {event.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>A summary of the latest user and system actions.</CardDescription>
              </CardHeader>
              <CardContent>
                {activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                ) : (
                  <div className="space-y-3">
                    {activities.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-3">
                        <div className="bg-green-100 dark:bg-green-900/50 rounded-full p-2">
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{activity.user_email}</p>
                          <p className="text-sm text-muted-foreground">{activity.action}</p>
                          {activity.details && (
                            <p className="text-xs text-muted-foreground mt-1">{activity.details}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Site Assignments */}
            <RecentAssignmentsWidget />
          </div>
        </TabsContent>

        <TabsContent value="outstanding" className="space-y-6 mt-6">
          <SitesNeedingAttention
            rows={triageRows}
            onSelectSite={(siteId) => {
              const clientId = siteClientMap[siteId];
              navigate(clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`);
            }}
          />

          {/* High-Risk Snags Tracker */}
          <Card className="glass-card border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                High-Risk Snags Tracker
              </CardTitle>
              <CardDescription>
                Critical and high-risk issues requiring immediate attention
              </CardDescription>
            </CardHeader>
            <CardContent>
              {highRiskSnags.length === 0 ? (
                <p className="text-sm text-muted-foreground">No high-risk snags at the moment</p>
              ) : (
                <div className="space-y-3">
                  {highRiskSnags.map((snag) => {
                    const daysSinceLogged = differenceInDays(new Date(), new Date(snag.created_at));
                    const daysSinceCleared = snag.status === 'Closed'
                      ? differenceInDays(new Date(), new Date(snag.updated_at))
                      : null;

                    return (
                      <div
                        key={snag.id}
                        className="flex items-start gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => {
                          const clientId = snag.subsections?.sites?.client_id;
                          const siteId = snag.subsections?.site_id;
                          if (clientId && siteId && snag.subsection_id) {
                            navigate(`/clients/${clientId}/sites/${siteId}/subsections/${snag.subsection_id}`);
                          }
                        }}
                      >
                        <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${snag.risk_level === 'Critical' ? 'text-red-500' : 'text-orange-500'
                          }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <p className="text-sm font-medium">{snag.title}</p>
                            <Badge variant={snag.risk_level === 'Critical' ? 'destructive' : 'default'}>
                              {snag.risk_level} Risk
                            </Badge>
                            <Badge variant={snag.status === 'Open' ? 'destructive' : 'secondary'}>
                              {snag.status}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">
                            {snag.subsections?.name} • {snag.subsections?.sites?.name}
                          </p>
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>
                              Logged: {format(new Date(snag.created_at), 'MMM dd, yyyy')}
                              ({daysSinceLogged} {daysSinceLogged === 1 ? 'day' : 'days'} ago)
                            </span>
                            {snag.status === 'Closed' && daysSinceCleared !== null && (
                              <span className="text-green-600 dark:text-green-400">
                                Cleared: {daysSinceCleared} {daysSinceCleared === 1 ? 'day' : 'days'} ago
                              </span>
                            )}
                            {snag.status === 'Open' && (
                              <span className="text-orange-600 dark:text-orange-400 font-medium">
                                Still open
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Dashboard;
