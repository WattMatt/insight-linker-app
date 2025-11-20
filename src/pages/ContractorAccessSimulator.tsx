import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle, XCircle, Eye, Shield } from "lucide-react";

interface Contractor {
  id: string;
  email: string;
  full_name: string | null;
}

interface AccessStats {
  sites: { accessible: number; total: number };
  subsections: { accessible: number; total: number };
  inspections: { accessible: number; total: number };
  documents: { accessible: number; total: number };
  floorPlans: { accessible: number; total: number };
}

export default function ContractorAccessSimulator() {
  const [selectedContractorId, setSelectedContractorId] = useState<string>("");

  // Fetch all contractors
  const { data: contractors, isLoading: loadingContractors } = useQuery({
    queryKey: ["contractors"],
    queryFn: async () => {
      // First get contractor user IDs
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "Contractor");

      if (roleError) throw roleError;
      if (!roleData || roleData.length === 0) return [];

      const userIds = roleData.map((r) => r.user_id);

      // Then fetch their profiles
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);

      if (profileError) throw profileError;
      
      return profileData as Contractor[];
    },
  });

  // Fetch assigned sites for selected contractor
  const { data: assignedSites, isLoading: loadingSites } = useQuery({
    queryKey: ["contractor-assigned-sites", selectedContractorId],
    queryFn: async () => {
      if (!selectedContractorId) return [];
      
      const { data, error } = await supabase
        .from("user_sites")
        .select("site_id, sites(id, name, address, site_type, client:clients(name))")
        .eq("user_id", selectedContractorId);

      if (error) throw error;
      return data;
    },
    enabled: !!selectedContractorId,
  });

  // Fetch access statistics
  const { data: accessStats, isLoading: loadingStats } = useQuery({
    queryKey: ["contractor-access-stats", selectedContractorId],
    queryFn: async () => {
      if (!selectedContractorId) return null;

      // Get total counts
      const [totalSites, totalSubsections, totalInspections, totalDocuments, totalFloorPlans] =
        await Promise.all([
          supabase.from("sites").select("id", { count: "exact", head: true }),
          supabase.from("subsections").select("id", { count: "exact", head: true }),
          supabase.from("inspections").select("id", { count: "exact", head: true }),
          supabase.from("site_documents").select("id", { count: "exact", head: true }),
          supabase.from("subsection_floor_plans").select("id", { count: "exact", head: true }),
        ]);

      // Get accessible site IDs
      const { data: userSites } = await supabase
        .from("user_sites")
        .select("site_id")
        .eq("user_id", selectedContractorId);

      const accessibleSiteIds = userSites?.map((us) => us.site_id) || [];

      // Get accessible counts
      const [accessibleSubsections, accessibleInspections, accessibleDocuments] =
        await Promise.all([
          supabase
            .from("subsections")
            .select("id", { count: "exact", head: true })
            .in("site_id", accessibleSiteIds),
          supabase
            .from("inspections")
            .select("id", { count: "exact", head: true })
            .in("site_id", accessibleSiteIds),
          supabase
            .from("site_documents")
            .select("id", { count: "exact", head: true })
            .in("site_id", accessibleSiteIds),
        ]);

      // Get accessible subsection IDs for floor plans
      const { data: accessibleSubsectionData } = await supabase
        .from("subsections")
        .select("id")
        .in("site_id", accessibleSiteIds);

      const accessibleSubsectionIds = accessibleSubsectionData?.map((s) => s.id) || [];

      const accessibleFloorPlans = await supabase
        .from("subsection_floor_plans")
        .select("id", { count: "exact", head: true })
        .in("subsection_id", accessibleSubsectionIds);

      return {
        sites: { accessible: accessibleSiteIds.length, total: totalSites.count || 0 },
        subsections: { accessible: accessibleSubsections.count || 0, total: totalSubsections.count || 0 },
        inspections: { accessible: accessibleInspections.count || 0, total: totalInspections.count || 0 },
        documents: { accessible: accessibleDocuments.count || 0, total: totalDocuments.count || 0 },
        floorPlans: { accessible: accessibleFloorPlans.count || 0, total: totalFloorPlans.count || 0 },
      } as AccessStats;
    },
    enabled: !!selectedContractorId,
  });

  const selectedContractor = contractors?.find((c) => c.id === selectedContractorId);

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
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Contractor Access Simulator</h1>
          <p className="text-muted-foreground">
            Test and verify what data contractors can access based on their site assignments
          </p>
        </div>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          This tool simulates contractor access based on RLS policies. Use it to verify security before assigning contractors to sites.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Select Contractor</CardTitle>
          <CardDescription>Choose a contractor to view their access permissions</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingContractors ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={selectedContractorId} onValueChange={setSelectedContractorId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a contractor..." />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {contractors && contractors.length > 0 ? (
                  contractors.map((contractor) => (
                    <SelectItem key={contractor.id} value={contractor.id}>
                      {contractor.full_name || contractor.email} ({contractor.email})
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-4 text-sm text-muted-foreground">
                    No contractors found. Users need to be assigned the "Contractor" role.
                  </div>
                )}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {selectedContractorId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Assigned Sites</CardTitle>
              <CardDescription>
                Sites that {selectedContractor?.full_name || selectedContractor?.email} has access to
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingSites ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : assignedSites && assignedSites.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site Name</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Client</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignedSites.map((assignment: any) => (
                      <TableRow key={assignment.site_id}>
                        <TableCell className="font-medium">{assignment.sites.name}</TableCell>
                        <TableCell>{assignment.sites.address || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{assignment.sites.site_type || "N/A"}</Badge>
                        </TableCell>
                        <TableCell>{assignment.sites.client?.name || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This contractor has no site assignments. They cannot access any data.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Access Analysis
              </CardTitle>
              <CardDescription>
                Compare what the contractor can see vs. total system data
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : accessStats ? (
                <div className="space-y-4">
                  {Object.entries(accessStats).map(([key, value]) => {
                    const percentage = getAccessPercentage(value.accessible, value.total);
                    const level = getAccessLevel(percentage);
                    const Icon = level.icon;

                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <Icon className={`h-5 w-5 ${percentage === 100 ? "text-destructive" : "text-muted-foreground"}`} />
                          <div>
                            <p className="font-medium capitalize">
                              {key.replace(/([A-Z])/g, " $1").trim()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {value.accessible} of {value.total} accessible
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant={level.color as any}>{level.label}</Badge>
                          <span className="text-2xl font-bold">{percentage}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </CardContent>
          </Card>

          {accessStats && (
            <Alert variant={accessStats.sites.accessible === accessStats.sites.total ? "destructive" : "default"}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {accessStats.sites.accessible === accessStats.sites.total ? (
                  <span className="font-semibold">
                    ⚠️ WARNING: This contractor has access to ALL sites in the system. This is a security risk!
                  </span>
                ) : accessStats.sites.accessible === 0 ? (
                  <span>
                    This contractor has no site assignments and cannot access any data. Assign sites to grant access.
                  </span>
                ) : (
                  <span className="text-green-600">
                    ✓ Access is properly limited to {accessStats.sites.accessible} assigned sites only.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </div>
  );
}
