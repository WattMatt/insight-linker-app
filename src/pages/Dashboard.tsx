import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, ClipboardCheck, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DashboardStats {
  totalClients: number;
  totalSites: number;
  totalInspections: number;
  pendingInspections: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    totalSites: 0,
    totalInspections: 0,
    pendingInspections: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [clientsRes, sitesRes, inspectionsRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("sites").select("id", { count: "exact", head: true }),
        supabase.from("inspections").select("id, status", { count: "exact" }),
      ]);

      const pendingCount = inspectionsRes.data?.filter(
        (i) => i.status === "Pending"
      ).length || 0;

      setStats({
        totalClients: clientsRes.count || 0,
        totalSites: sitesRes.count || 0,
        totalInspections: inspectionsRes.count || 0,
        pendingInspections: pendingCount,
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const kpiCards = [
    {
      title: "Total Clients",
      value: stats.totalClients,
      icon: Users,
      color: "text-blue-500",
    },
    {
      title: "Total Sites",
      value: stats.totalSites,
      icon: Building2,
      color: "text-purple-500",
    },
    {
      title: "Total Inspections",
      value: stats.totalInspections,
      icon: ClipboardCheck,
      color: "text-green-500",
    },
    {
      title: "Pending Inspections",
      value: stats.pendingInspections,
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
        <p className="text-muted-foreground mt-2">
          Overview of your electrical inspection operations
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <a
              href="/clients"
              className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent transition-colors"
            >
              <Users className="h-8 w-8 mb-2 text-primary" />
              <span className="font-medium">Manage Clients</span>
            </a>
            <a
              href="/sites"
              className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent transition-colors"
            >
              <Building2 className="h-8 w-8 mb-2 text-primary" />
              <span className="font-medium">Manage Sites</span>
            </a>
            <a
              href="/inspections"
              className="flex flex-col items-center justify-center p-6 border rounded-lg hover:bg-accent transition-colors"
            >
              <ClipboardCheck className="h-8 w-8 mb-2 text-primary" />
              <span className="font-medium">View Inspections</span>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="bg-green-100 dark:bg-green-900/50 rounded-full p-2">
                <Activity className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">System Initialized</p>
                <p className="text-sm text-muted-foreground">
                  Welcome to SiteWise Inspector! Start by adding your first client.
                </p>
                <Badge variant="secondary" className="mt-1">
                  Just now
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
