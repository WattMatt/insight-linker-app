import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Users, Building2, History, UserPlus, UserMinus, Briefcase } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface User {
  id: string;
  email: string;
  full_name: string | null;
}

interface Client {
  id: string;
  name: string;
  company_name: string | null;
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
  const [selectedClientUser, setSelectedClientUser] = useState<string>("");
  const [selectedClientOrg, setSelectedClientOrg] = useState<string>("");
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
      return profiles as User[];
    },
  });

  // Fetch all client users
  const { data: clientUsers, isLoading: loadingClientUsers } = useQuery({
    queryKey: ["client-users"],
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "Client");

      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", roles.map(r => r.user_id));

      if (profilesError) throw profilesError;
      return profiles as User[];
    },
  });

  // Fetch all client organizations
  const { data: clientOrgs, isLoading: loadingClientOrgs } = useQuery({
    queryKey: ["client-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, company_name")
        .order("name");

      if (error) throw error;
      return data as Client[];
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
    queryKey: ["site-assignments-flat"],
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

  // Fetch client assignments
  const { data: clientAssignments, isLoading: loadingClientAssignments } = useQuery({
    queryKey: ["client-assignments"],
    queryFn: async () => {
      const { data: userClients, error } = await supabase
        .from("user_clients")
        .select(`
          id,
          user_id,
          client_id,
          clients(id, name, company_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!userClients) return [];

      const userIds = [...new Set(userClients.map(uc => uc.user_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
      
      return userClients.map(uc => ({
        ...uc,
        profiles: profileMap.get(uc.user_id) || { email: "", full_name: null },
      }));
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

  // Add client assignment mutation
  const addClientAssignment = useMutation({
    mutationFn: async ({ userId, clientId }: { userId: string; clientId: string }) => {
      const { error } = await supabase
        .from("user_clients")
        .insert({ user_id: userId, client_id: clientId });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-assignments"] });
      toast.success("Client user assigned to organization successfully");
      setSelectedClientUser("");
      setSelectedClientOrg("");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to assign client user");
    },
  });

  // Remove client assignment mutation
  const removeClientAssignment = useMutation({
    mutationFn: async (assignmentId: string) => {
      const { error } = await supabase
        .from("user_clients")
        .delete()
        .eq("id", assignmentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client-assignments"] });
      toast.success("Client user access removed successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to remove access");
    },
  });

  // Add contractor assignment mutation
  const addAssignment = useMutation({
    mutationFn: async ({ contractorId, siteId }: { contractorId: string; siteId: string }) => {
      const { error } = await supabase
        .from("user_sites")
        .insert({ user_id: contractorId, site_id: siteId });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-assignments-flat"] });
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
      queryClient.invalidateQueries({ queryKey: ["site-assignments-flat"] });
      toast.success("Contractor access removed successfully");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to remove access");
    },
  });

  const handleAddClientAssignment = () => {
    if (!selectedClientUser || !selectedClientOrg) {
      toast.error("Please select both a client user and an organization");
      return;
    }

    const exists = clientAssignments?.some(
      a => a.user_id === selectedClientUser && a.client_id === selectedClientOrg
    );

    if (exists) {
      toast.error("This client user is already assigned to this organization");
      return;
    }

    addClientAssignment.mutate({ userId: selectedClientUser, clientId: selectedClientOrg });
  };

  const handleAddAssignment = () => {
    if (!selectedContractor || !selectedSite) {
      toast.error("Please select both a contractor and a site");
      return;
    }

    const exists = assignments?.some(
      a => a.user_id === selectedContractor && a.site_id === selectedSite
    );

    if (exists) {
      toast.error("This contractor is already assigned to this site");
      return;
    }

    addAssignment.mutate({ contractorId: selectedContractor, siteId: selectedSite });
  };

  const isLoading = loadingContractors || loadingSites || loadingAssignments || loadingHistory || loadingClientUsers || loadingClientOrgs || loadingClientAssignments;

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

  // Group client assignments by user
  const clientAssignmentsByUser = clientAssignments?.reduce((acc, assignment) => {
    const userId = assignment.user_id;
    if (!acc[userId]) {
      acc[userId] = {
        user: assignment.profiles,
        clients: [],
      };
    }
    acc[userId].clients.push({
      assignmentId: assignment.id,
      client: assignment.clients,
    });
    return acc;
  }, {} as Record<string, { user: { email: string; full_name: string | null }; clients: { assignmentId: string; client: any }[] }>);

  return (
    <div className="container mx-auto space-y-8">
      <Tabs defaultValue="contractors" className="space-y-6">
        <TabsList className="grid w-full max-w-3xl grid-cols-3">
          <TabsTrigger value="contractors" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Contractor → Sites
          </TabsTrigger>
          <TabsTrigger value="site-clients" className="gap-2">
            <Building2 className="h-4 w-4" />
            Sites → Clients
          </TabsTrigger>
          <TabsTrigger value="clients" className="gap-2">
            <Users className="h-4 w-4" />
            Users → Clients
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contractors" className="space-y-6">
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
            <h2 className="text-2xl font-semibold">Current Contractor Assignments</h2>
            
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
        </TabsContent>

        <TabsContent value="site-clients" className="space-y-6">
          <Alert>
            <Building2 className="h-4 w-4" />
            <AlertDescription>
              Manage which client organization owns each site. Sites can only belong to one client organization at a time.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <h2 className="text-2xl font-semibold">Sites by Client Organization</h2>
            
            {!clientOrgs || clientOrgs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No client organizations found</p>
                  <p className="text-sm text-muted-foreground">Create client organizations first</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {clientOrgs.map((client) => {
                  const clientSites = sites?.filter(s => s.client_id === client.id) || [];
                  return (
                    <Card key={client.id}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Building2 className="h-5 w-5" />
                          {client.company_name || client.name}
                        </CardTitle>
                        <CardDescription>
                          {clientSites.length} {clientSites.length === 1 ? 'site' : 'sites'}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {clientSites.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No sites assigned to this organization</p>
                        ) : (
                          <div className="grid gap-2">
                            {clientSites.map((site) => (
                              <div
                                key={site.id}
                                className="flex items-center justify-between p-3 border rounded-lg bg-card"
                              >
                                <div className="flex-1">
                                  <p className="font-medium">{site.name}</p>
                                  {site.address && (
                                    <p className="text-sm text-muted-foreground">{site.address}</p>
                                  )}
                                </div>
                                <Badge variant="secondary">
                                  <Building2 className="h-3 w-3 mr-1" />
                                  {client.company_name || client.name}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="clients" className="space-y-6">
          <Alert>
            <Building2 className="h-4 w-4" />
            <AlertDescription>
              Client users can access all sites belonging to their assigned organization. Manage client-to-organization assignments here.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Assign Client User to Organization</CardTitle>
              <CardDescription>
                Select a client user and organization to grant access
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select value={selectedClientUser} onValueChange={setSelectedClientUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client user" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientUsers?.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.full_name || user.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedClientOrg} onValueChange={setSelectedClientOrg}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientOrgs?.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.company_name || org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button 
                  onClick={handleAddClientAssignment} 
                  disabled={addClientAssignment.isPending}
                  className="w-full"
                >
                  {addClientAssignment.isPending ? (
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
            <h2 className="text-2xl font-semibold">Current Client Assignments</h2>
            
            {!clientAssignmentsByUser || Object.keys(clientAssignmentsByUser).length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No client assignments yet</p>
                  <p className="text-sm text-muted-foreground">Start by assigning client users to organizations above</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {Object.entries(clientAssignmentsByUser).map(([userId, data]) => (
                  <Card key={userId}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        {data.user.full_name || data.user.email}
                      </CardTitle>
                      <CardDescription>
                        {data.user.email}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <p className="text-sm font-medium mb-3">
                          Assigned Organizations ({data.clients.length})
                        </p>
                        <div className="grid gap-2">
                          {data.clients.map(({ assignmentId, client }) => (
                            <div
                              key={assignmentId}
                              className="flex items-center justify-between p-3 border rounded-lg bg-card"
                            >
                              <div className="flex-1">
                                <p className="font-medium">{client.company_name || client.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  Access to all sites in this organization
                                </p>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeClientAssignment.mutate(assignmentId)}
                                disabled={removeClientAssignment.isPending}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                {removeClientAssignment.isPending ? (
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
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <History className="h-5 w-5" />
          Contractor Assignment History
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
