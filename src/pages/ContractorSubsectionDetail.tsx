import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import ContractorPortalLayout from "@/components/ContractorPortalLayout";

const ContractorSubsectionDetail = () => {
  const { subsectionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewSiteId = searchParams.get("preview");

  const { data: subsection, isLoading: subsectionLoading } = useQuery({
    queryKey: ["contractor-subsection", subsectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections")
        .select("*, sites(id, name, address)")
        .eq("id", subsectionId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: inspections, isLoading: inspectionsLoading } = useQuery({
    queryKey: ["contractor-subsection-inspections", subsectionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .eq("subsection_id", subsectionId)
        .order("inspection_date", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!subsectionId,
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Valid":
      case "Completed":
        return "bg-green-500/10 text-green-700 border-green-500/20";
      case "In Progress":
        return "bg-blue-500/10 text-blue-700 border-blue-500/20";
      case "Pending":
      case "Expiring Soon":
        return "bg-yellow-500/10 text-yellow-700 border-yellow-500/20";
      case "Missing":
      case "Expired":
        return "bg-red-500/10 text-red-700 border-red-500/20";
      default:
        return "bg-gray-500/10 text-gray-700 border-gray-500/20";
    }
  };

  if (subsectionLoading) {
    return (
      <ContractorPortalLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-64" />
        </div>
      </ContractorPortalLayout>
    );
  }

  if (!subsection) {
    return (
      <ContractorPortalLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Subsection not found or you don't have access to it.</p>
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
          onClick={() => navigate(`/contractor/sites/${subsection.sites.id}${previewSiteId ? `?preview=${previewSiteId}` : ''}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Site
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-2xl">{subsection.name}</CardTitle>
                {subsection.description && (
                  <p className="text-muted-foreground mt-2">{subsection.description}</p>
                )}
                {subsection.sites && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Site: {subsection.sites.name}
                  </p>
                )}
              </div>
              {subsection.is_coc_required && (
                <Badge className={getStatusColor(subsection.coc_status || "Missing")}>
                  COC: {subsection.coc_status || "Missing"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {subsection.category && (
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium">{subsection.category}</p>
                </div>
              )}
              {subsection.coc_number && (
                <div>
                  <p className="text-sm text-muted-foreground">COC Number</p>
                  <p className="font-medium">{subsection.coc_number}</p>
                </div>
              )}
              {subsection.tenant_name && (
                <div>
                  <p className="text-sm text-muted-foreground">Tenant Name</p>
                  <p className="font-medium">{subsection.tenant_name}</p>
                </div>
              )}
              {subsection.meter_serial_number && (
                <div>
                  <p className="text-sm text-muted-foreground">Meter Serial Number</p>
                  <p className="font-medium">{subsection.meter_serial_number}</p>
                </div>
              )}
            </div>
          </CardContent>
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
                    onClick={() => navigate(`/contractor/inspections/${inspection.id}${previewSiteId ? `?preview=${previewSiteId}` : ''}`)}
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
                No inspections found for this subsection.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </ContractorPortalLayout>
  );
};

export default ContractorSubsectionDetail;
