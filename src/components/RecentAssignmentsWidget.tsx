import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, UserMinus, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "@/lib/navigation";

interface HistoryEntry {
  id: string;
  user_id: string;
  site_id: string;
  action: 'assigned' | 'removed';
  performed_by: string | null;
  performed_at: string;
  user_profile: {
    email: string;
    full_name: string | null;
  } | null;
  site_info: {
    name: string;
    clients: {
      name: string;
      company_name: string | null;
    };
  } | null;
  performer_profile: {
    email: string;
    full_name: string | null;
  } | null;
}

export const RecentAssignmentsWidget = () => {
  const navigate = useNavigate();

  const { data: history, isLoading } = useQuery({
    queryKey: ["recent-site-assignments"],
    queryFn: async () => {
      const { data: historyData, error } = await supabase
        .from("user_sites_history")
        .select("*")
        .order("performed_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      if (!historyData || historyData.length === 0) return [];

      const userIds = [...new Set(historyData.map(h => h.user_id))];
      const siteIds = [...new Set(historyData.map(h => h.site_id))];
      const performerIds = [...new Set(historyData.map(h => h.performed_by).filter(Boolean))];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", [...userIds, ...performerIds]);

      const { data: sites } = await supabase
        .from("sites")
        .select("id, name, client_id, clients(name, company_name)")
        .in("id", siteIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      const siteMap = new Map(sites?.map(s => [s.id, s]) || []);

      return historyData.map(h => ({
        ...h,
        user_profile: profileMap.get(h.user_id) || null,
        site_info: siteMap.get(h.site_id) || null,
        performer_profile: h.performed_by ? profileMap.get(h.performed_by) || null : null,
      })) as HistoryEntry[];
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Recent Site Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Recent Site Assignments
        </CardTitle>
        <CardDescription>
          Latest contractor access changes
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!history || history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent assignments</p>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                onClick={() => navigate('/site-assignments')}
              >
                <div className={`mt-0.5 ${entry.action === 'assigned' ? 'text-green-500' : 'text-destructive'}`}>
                  {entry.action === 'assigned' ? (
                    <UserPlus className="h-4 w-4" />
                  ) : (
                    <UserMinus className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-medium truncate">
                      {entry.user_profile?.full_name || entry.user_profile?.email || 'Unknown User'}
                    </p>
                    <Badge variant={entry.action === 'assigned' ? 'default' : 'secondary'} className="text-xs">
                      {entry.action}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {entry.site_info?.name || 'Unknown Site'}
                    {entry.site_info?.clients && (
                      <span> • {entry.site_info.clients.company_name || entry.site_info.clients.name}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(entry.performed_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
