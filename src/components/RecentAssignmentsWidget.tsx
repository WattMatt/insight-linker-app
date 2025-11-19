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
            <Building2 className="h-5 w-5" />
            Shared Sites & Contractors
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
          <Building2 className="h-5 w-5" />
          Shared Sites & Contractors
        </CardTitle>
        <CardDescription>
          Sites shared with contractors ({sitesData?.length || 0} total)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!sitesData || sitesData.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sites shared with contractors yet</p>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {sitesData.map((site) => (
                <div
                  key={site.site_id}
                  className="border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => navigate('/site-assignments')}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm mb-1 truncate">{site.site_name}</h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {site.client_company || site.client_name}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      <Users className="h-3 w-3 mr-1" />
                      {site.contractors.length}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Contractors:</p>
                    <div className="flex flex-wrap gap-1">
                      {site.contractors.map((contractor) => (
                        <Badge 
                          key={contractor.id} 
                          variant="outline" 
                          className="text-xs"
                        >
                          {contractor.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};
