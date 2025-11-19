import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Users, ClipboardCheck, Activity, CheckCircle, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow, format, differenceInDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import { VerificationDashboardWidget } from "@/components/VerificationDashboardWidget";
import { RecentAssignmentsWidget } from "@/components/RecentAssignmentsWidget";

interface DashboardStats {
  totalClients: number;
  totalSites: number;
  totalInspections: number;
  activeInspections: number;
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
    totalInspections: 0,
    activeInspections: 0,
  });
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [highRiskSnags, setHighRiskSnags] = useState<HighRiskSnag[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch from Supabase only
      const [supabaseClientsRes, supabaseSitesRes, supabaseInspectionsRes, activityRes, eventsRes, highRiskSnagsRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("sites").select("id", { count: "exact", head: true }),
        supabase.from("inspections").select("id, status", { count: "exact" }),
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
      const totalInspections = supabaseInspectionsRes.count || 0;
      
      const activeInspections = supabaseInspectionsRes.data?.filter(
        (i) => i.status === "In Progress" || i.status === "Scheduled"
      ).length || 0;

      setStats({
        totalClients,
        totalSites,
        totalInspections,
        activeInspections,
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

  const kpiCards = [
    {
      title: "Total Sites Under Management",
      value: stats.totalSites,
      icon: Building2,
      color: "text-blue-500",
    },
    {
      title: "Total Clients",
      value: stats.totalClients,
      icon: Users,
      color: "text-purple-500",
    },
    {
      title: "Active Inspections",
      value: stats.activeInspections,
      icon: Activity,
      color: "text-orange-500",
    },
  ];

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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* High-Risk Snags Tracker */}
        <Card className="md:col-span-2">
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
                      <AlertTriangle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
                        snag.risk_level === 'Critical' ? 'text-red-500' : 'text-orange-500'
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

        {/* Verification Feedback Widget */}
        <VerificationDashboardWidget />
      </div>
    </div>
  );
};

export default Dashboard;
