import { useState } from "react";
import { useParams, Link, useSearchParams } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Building2, FileText, MapPin, Info, Search,
  BarChart3, LayoutGrid,
  Workflow, ShieldCheck, FileBarChart, Layers, ChevronRight
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useClientInfo } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { SchematicDiagram } from "@/components/site/SchematicDiagram";
import { AssetVerification } from "@/components/site/AssetVerification";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { ClientPortalDocuments } from "@/components/client-portal/ClientPortalDocuments";
import { downloadFile } from "@/lib/fileDownload";
import { Site, Subsection } from "@/types/site";

const ClientPortalSiteDetail = () => {
  const { siteId } = useParams();
  const [searchParams] = useSearchParams();
  const previewClientId = searchParams.get("preview");
  const { data: clientInfo } = useClientInfo(previewClientId || undefined);
  const [subsectionSearch, setSubsectionSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string } | null>(null);
  const isMobile = useIsMobile();

  const { data: site, isLoading: siteLoading } = useQuery({
    queryKey: ["client-site", siteId, clientInfo?.client_id],
    enabled: !!siteId && !!clientInfo?.client_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("*, clients(*)")
        .eq("id", siteId!)
        .eq("client_id", clientInfo!.client_id)
        .single();

      if (error) throw error;
      
      if (data?.site_image_url) {
        try {
          const urlParts = data.site_image_url.split('/site-images/');
          if (urlParts.length > 1) {
            const path = urlParts[1].split('?')[0];
            const { data: signedData } = await supabase.storage
              .from('site-images')
              .createSignedUrl(path, 3600);
            
            if (signedData?.signedUrl) {
              return { ...data, site_image_url: signedData.signedUrl };
            }
          }
        } catch (error) {
          console.error('Error generating signed URL for site image:', error);
        }
      }
      
      return data as Site & { clients: any };
    },
  });

  const { data: subsections = [], isLoading: subsectionsLoading } = useQuery({
    queryKey: ["client-subsections", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections")
        .select("*")
        .eq("site_id", siteId!)
        .order("name");

      if (error) throw error;
      return data as Subsection[];
    },
  });

  const { data: siteDocuments = [], isLoading: docsLoading } = useQuery({
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

  const { data: siteDocCategories = [] } = useQuery({
    queryKey: ["client-site-doc-categories", siteId],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_document_categories")
        .select("id, name")
        .eq("site_id", siteId!)
        .order("order_index");

      if (error) throw error;
      return data;
    },
  });

  const { data: subsectionDocuments = [] } = useQuery({
    queryKey: ["client-subsection-documents", siteId],
    enabled: !!siteId && subsections.length > 0,
    queryFn: async () => {
      const subsectionIds = subsections.map(s => s.id);
      const { data, error } = await supabase
        .from("subsection_documents")
        .select(`
          id, file_name, file_url, subsection_id,
          document_categories(name)
        `)
        .in("subsection_id", subsectionIds);

      if (error) throw error;
      return (data || []).map(doc => ({
        ...doc,
        category_name: (doc.document_categories as any)?.name || "Uncategorized"
      }));
    },
  });

  const { data: inspections = [] } = useQuery({
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

  const handleDownload = async (url: string, fileName: string) => {
    try {
      await downloadFile(url, fileName);
    } catch (error) {
      console.error("Error downloading document:", error);
    }
  };

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

  const filteredSubsections = subsections.filter(subsection => {
    const searchLower = subsectionSearch.toLowerCase();
    return (
      subsection.name.toLowerCase().includes(searchLower) ||
      subsection.description?.toLowerCase().includes(searchLower)
    );
  });

  // Calculate KPIs
  const totalSubsections = subsections.length;
  const totalDocuments = siteDocuments.length + subsectionDocuments.length;
  const totalInspections = inspections.length;

  const sitesUrl = `/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`;

  return (
    <div className="space-y-6">
      {/* Back button + Breadcrumbs */}
      <div className="flex items-center gap-3">
        <Link to={sitesUrl}>
          <Button variant="outline" size="sm" className="gap-2 min-h-[44px]">
            <ChevronRight className="h-4 w-4 rotate-180" />
            <span>All Sites</span>
          </Button>
        </Link>
        <Breadcrumbs 
          items={[
            { label: "Sites", href: sitesUrl, icon: "site" },
            { label: site.name, icon: "site" }
          ]} 
        />
      </div>

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
          </div>
        </CardHeader>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex flex-wrap w-full h-auto gap-1 p-1 overflow-visible">
          <TabsTrigger value="overview" className="gap-2 shrink-0">
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="schematic" className="gap-2 shrink-0">
            <Workflow className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Schematic</span>
          </TabsTrigger>
          <TabsTrigger value="asset-verification" className="gap-2 shrink-0">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Assets</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2 shrink-0">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Documents</span>
          </TabsTrigger>
          <TabsTrigger value="subsections" className="gap-2 shrink-0">
            <Layers className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Subsections</span>
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

        {/* Schematic Tab */}
        <TabsContent value="schematic" className="space-y-6">
          <SchematicDiagram siteId={siteId!} siteName={site.name} readOnly clientPortalMode />
        </TabsContent>

        {/* Asset Verification Tab */}
        <TabsContent value="asset-verification" className="space-y-6">
          <AssetVerification siteId={siteId!} siteName={site.name} readOnly />
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          {docsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <ClientPortalDocuments
              siteDocuments={siteDocuments}
              siteCategories={siteDocCategories}
              subsectionDocuments={subsectionDocuments}
              subsections={subsections.map(s => ({ id: s.id, name: s.name }))}
              onPreview={(url, name) => setPreviewDocument({ url, name })}
              onDownload={handleDownload}
            />
          )}
        </TabsContent>

        {/* Subsections Tab */}
        <TabsContent value="subsections" className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subsections by name or description..."
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
              ) : filteredSubsections.length > 0 ? (
                <div className="space-y-2">
                  {filteredSubsections.map((subsection) => (
                    <Link 
                      key={subsection.id}
                      to={`/client-portal/subsections/${subsection.id}${previewClientId ? `?preview=${previewClientId}` : ''}`}
                      className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent transition-colors cursor-pointer block"
                    >
                      <div className="flex items-center gap-3">
                        <Layers className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{subsection.name}</p>
                          {subsection.description && (
                            <p className="text-sm text-muted-foreground">{subsection.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
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

      </Tabs>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={previewDocument !== null}
        onOpenChange={(open) => !open && setPreviewDocument(null)}
        fileUrl={previewDocument?.url || ''}
        fileName={previewDocument?.name || ''}
      />
    </div>
  );
};

export default ClientPortalSiteDetail;
