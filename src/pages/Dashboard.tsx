import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Building2, Users, ClipboardCheck, Activity, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

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

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    totalSites: 0,
    totalInspections: 0,
    activeInspections: 0,
  });
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch from Supabase only
      const [supabaseClientsRes, supabaseSitesRes, supabaseInspectionsRes, activityRes, eventsRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("sites").select("id", { count: "exact", head: true }),
        supabase.from("inspections").select("id, status", { count: "exact" }),
        supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(5),
        supabase.from("calendar_events").select("*").gte("start_date", today).order("start_date", { ascending: true }).limit(5),
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
      </div>
    </div>
  );
};

export default Dashboard;
