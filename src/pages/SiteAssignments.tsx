import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Users, Building2, History, UserPlus, UserMinus } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Contractor {
  id: string;
  email: string;
  full_name: string | null;
}

interface Site {
  id: string;
  name: string;
  address: string | null;
  client_id: string;
  clients: {
    name: string;
    company_name: string | null;
  };
}

interface Assignment {
  id: string;
  user_id: string;
  site_id: string;
  sites: Site;
  profiles: {
    email: string;
    full_name: string | null;
  };
}

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

const SiteAssignments = () => {
  const [selectedContractor, setSelectedContractor] = useState<string>("");
  const [selectedSite, setSelectedSite] = useState<string>("");
  const queryClient = useQueryClient();

  // Fetch all contractors
  const { data: contractors, isLoading: loadingContractors } = useQuery({
    queryKey: ["contractors"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "Contractor");

      if (rolesError) throw rolesError;

      if (!roles || roles.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", roles.map(r => r.user_id));

      if (profilesError) throw profilesError;
      return profiles as Contractor[];
    },
  });

  // Fetch all sites
  const { data: sites, isLoading: loadingSites } = useQuery({
    queryKey: ["all-sites"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, name, address, client_id, clients(name, company_name)")
        .order("name");

      if (error) throw error;
      return data as Site[];
    },
  });

  // Fetch all assignments
  const { data: assignments, isLoading: loadingAssignments } = useQuery({
    queryKey: ["site-assignments"],
    queryFn: async () => {
      const { data: userSites, error } = await supabase
        .from("user_sites")
        .select(`
          id,
          user_id,
          site_id,
          sites(id, name, address, client_id, clients(name, company_name))
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!userSites) return [];

      // Fetch profiles separately
      const userIds = [...new Set(userSites.map(us => us.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      // Combine the data
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return userSites.map(us => ({
        ...us,
        profiles: profileMap.get(us.user_id) || { email: "", full_name: null },
      })) as Assignment[];
    },
  });

  // Fetch assignment history
  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ["site-assignment-history"],
    queryFn: async () => {
      const { data: historyData, error } = await supabase
        .from("user_sites_history")
        .select("*")
        .order("performed_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!historyData || historyData.length === 0) return [];

      // Fetch all unique user IDs, site IDs, and performer IDs
      const userIds = [...new Set(historyData.map(h => h.user_id))];
      const siteIds = [...new Set(historyData.map(h => h.site_id))];
      const performerIds = [...new Set(historyData.map(h => h.performed_by).filter(Boolean))];

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", [...userIds, ...performerIds]);

      // Fetch sites
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

  // Add assignment mutation
  const addAssignment = useMutation({
    mutationFn: async ({ contractorId, siteId }: { contractorId: string; siteId: string }) => {
      const { error } = await supabase
        .from("user_sites")
        .insert({ user_id: contractorId, site_id: siteId });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-assignments"] });
      toast.success("Contractor assigned to site successfully");
      setSelectedContractor("");
      setSelectedSite("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to assign contractor");
    },
  });

  // Remove assignment mutation
  const removeAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("user_sites")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-assignments"] });
      toast.success("Contractor access removed successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to remove access");
    },
  });

  const handleAddAssignment = () => {
    if (!selectedContractor || !selectedSite) {
      toast.error("Please select both a contractor and a site");
      return;
    }

    // Check if assignment already exists
    const exists = assignments?.some(
      a => a.user_id === selectedContractor && a.site_id === selectedSite
    );

    if (exists) {
      toast.error("This contractor is already assigned to this site");
      return;
    }

    addAssignment.mutate({ contractorId: selectedContractor, siteId: selectedSite });
  };

  const isLoading = loadingContractors || loadingSites || loadingAssignments || loadingHistory;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Group assignments by contractor
  const assignmentsByContractor = assignments?.reduce((acc, assignment) => {
    const contractorId = assignment.user_id;
    if (!acc[contractorId]) {
      acc[contractorId] = {
        contractor: assignment.profiles,
        sites: [],
      };
    }
    acc[contractorId].sites.push({
      assignmentId: assignment.id,
      site: assignment.sites,
    });
    return acc;
  }, {} as Record<string, { contractor: { email: string; full_name: string | null }; sites: { assignmentId: string; site: Site }[] }>);

  return (
    <div className="container mx-auto space-y-8">

      <Alert>
        <Users className="h-4 w-4" />
        <AlertDescription>
          Contractors can only access sites they are explicitly assigned to. Use this interface to manage their access.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Assign Contractor to Site</CardTitle>
          <CardDescription>
            Select a contractor and a site to grant access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Select value={selectedContractor} onValueChange={setSelectedContractor}>
              <SelectTrigger>
                <SelectValue placeholder="Select contractor" />
              </SelectTrigger>
              <SelectContent>
                {contractors?.map((contractor) => (
                  <SelectItem key={contractor.id} value={contractor.id}>
                    {contractor.full_name || contractor.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSite} onValueChange={setSelectedSite}>
              <SelectTrigger>
                <SelectValue placeholder="Select site" />
              </SelectTrigger>
              <SelectContent>
                {sites?.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name} ({site.clients.company_name || site.clients.name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              onClick={handleAddAssignment} 
              disabled={addAssignment.isPending}
              className="w-full"
            >
              {addAssignment.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Assign Access
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Current Assignments</h2>
        
        {!assignmentsByContractor || Object.keys(assignmentsByContractor).length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No site assignments yet</p>
              <p className="text-sm text-muted-foreground">Start by assigning contractors to sites above</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {Object.entries(assignmentsByContractor).map(([contractorId, data]) => (
              <Card key={contractorId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {data.contractor.full_name || data.contractor.email}
                  </CardTitle>
                  <CardDescription>
                    {data.contractor.email}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium mb-3">
                      Assigned Sites ({data.sites.length})
                    </p>
                    <div className="grid gap-2">
                      {data.sites.map(({ assignmentId, site }) => (
                        <div
                          key={assignmentId}
                          className="flex items-center justify-between p-3 border rounded-lg bg-card"
                        >
                          <div className="flex-1">
                            <p className="font-medium">{site.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {site.clients.company_name || site.clients.name}
                              {site.address && ` • ${site.address}`}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeAssignment.mutate(assignmentId)}
                            disabled={removeAssignment.isPending}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            {removeAssignment.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <History className="h-5 w-5" />
          Assignment History
        </h2>
        
        {!history || history.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <History className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No assignment history yet</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-3">
                {history.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 p-4 border rounded-lg bg-card hover:bg-accent/5 transition-colors"
                  >
                    <div className={`mt-1 ${entry.action === 'assigned' ? 'text-green-500' : 'text-destructive'}`}>
                      {entry.action === 'assigned' ? (
                        <UserPlus className="h-5 w-5" />
                      ) : (
                        <UserMinus className="h-5 w-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">
                            {entry.user_profile?.full_name || entry.user_profile?.email || 'Unknown User'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {entry.action === 'assigned' ? 'assigned to' : 'removed from'}{' '}
                            <span className="font-medium text-foreground">
                              {entry.site_info?.name || 'Unknown Site'}
                            </span>
                            {entry.site_info?.clients && (
                              <span className="text-muted-foreground">
                                {' '}• {entry.site_info.clients.company_name || entry.site_info.clients.name}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            By {entry.performer_profile?.full_name || entry.performer_profile?.email || 'System'}{' '}
                            • {new Date(entry.performed_at).toLocaleString()}
                          </p>
                        </div>
                        <Badge variant={entry.action === 'assigned' ? 'default' : 'secondary'}>
                          {entry.action}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default SiteAssignments;
