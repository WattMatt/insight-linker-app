import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams, useNavigate } from "@/lib/navigation";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText, Download, Info, Eye, ArrowLeft,
  CheckCircle2, AlertCircle, Calendar, User,
  Building2, MapPin, ChevronRight, Layers, FileBarChart,
  ShieldCheck, Loader2, ClipboardList
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useClientInfo } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { downloadFile } from "@/lib/fileDownload";
import { format } from "date-fns";

const ClientPortalSubsectionDetail = () => {
  const { subsectionId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const previewClientId = searchParams.get("preview");
  const { data: clientInfo } = useClientInfo(previewClientId || undefined);
  const [activeTab, setActiveTab] = useState("overview");
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string } | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<any | null>(null);
  const [inspectionDetails, setInspectionDetails] = useState<any | null>(null);
  const [loadingInspection, setLoadingInspection] = useState(false);

  const { data: subsection, isLoading: subsectionLoading } = useQuery({
    queryKey: ["client-subsection", subsectionId, clientInfo?.client_id],
    enabled: !!subsectionId && !!clientInfo?.client_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsections")
        .select("*, sites(name, id, client_id, address)")
        .eq("id", subsectionId!)
        .single();

      if (error) throw error;
      
      if (data?.sites?.client_id !== clientInfo!.client_id) {
        throw new Error("Access denied");
      }
      
      return data;
    },
  });

  const { data: documents = [], isLoading: docsLoading } = useQuery({
    queryKey: ["client-subsection-documents", subsectionId],
    enabled: !!subsectionId && !!subsection,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsection_documents")
        .select("*, document_categories(name)")
        .eq("subsection_id", subsectionId!)
        .order("uploaded_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  const { data: inspections = [] } = useQuery({
    queryKey: ["client-subsection-inspections", subsectionId, subsection?.site_id, subsection?.name],
    enabled: !!subsectionId && !!subsection,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .eq("subsection_id", subsectionId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const linked = data || [];

      // Fallback: pull orphan inspections on same site whose json_data shop matches this subsection
      const normalize = (v?: string | null) =>
        (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const target = normalize(subsection?.name);
      if (!target || !subsection?.site_id) return linked;
      const { data: orphans } = await supabase
        .from("inspections")
        .select("*")
        .eq("site_id", subsection.site_id)
        .is("subsection_id", null);
      const matched = (orphans || []).filter((insp: any) => {
        const shop = insp?.json_data?.generalInfo?.shopNumber
          || insp?.json_data?.generalInfo?.shopName
          || insp?.shop_number
          || insp?.shop_name;
        return normalize(shop) === target;
      });
      return [...linked, ...matched];
    },
  });

  const { data: floorPlans = [] } = useQuery({
    queryKey: ["client-subsection-floor-plans", subsectionId],
    enabled: !!subsectionId && !!subsection,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subsection_floor_plans")
        .select("*, floor_plan_pins(*)")
        .eq("subsection_id", subsectionId!);

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch full inspection details when an inspection is selected
  const fetchInspectionDetails = async (inspectionId: string) => {
    setLoadingInspection(true);
    try {
      const { data, error } = await supabase
        .from('inspections')
        .select(`
          *,
          inspection_templates (name, sections)
        `)
        .eq('id', inspectionId)
        .single();
      
      if (error) {
        console.error('Error fetching inspection:', error);
        return;
      }
      
      setInspectionDetails(data);
    } catch (err) {
      console.error('Error fetching inspection details:', err);
    } finally {
      setLoadingInspection(false);
    }
  };

  // Trigger fetch when inspection is selected
  useEffect(() => {
    if (selectedInspection) {
      fetchInspectionDetails(selectedInspection.id);
    } else {
      setInspectionDetails(null);
    }
  }, [selectedInspection]);

  const handleDownload = async (url: string, fileName: string) => {
    try {
      await downloadFile(url, fileName);
    } catch (error) {
      console.error("Error downloading document:", error);
    }
  };

  const handleBackToSite = () => {
    if (subsection?.site_id) {
      navigate(`/client-portal/sites/${subsection.site_id}${previewClientId ? `?preview=${previewClientId}` : ''}`);
    }
  };

  if (subsectionLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!subsection) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium">Subsection not found</p>
          <p className="text-muted-foreground mt-1">This subsection may not exist or you don't have access to it.</p>
          <Link to="/client-portal/sites">
            <Button className="mt-4">Back to Sites</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  // Group documents by category
  const groupedDocuments = documents.reduce((acc, doc) => {
    const categoryName = (doc.document_categories as any)?.name || "Uncategorized";
    if (!acc[categoryName]) acc[categoryName] = [];
    acc[categoryName].push(doc);
    return acc;
  }, {} as Record<string, typeof documents>);

  const totalPins = floorPlans.reduce((sum, fp) => sum + (fp.floor_plan_pins?.length || 0), 0);
  const totalInspections = inspections.length;

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleBackToSite}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Site
        </Button>
        
        {/* Breadcrumb Trail */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link 
            to={`/client-portal/sites${previewClientId ? `?preview=${previewClientId}` : ''}`}
            className="hover:text-foreground transition-colors"
          >
            Sites
          </Link>
          <ChevronRight className="h-4 w-4" />
          <Link 
            to={`/client-portal/sites/${subsection.site_id}${previewClientId ? `?preview=${previewClientId}` : ''}`}
            className="hover:text-foreground transition-colors"
          >
            {subsection.sites?.name}
          </Link>
          <ChevronRight className="h-4 w-4" />
          <span className="text-foreground font-medium">{subsection.name}</span>
        </div>
      </div>

      {previewClientId && (
        <Alert className="bg-primary/5 border-primary/20">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-primary">
            <strong>Admin Preview Mode:</strong> Viewing as{" "}
            {clientInfo?.clients?.company_name || clientInfo?.clients?.name}
          </AlertDescription>
        </Alert>
      )}
      
      {/* Subsection Header Card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 bg-background rounded-xl flex items-center justify-center shadow-sm">
                <Layers className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">{subsection.name}</h1>
                {subsection.description && (
                  <p className="text-muted-foreground mt-1">{subsection.description}</p>
                )}
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  <span>{subsection.sites?.name}</span>
                  {subsection.sites?.address && (
                    <>
                      <span>•</span>
                      <MapPin className="h-4 w-4" />
                      <span>{subsection.sites.address}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <div className="text-2xl font-bold text-primary">{documents.length}</div>
              <div className="text-xs text-muted-foreground">Documents</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <div className="text-2xl font-bold text-primary">{inspections.length}</div>
              <div className="text-xs text-muted-foreground">Inspections</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <div className="text-2xl font-bold text-primary">{floorPlans.length}</div>
              <div className="text-xs text-muted-foreground">Floor Plans</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/30">
              <div className="text-2xl font-bold text-primary">{totalPins}</div>
              <div className="text-xs text-muted-foreground">Annotations</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-flex">
          <TabsTrigger value="overview" className="gap-2">
            <Info className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Documents</span>
            {documents.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{documents.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="inspections" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Inspections</span>
            {inspections.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{inspections.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Recent Activity Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-primary" />
                Activity Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{documents.length}</p>
                      <p className="text-xs text-muted-foreground">Total Documents</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalInspections}</p>
                      <p className="text-xs text-muted-foreground">Inspections</p>
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                      <MapPin className="h-5 w-5 text-accent-foreground" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{totalPins}</p>
                      <p className="text-xs text-muted-foreground">Floor Plan Annotations</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          {docsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : Object.keys(groupedDocuments).length > 0 ? (
            <Accordion type="multiple" defaultValue={[]} className="space-y-3">
              {Object.entries(groupedDocuments).sort(([a], [b]) => a.localeCompare(b)).map(([category, docs]) => (
                <AccordionItem key={category} value={category} className="border-none">
                  <Card className="overflow-hidden">
                    <AccordionTrigger className="px-4 sm:px-6 py-3 sm:py-4 hover:no-underline hover:bg-primary/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <span className="font-semibold">{category}</span>
                        <Badge variant="secondary" className="text-xs">
                          {docs.length} files
                        </Badge>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 sm:px-6 pb-4">
                      <div className="grid gap-2 mt-2">
                        {docs.map((doc) => (
                          <div 
                            key={doc.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border group hover:bg-primary/5 transition-colors gap-2"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <span className="text-sm font-medium truncate block">{doc.file_name}</span>
                                {doc.uploaded_at && (
                                  <span className="text-xs text-muted-foreground">
                                    Uploaded {format(new Date(doc.uploaded_at), "dd MMM yyyy")}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity justify-end">
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => setPreviewDocument({ url: doc.file_url, name: doc.file_name })}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                onClick={() => handleDownload(doc.file_url, doc.file_name)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No documents available for this subsection</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Inspections Tab */}
        <TabsContent value="inspections" className="space-y-4">
          {inspections.length > 0 ? (
            <div className="space-y-3">
              {inspections.map((inspection) => (
                <Card key={inspection.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-muted">
                          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium">{inspection.title}</p>
                          {inspection.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{inspection.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            {inspection.inspection_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(inspection.inspection_date), "dd MMM yyyy")}
                              </span>
                            )}
                            {inspection.inspector_name && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {inspection.inspector_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedInspection(inspection)}
                          className="gap-1"
                        >
                          <Eye className="h-4 w-4" />
                          View
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">No inspections recorded for this subsection</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Document Preview Dialog */}
      <DocumentPreviewDialog
        open={previewDocument !== null}
        onOpenChange={(open) => !open && setPreviewDocument(null)}
        fileUrl={previewDocument?.url || ''}
        fileName={previewDocument?.name || ''}
      />

      {/* Inspection Detail Dialog - Full Report View */}
      <Dialog open={!!selectedInspection} onOpenChange={(open) => !open && setSelectedInspection(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {selectedInspection?.title || 'Inspection Report'}
            </DialogTitle>
            <DialogDescription>
              {inspectionDetails?.inspection_templates?.name 
                ? `Template: ${inspectionDetails.inspection_templates.name}` 
                : 'Full read-only inspection report'}
            </DialogDescription>
          </DialogHeader>
          
          {loadingInspection ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : inspectionDetails ? (
            <ScrollArea className="max-h-[calc(90vh-120px)]">
              <div className="px-6 py-4 space-y-6">
                {/* Summary Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {inspectionDetails.inspection_date && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <span className="text-xs text-muted-foreground block mb-1">Date</span>
                      <span className="font-semibold text-sm">{format(new Date(inspectionDetails.inspection_date), "dd MMM yyyy")}</span>
                    </div>
                  )}
                  {inspectionDetails.inspector_name && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <span className="text-xs text-muted-foreground block mb-1">Inspector</span>
                      <span className="font-semibold text-sm">{inspectionDetails.inspector_name}</span>
                    </div>
                  )}
                </div>

                {/* Description */}
                {inspectionDetails.description && (
                  <div className="p-4 rounded-lg border bg-muted/20">
                    <h4 className="text-sm font-semibold mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground">{inspectionDetails.description}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Unable to load inspection details</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientPortalSubsectionDetail;