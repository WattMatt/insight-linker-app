import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SiteWithContractors {
  site_id: string;
  site_name: string;
  client_name: string;
  client_company: string | null;
  contractors: Array<{
    id: string;
    name: string;
    email: string;
  }>;
}

export const RecentAssignmentsWidget = () => {
  const navigate = useNavigate();

  const { data: sitesData, isLoading } = useQuery({
    queryKey: ["sites-with-contractors"],
    queryFn: async () => {
      // Fetch all user_sites assignments
      const { data: assignments, error: assignmentsError } = await supabase
        .from("user_sites")
        .select("user_id, site_id");

      if (assignmentsError) throw assignmentsError;
      if (!assignments || assignments.length === 0) return [];

      // Get unique site IDs and user IDs
      const siteIds = [...new Set(assignments.map(a => a.site_id))];
      const userIds = [...new Set(assignments.map(a => a.user_id))];

      // Fetch sites with client info
      const { data: sites, error: sitesError } = await supabase
        .from("sites")
        .select("id, name, client_id, clients(name, company_name)")
        .in("id", siteIds);

      if (sitesError) throw sitesError;

      // Fetch contractor profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      // Create maps for easy lookup
      const siteMap = new Map(sites?.map(s => [s.id, s]) || []);
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Group contractors by site
      const siteContractorsMap = new Map<string, Set<string>>();
      assignments.forEach(a => {
        if (!siteContractorsMap.has(a.site_id)) {
          siteContractorsMap.set(a.site_id, new Set());
        }
        siteContractorsMap.get(a.site_id)?.add(a.user_id);
      });

      // Build result array
      const result: SiteWithContractors[] = [];
      siteContractorsMap.forEach((contractorIds, siteId) => {
        const site = siteMap.get(siteId);
        if (site) {
          const contractors = Array.from(contractorIds)
            .map(userId => {
              const profile = profileMap.get(userId);
              return profile ? {
                id: userId,
                name: profile.full_name || profile.email,
                email: profile.email
              } : null;
            })
            .filter(Boolean) as Array<{ id: string; name: string; email: string }>;

          result.push({
            site_id: siteId,
            site_name: site.name,
            client_name: site.clients?.name || 'Unknown Client',
            client_company: site.clients?.company_name || null,
            contractors
          });
        }
      });

      // Sort by site name
      return result.sort((a, b) => a.site_name.localeCompare(b.site_name));
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
