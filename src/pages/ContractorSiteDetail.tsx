import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import ContractorPortalLayout from "@/components/ContractorPortalLayout";

const ContractorSiteDetail = () => {
  const { siteId } = useParams();
  const navigate = useNavigate();

  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ["contractor-site", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*, clients(name, company_name, logo_url)")
        .eq("id", siteId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: inspections, isLoading: inspectionsLoading } = useQuery({
    queryKey: ["contractor-site-inspections", siteId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .eq("site_id", siteId)
        .order("inspection_date", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "In Progress":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      case "Pending":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
      default:
        return "bg-gray-500/10 text-gray-700 border-gray-500/20";
    }
  };

  if (siteLoading) {
    return (
      <ContractorPortalLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64" />
        </div>
      </ContractorPortalLayout>
    );
  }

  if (!site) {
    return (
      <ContractorPortalLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Site not found or you don't have access to it.</p>
          </CardContent>
        </Card>
      </ContractorPortalLayout>
    );
  }

  return (
    <ContractorPortalLayout>
      <div className="space-y-6">
        <Button
          variant="ghost"
          onClick={() => navigate("/contractor/sites")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Sites
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-4">
              {site.site_image_url && (
                <img
                  src={site.site_image_url}
                  alt={site.name}
                  className="w-24 h-24 object-cover rounded-lg"
                />
              )}
              <div className="flex-1">
                <CardTitle className="text-2xl">{site.name}</CardTitle>
                {site.address && (
                  <p className="text-muted-foreground mt-1">{site.address}</p>
                )}
                {site.clients && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Client: {site.clients.company_name || site.clients.name}
                  </p>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Inspections
            </CardTitle>
          </CardHeader>
          <CardContent>
            {inspectionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            ) : inspections && inspections.length > 0 ? (
              <div className="space-y-4">
                {inspections.map((inspection) => (
                  <div
                    key={inspection.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => navigate(`/contractor/inspections/${inspection.id}`)}
                  >
                    <div className="flex-1">
                      <h3 className="font-semibold">{inspection.title}</h3>
                      {inspection.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {inspection.description}
                        </p>
                      )}
                      {inspection.inspection_date && (
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {new Date(inspection.inspection_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                    <Badge className={getStatusColor(inspection.status)}>
                      {inspection.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No inspections found for this site.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ContractorPortalLayout>
  );
};

export default ContractorSiteDetail;
