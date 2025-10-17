import { useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, FileText, MapPin, Download, Eye, Info, Search, BarChart3, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useClientInfo } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

const ClientPortalSiteDetail = () => {
  const { siteId } = useParams();
  const [searchParams] = useSearchParams();
  const previewClientId = searchParams.get("preview");
  const { data: clientInfo } = useClientInfo(previewClientId || undefined);
  const [subsectionSearch, setSubsectionSearch] = useState("");

  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ["client-site", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .eq("id", siteId!)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: subsections, isLoading: subsectionsLoading } = useQuery({
    queryKey: ["client-subsections", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections")
        .select("*")
        .eq("site_id", siteId!)
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ["client-site-documents", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_documents")
        .select("*")
        .eq("site_id", siteId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: inspections } = useQuery({
    queryKey: ["client-site-inspections", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .eq("site_id", siteId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  if (siteLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!site) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-lg font-medium">Site not found</p>
          <Link to="/client-portal/sites">
            <Button className="mt-4">Back to Sites</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "compliant": return "bg-green-500";
      case "missing": return "bg-red-500";
      case "expired": return "bg-orange-500";
      default: return "bg-gray-500";
    }
  };

  const filteredSubsections = subsections?.filter(subsection => {
    const searchLower = subsectionSearch.toLowerCase();
    return (
      subsection.name.toLowerCase().includes(searchLower) ||
      subsection.description?.toLowerCase().includes(searchLower) ||
      subsection.coc_status?.toLowerCase().includes(searchLower)
    );
  });

  // Calculate KPIs
  const totalSubsections = subsections?.length || 0;
  const compliantSubsections = subsections?.filter(s => s.coc_status?.toLowerCase() === "compliant").length || 0;
  const missingCOCs = subsections?.filter(s => s.coc_status?.toLowerCase() === "missing").length || 0;
  const expiredCOCs = subsections?.filter(s => s.coc_status?.toLowerCase() === "expired").length || 0;
  const totalDocuments = documents?.length || 0;
  const totalInspections = inspections?.length || 0;
  const completedInspections = inspections?.filter(i => i.status?.toLowerCase() === "completed").length || 0;
  const upcomingInspections = inspections?.filter(i => 
    i.status?.toLowerCase() === "scheduled" && 
    i.inspection_date && 
    new Date(i.inspection_date) >= new Date()
  ).length || 0;

  return (
    <div className="space-y-6">
      {previewClientId && (
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Admin Preview Mode:</strong> Viewing as{" "}
            {clientInfo?.clients?.company_name || clientInfo?.clients?.name}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Site Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              {site.site_image_url ? (
                <img 
                  src={site.site_image_url} 
                  alt={site.name}
                  className="h-20 w-20 object-cover rounded-lg"
                />
              ) : (
                <div className="h-20 w-20 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Building2 className="h-10 w-10 text-primary" />
                </div>
              )}
              <div>
                <CardTitle className="text-2xl">{site.name}</CardTitle>
                {site.site_type && (
                  <p className="text-muted-foreground mt-1">{site.site_type}</p>
                )}
                {site.address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                    <MapPin className="h-4 w-4" />
                    <span>{site.address}</span>
                  </div>
                )}
              </div>
            </div>
            <Link to={`/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`}>
              <Button variant="outline">Back to Sites</Button>
            </Link>
          </div>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="subsections">Subsections</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Subsections</CardTitle>
                <Building2 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSubsections}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Compliant COCs</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{compliantSubsections}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {totalSubsections > 0 ? Math.round((compliantSubsections / totalSubsections) * 100) : 0}% compliant
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Missing/Expired COCs</CardTitle>
                <AlertCircle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{missingCOCs + expiredCOCs}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {missingCOCs} missing, {expiredCOCs} expired
                </p>
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

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Inspections</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalInspections}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {completedInspections} completed
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Upcoming Inspections</CardTitle>
                <Clock className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{upcomingInspections}</div>
              </CardContent>
            </Card>
          </div>

          {(site.supply_authority || site.nominated_max_demand) && (
            <Card>
              <CardHeader>
                <CardTitle>Site Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {site.supply_authority && (
                    <div>
                      <p className="text-sm text-muted-foreground">Supply Authority</p>
                      <p className="font-medium">{site.supply_authority}</p>
                    </div>
                  )}
                  {site.nominated_max_demand && (
                    <div>
                      <p className="text-sm text-muted-foreground">Nominated Max Demand</p>
                      <p className="font-medium">{site.nominated_max_demand}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Subsections Tab */}
        <TabsContent value="subsections" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subsections by name, description, or status..."
              value={subsectionSearch}
              onChange={(e) => setSubsectionSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="pt-6">
              {subsectionsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : filteredSubsections && filteredSubsections.length > 0 ? (
                <div className="space-y-2">
                  {filteredSubsections.map((subsection) => (
                    <Link 
                      key={subsection.id}
                      to={`/client-portal/subsections/${subsection.id}${previewClientId ? `?preview=${previewClientId}` : ''}`}
                      className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{subsection.name}</p>
                          {subsection.description && (
                            <p className="text-sm text-muted-foreground">{subsection.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {subsection.coc_status && (
                          <Badge 
                            variant="secondary"
                            className={`${getStatusColor(subsection.coc_status)} text-white`}
                          >
                            COC: {subsection.coc_status}
                          </Badge>
                        )}
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  {subsectionSearch 
                    ? "No subsections match your search" 
                    : "No subsections found for this site"}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Site Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : documents && documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div 
                      key={doc.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{doc.file_name}</p>
                          <p className="text-xs text-muted-foreground">{doc.category}</p>
                        </div>
                      </div>
                      <a 
                        href={doc.file_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        download
                      >
                        <Button variant="ghost" size="sm" className="gap-2">
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No documents available for this site
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ClientPortalSiteDetail;
