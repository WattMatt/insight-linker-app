import { useSearchParams } from "react-router-dom";
import { useContractorSites } from "@/hooks/useContractorSites";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, ClipboardList, AlertCircle, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ContractorPortalLayout from "@/components/ContractorPortalLayout";

const ContractorDashboard = () => {
  const [searchParams] = useSearchParams();
  const previewSiteId = searchParams.get("preview");
  const { data: sites, isLoading: sitesLoading } = useContractorSites(previewSiteId || undefined);

  const { data: inspections, isLoading: inspectionsLoading } = useQuery({
    queryKey: ["contractor-inspections"],
    queryFn: async () => {
      const siteIds = sites?.map(s => s.id) || [];
      if (siteIds.length === 0) return [];

      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .in("site_id", siteIds)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!sites && sites.length > 0,
  });

  const pendingInspections = inspections?.filter(i => i.status === "Pending").length || 0;
  const completedInspections = inspections?.filter(i => i.status === "Completed").length || 0;

  if (sitesLoading) {
    return (
      <ContractorPortalLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </ContractorPortalLayout>
    );
  }

  return (
    <ContractorPortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome to your contractor portal
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Assigned Sites
              </CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{sites?.length || 0}</div>
              <p className="text-xs text-muted-foreground">
                Sites you have access to
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pending Inspections
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pendingInspections}</div>
              <p className="text-xs text-muted-foreground">
                Inspections awaiting completion
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Completed Inspections
              </CardTitle>
              <CheckCircle className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedInspections}</div>
              <p className="text-xs text-muted-foreground">
                Successfully completed
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Assigned Sites</CardTitle>
          </CardHeader>
          <CardContent>
            {sites && sites.length > 0 ? (
              <div className="space-y-4">
                {sites.map((site: any) => (
                  <div
                    key={site.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    {site.site_image_url && (
                      <img
                        src={site.site_image_url}
                        alt={site.name}
                        className="w-16 h-16 object-cover rounded"
                      />
                    )}
                    <div className="flex-1">
                      <h3 className="font-semibold">{site.name}</h3>
                      <p className="text-sm text-muted-foreground">{site.address}</p>
                      {site.clients && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Client: {site.clients.company_name || site.clients.name}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No sites assigned yet. Please contact your administrator.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ContractorPortalLayout>
  );
};

export default ContractorDashboard;
