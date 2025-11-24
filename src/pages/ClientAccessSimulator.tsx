import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle, XCircle, Eye, Users } from "lucide-react";

interface Client {
  id: string;
  email: string;
  full_name: string | null;
}

interface AccessStats {
  sites: { accessible: number; total: number };
  subsections: { accessible: number; total: number };
  documents: { accessible: number; total: number };
}

export default function ClientAccessSimulator() {
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // Fetch all clients
  const { data: clients, isLoading: loadingClients } = useQuery({
    queryKey: ["client-users"],
    queryFn: async () => {
      // First get client user IDs
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "Client");

      if (roleError) throw roleError;
      if (!roleData || roleData.length === 0) return [];

      const userIds = roleData.map((r) => r.user_id);

      // Then fetch their profiles
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      if (profileError) throw profileError;
      return profileData as Client[];
    },
  });

  // Fetch access stats for selected client
  const { data: accessStats, isLoading: loadingStats } = useQuery({
    queryKey: ["client-access-stats", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return null;

      // Get client's assigned client_id from user_clients table
      const { data: userClient } = await supabase
        .from("user_clients")
        .select("client_id")
        .eq("user_id", selectedClientId)
        .single();

      if (!userClient) {
        return {
          sites: { accessible: 0, total: 0 },
          subsections: { accessible: 0, total: 0 },
          documents: { accessible: 0, total: 0 },
        } as AccessStats;
      }

      const clientId = userClient.client_id;

      // Total counts
      const { count: totalSites } = await supabase
        .from("sites")
        .select("*", { count: "exact", head: true });

      const { count: totalSubsections } = await supabase
        .from("subsections")
        .select("*", { count: "exact", head: true });

      const { count: totalDocuments } = await supabase
        .from("subsection_documents")
        .select("*", { count: "exact", head: true });

      // Accessible counts (filtered by client_id)
      const { count: accessibleSites } = await supabase
        .from("sites")
        .select("*", { count: "exact", head: true })
        .eq("client_id", clientId);

      const { data: accessibleSiteIds } = await supabase
        .from("sites")
        .select("id")
        .eq("client_id", clientId);

      const siteIds = accessibleSiteIds?.map(s => s.id) || [];

      const { count: accessibleSubsections } = await supabase
        .from("subsections")
        .select("*", { count: "exact", head: true })
        .in("site_id", siteIds.length > 0 ? siteIds : ['']);

      const { data: accessibleSubsectionIds } = await supabase
        .from("subsections")
        .select("id")
        .in("site_id", siteIds.length > 0 ? siteIds : ['']);

      const subsectionIds = accessibleSubsectionIds?.map(s => s.id) || [];

      const { count: accessibleDocuments } = await supabase
        .from("subsection_documents")
        .select("*", { count: "exact", head: true })
        .in("subsection_id", subsectionIds.length > 0 ? subsectionIds : ['']);

      return {
        sites: { accessible: accessibleSites || 0, total: totalSites || 0 },
        subsections: { accessible: accessibleSubsections || 0, total: totalSubsections || 0 },
        documents: { accessible: accessibleDocuments || 0, total: totalDocuments || 0 },
      } as AccessStats;
    },
    enabled: !!selectedClientId,
  });

  const selectedClient = clients?.find((c) => c.id === selectedClientId);

  const getAccessPercentage = (accessible: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((accessible / total) * 100);
  };

  const getAccessLevel = (percentage: number) => {
    if (percentage === 0) return { color: "destructive", icon: XCircle, label: "No Access" };
    if (percentage === 100) return { color: "destructive", icon: AlertTriangle, label: "Full Access" };
    return { color: "default", icon: CheckCircle, label: "Limited Access" };
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          This tool simulates client portal access to verify RLS policies are working correctly.
          Select a client user to see what data they can access.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Select Client User</CardTitle>
          <CardDescription>
            Choose a client user to test their access permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingClients ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a client user..." />
              </SelectTrigger>
              <SelectContent>
                {clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.full_name || client.email} ({client.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedClientId && (
        <>
          {loadingStats ? (
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : accessStats ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Sites Access</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-bold">
                          {accessStats.sites.accessible}/{accessStats.sites.total}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {getAccessPercentage(accessStats.sites.accessible, accessStats.sites.total)}% accessible
                        </p>
                      </div>
                      {(() => {
                        const level = getAccessLevel(
                          getAccessPercentage(accessStats.sites.accessible, accessStats.sites.total)
                        );
                        const Icon = level.icon;
                        return (
                          <Badge variant={level.color as any}>
                            <Icon className="h-3 w-3 mr-1" />
                            {level.label}
                          </Badge>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Subsections Access</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-bold">
                          {accessStats.subsections.accessible}/{accessStats.subsections.total}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {getAccessPercentage(accessStats.subsections.accessible, accessStats.subsections.total)}% accessible
                        </p>
                      </div>
                      {(() => {
                        const level = getAccessLevel(
                          getAccessPercentage(accessStats.subsections.accessible, accessStats.subsections.total)
                        );
                        const Icon = level.icon;
                        return (
                          <Badge variant={level.color as any}>
                            <Icon className="h-3 w-3 mr-1" />
                            {level.label}
                          </Badge>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">Documents Access</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-2xl font-bold">
                          {accessStats.documents.accessible}/{accessStats.documents.total}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {getAccessPercentage(accessStats.documents.accessible, accessStats.documents.total)}% accessible
                        </p>
                      </div>
                      {(() => {
                        const level = getAccessLevel(
                          getAccessPercentage(accessStats.documents.accessible, accessStats.documents.total)
                        );
                        const Icon = level.icon;
                        return (
                          <Badge variant={level.color as any}>
                            <Icon className="h-3 w-3 mr-1" />
                            {level.label}
                          </Badge>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Access Summary</CardTitle>
                  <CardDescription>
                    Detailed breakdown of what {selectedClient?.full_name || selectedClient?.email} can access
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Resource Type</TableHead>
                        <TableHead>Accessible</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Percentage</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(accessStats).map(([key, value]) => {
                        const percentage = getAccessPercentage(value.accessible, value.total);
                        const level = getAccessLevel(percentage);
                        const Icon = level.icon;
                        return (
                          <TableRow key={key}>
                            <TableCell className="font-medium capitalize">{key}</TableCell>
                            <TableCell>{value.accessible}</TableCell>
                            <TableCell>{value.total}</TableCell>
                            <TableCell>{percentage}%</TableCell>
                            <TableCell>
                              <Badge variant={level.color as any}>
                                <Icon className="h-3 w-3 mr-1" />
                                {level.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Alert>
                <Eye className="h-4 w-4" />
                <AlertDescription>
                  <strong>Expected Behavior:</strong> Clients should only access data for their assigned client organization.
                  Full access (100%) or no access (0%) may indicate a security issue with RLS policies.
                </AlertDescription>
              </Alert>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
