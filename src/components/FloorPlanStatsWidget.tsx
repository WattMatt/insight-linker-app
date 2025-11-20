import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertCircle, TrendingUp, Clock, Users } from "lucide-react";
import { Progress } from "./ui/progress";

interface FloorPlanStats {
  totalPins: number;
  statusBreakdown: {
    open: number;
    in_progress: number;
    finished: number;
    closed: number;
  };
  priorityBreakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  overdueItems: Array<{
    contractor: string;
    count: number;
    items: Array<{
      pin_number: number;
      title: string;
      due_date: string;
      priority: string;
    }>;
  }>;
  recentActivity: Array<{
    pin_number: number;
    title: string;
    change: string;
    timestamp: string;
  }>;
}

interface FloorPlanStatsWidgetProps {
  subsectionId: string;
}

export const FloorPlanStatsWidget = ({ subsectionId }: FloorPlanStatsWidgetProps) => {
  const [stats, setStats] = useState<FloorPlanStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [subsectionId]);

  const loadStats = async () => {
    try {
      setIsLoading(true);

      // Get floor plan for this subsection
      const { data: floorPlan } = await supabase
        .from("subsection_floor_plans")
        .select("id")
        .eq("subsection_id", subsectionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!floorPlan) {
        setStats(null);
        return;
      }

      // Fetch all pins for this floor plan
      const { data: pins } = await supabase
        .from("floor_plan_pins")
        .select("*")
        .eq("floor_plan_id", floorPlan.id)
        .order("updated_at", { ascending: false });

      if (!pins) {
        setStats(null);
        return;
      }

      // Calculate status breakdown
      const statusBreakdown = {
        open: pins.filter(p => p.status === 'open').length,
        in_progress: pins.filter(p => p.status === 'in_progress').length,
        finished: pins.filter(p => p.status === 'finished').length,
        closed: pins.filter(p => p.status === 'closed' || p.status === 'resolved').length,
      };

      // Calculate priority breakdown (snags only)
      const snags = pins.filter(p => p.pin_type === 'snag');
      const priorityBreakdown = {
        critical: snags.filter(s => s.priority === 'critical').length,
        high: snags.filter(s => s.priority === 'high').length,
        medium: snags.filter(s => s.priority === 'medium').length,
        low: snags.filter(s => s.priority === 'low').length,
      };

      // Find overdue items
      const today = new Date();
      const overdueByContractor: Record<string, any[]> = {};
      
      pins.forEach(pin => {
        if (pin.due_date && pin.status !== 'closed' && pin.status !== 'resolved') {
          const dueDate = new Date(pin.due_date);
          if (dueDate < today) {
            const contractor = pin.assigned_contractor || 'Unassigned';
            if (!overdueByContractor[contractor]) {
              overdueByContractor[contractor] = [];
            }
            overdueByContractor[contractor].push({
              pin_number: pin.pin_number,
              title: pin.title || 'Untitled',
              due_date: pin.due_date,
              priority: pin.priority || 'medium',
            });
          }
        }
      });

      const overdueItems = Object.entries(overdueByContractor).map(([contractor, items]) => ({
        contractor,
        count: items.length,
        items: items.slice(0, 5), // Show max 5 per contractor
      }));

      // Extract recent activity from edit history
      const recentActivity: Array<{
        pin_number: number;
        title: string;
        change: string;
        timestamp: string;
      }> = [];

      pins.forEach(pin => {
        if (pin.edit_history && Array.isArray(pin.edit_history)) {
          pin.edit_history.forEach((edit: any) => {
            const changes = [];
            if (edit.changes?.status) {
              changes.push(`Status: ${edit.changes.status.from} → ${edit.changes.status.to}`);
            }
            if (edit.changes?.priority) {
              changes.push(`Priority: ${edit.changes.priority.from} → ${edit.changes.priority.to}`);
            }
            if (edit.changes?.assigned_contractor) {
              changes.push(`Assigned to: ${edit.changes.assigned_contractor.to}`);
            }

            if (changes.length > 0) {
              recentActivity.push({
                pin_number: pin.pin_number,
                title: pin.title || 'Untitled',
                change: changes.join(', '),
                timestamp: edit.timestamp,
              });
            }
          });
        }
      });

      // Sort by most recent
      recentActivity.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setStats({
        totalPins: pins.length,
        statusBreakdown,
        priorityBreakdown,
        overdueItems,
        recentActivity: recentActivity.slice(0, 10), // Show last 10 activities
      });

    } catch (error) {
      console.error("Error loading floor plan stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <AlertCircle className="w-12 h-12 mb-2" />
          <p>No floor plan data available</p>
        </CardContent>
      </Card>
    );
  }

  const completionRate = stats.totalPins > 0 
    ? Math.round((stats.statusBreakdown.closed / stats.totalPins) * 100)
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {/* Overview Stats */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Floor Plan Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary">{stats.totalPins}</div>
              <div className="text-sm text-muted-foreground">Total Items</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600">{stats.statusBreakdown.closed}</div>
              <div className="text-sm text-muted-foreground">Closed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-600">
                {stats.overdueItems.reduce((sum, item) => sum + item.count, 0)}
              </div>
              <div className="text-sm text-muted-foreground">Overdue</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Completion Rate</span>
              <span className="font-semibold">{completionRate}%</span>
            </div>
            <Progress value={completionRate} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                Open
              </span>
              <Badge variant="secondary">{stats.statusBreakdown.open}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                In Progress
              </span>
              <Badge variant="secondary">{stats.statusBreakdown.in_progress}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                Finished
              </span>
              <Badge variant="secondary">{stats.statusBreakdown.finished}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
                Closed
              </span>
              <Badge variant="secondary">{stats.statusBreakdown.closed}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Priority Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Priority (Snags)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm">🔴 Critical</span>
              <Badge variant="destructive">{stats.priorityBreakdown.critical}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">🟠 High</span>
              <Badge className="bg-orange-500">{stats.priorityBreakdown.high}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">🟡 Medium</span>
              <Badge className="bg-yellow-500">{stats.priorityBreakdown.medium}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm">🟢 Low</span>
              <Badge className="bg-green-500">{stats.priorityBreakdown.low}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overdue Items by Contractor */}
      {stats.overdueItems.length > 0 && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-5 h-5 text-orange-500" />
              Overdue Items by Contractor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.overdueItems.map((contractor) => (
                <div key={contractor.contractor} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span className="font-semibold">{contractor.contractor}</span>
                    </div>
                    <Badge variant="destructive">{contractor.count} overdue</Badge>
                  </div>
                  <div className="space-y-1 pl-6">
                    {contractor.items.map((item) => (
                      <div key={item.pin_number} className="text-sm flex items-center justify-between py-1 border-b">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground">#{item.pin_number}</span>
                          <span className="truncate max-w-[200px]">{item.title}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {item.priority}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            Due: {new Date(item.due_date).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity Timeline */}
      {stats.recentActivity.length > 0 && (
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-5 h-5" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.recentActivity.map((activity, idx) => (
                <div key={idx} className="flex gap-3 pb-3 border-b last:border-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-mono">
                    #{activity.pin_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{activity.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{activity.change}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(activity.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};