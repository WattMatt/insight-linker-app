import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useContractorSites } from "@/hooks/useContractorSites";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, AlertCircle, CheckCircle, FileText, Clock, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import ContractorPortalLayout from "@/components/ContractorPortalLayout";

const ContractorPortal = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const previewSiteId = searchParams.get("preview");
  const { data: sites, isLoading: sitesLoading } = useContractorSites(previewSiteId || undefined);
  const [subsectionSearch, setSubsectionSearch] = useState("");

  const site = sites?.[0]; // Contractors only have one assigned site
  const siteId = site?.id;

  const { data: subsections, isLoading: subsectionsLoading } = useQuery({
    queryKey: ["contractor-subsections", siteId],
    queryFn: async () => {
      if (!siteId) return [];
      const { data, error } = await supabase
        .from("subsections")
        .select("*")
        .eq("site_id", siteId)
        .order("name");

      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });

  const { data: inspections } = useQuery({
    queryKey: ["contractor-inspections", siteId],
    queryFn: async () => {
      if (!siteId) return [];
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

  const { data: documents } = useQuery({
    queryKey: ["contractor-documents", siteId],
    queryFn: async () => {
      if (!siteId) return [];
      const { data, error } = await supabase
        .from("site_documents")
        .select("*")
        .eq("site_id", siteId);

      if (error) throw error;
      return data;
    },
    enabled: !!siteId,
  });

  const filteredSubsections = subsections?.filter((subsection) =>
    subsection.name.toLowerCase().includes(subsectionSearch.toLowerCase()) ||
    subsection.description?.toLowerCase().includes(subsectionSearch.toLowerCase())
  );

  const totalSubsections = subsections?.length || 0;
  const compliantCOCs = subsections?.filter(s => s.coc_status === "Valid").length || 0;
  const missingExpiredCOCs = subsections?.filter(s => 
    s.coc_status === "Missing" || s.coc_status === "Expired"
  ).length || 0;
  const totalDocuments = documents?.length || 0;
  const pendingInspections = inspections?.filter(i => i.status === "Pending").length || 0;
  const completedInspections = inspections?.filter(i => i.status === "Completed").length || 0;

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

  if (sitesLoading) {
    return (
      <ContractorPortalLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </ContractorPortalLayout>
    );
  }

  if (!site) {
    return (
      <ContractorPortalLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No site assigned. Please contact your administrator.</p>
          </CardContent>
        </Card>
      </ContractorPortalLayout>
    );
  }

  return (
    <ContractorPortalLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{site.name}</h1>
          {site.address && (
            <p className="text-muted-foreground mt-1">{site.address}</p>
          )}
          {site.clients && (
            <p className="text-sm text-muted-foreground mt-2">
              Client: {site.clients.company_name || site.clients.name}
            </p>
          )}
        </div>

        {site.site_image_url && (
          <div className="h-64 overflow-hidden rounded-lg">
            <img
              src={site.site_image_url}
              alt={site.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="subsections">Subsections</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Subsections</CardTitle>
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalSubsections}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Compliant COCs</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{compliantCOCs}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Missing/Expired</CardTitle>
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{missingExpiredCOCs}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{totalDocuments}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Inspection Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <Clock className="h-8 w-8 text-yellow-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Inspections</p>
                      <p className="text-2xl font-bold">{pendingInspections}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">Completed Inspections</p>
                      <p className="text-2xl font-bold">{completedInspections}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subsections" className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search subsections..."
                  value={subsectionSearch}
                  onChange={(e) => setSubsectionSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {subsectionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : filteredSubsections && filteredSubsections.length > 0 ? (
              <div className="space-y-4">
                {filteredSubsections.map((subsection) => (
                  <Card
                    key={subsection.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate(`/contractor/subsections/${subsection.id}${previewSiteId ? `?preview=${previewSiteId}` : ''}`)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{subsection.name}</CardTitle>
                          {subsection.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {subsection.description}
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
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  {subsectionSearch
                    ? "No subsections found matching your search"
                    : "No subsections available for this site"}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ContractorPortalLayout>
  );
};

export default ContractorPortal;
