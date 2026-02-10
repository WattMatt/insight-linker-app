import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  FileText, Download, Info, Eye, ArrowLeft, 
  CheckCircle2, AlertCircle, Calendar, Hash, User, Zap,
  Building2, MapPin, ChevronRight, Layers, FileBarChart,
  ShieldCheck, Clock, Loader2, ClipboardList
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
    queryKey: ["client-subsection-inspections", subsectionId],
    enabled: !!subsectionId && !!subsection,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("*")
        .eq("subsection_id", subsectionId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
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
          inspection_templates (name, sections),
          inspection_signatures (signer_name, signer_type, signed_at)
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

  const getInspectionStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'bg-emerald-500';
      case 'in_progress': return 'bg-amber-500';
      case 'scheduled': return 'bg-blue-500';
      default: return 'bg-muted';
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

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "compliant": case "valid": case "approved": case "pass": return "bg-emerald-500";
      case "missing": return "bg-destructive";
      case "expired": return "bg-amber-500";
      default: return "bg-muted-foreground";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case "compliant": case "valid": case "approved": case "pass": 
        return <CheckCircle2 className="h-4 w-4" />;
      case "missing": case "expired": 
        return <AlertCircle className="h-4 w-4" />;
      default: 
        return <Clock className="h-4 w-4" />;
    }
  };

  // Group documents by category
  const groupedDocuments = documents.reduce((acc, doc) => {
    const categoryName = (doc.document_categories as any)?.name || "Uncategorized";
    if (!acc[categoryName]) acc[categoryName] = [];
    acc[categoryName].push(doc);
    return acc;
  }, {} as Record<string, typeof documents>);

  const totalPins = floorPlans.reduce((sum, fp) => sum + (fp.floor_plan_pins?.length || 0), 0);
  const completedInspections = inspections.filter(i => i.status === "completed").length;

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
            {subsection.coc_status && (
              <Badge className={`${getStatusColor(subsection.coc_status)} text-white gap-1.5`}>
                {getStatusIcon(subsection.coc_status)}
                COC: {subsection.coc_status}
              </Badge>
            )}
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
          <div className="grid gap-6 md:grid-cols-2">
            {/* COC Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Certificate of Compliance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {subsection.coc_status ? (
                  <>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge className={`${getStatusColor(subsection.coc_status)} text-white`}>
                        {subsection.coc_status}
                      </Badge>
                    </div>
                    {subsection.coc_number && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <Hash className="h-4 w-4" /> COC Number
                        </span>
                        <span className="font-medium">{subsection.coc_number}</span>
                      </div>
                    )}
                    {subsection.coc_issue_date && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-4 w-4" /> Issue Date
                        </span>
                        <span className="font-medium">
                          {format(new Date(subsection.coc_issue_date), "dd MMM yyyy")}
                        </span>
                      </div>
                    )}
                    {subsection.coc_type && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <Zap className="h-4 w-4" /> Type
                        </span>
                        <span className="font-medium">{subsection.coc_type}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No COC information available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tenant & Meter Details Card */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-primary" />
                  Tenant & Metering
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {subsection.tenant_name && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-sm text-muted-foreground">Tenant Name</span>
                    <span className="font-medium">{subsection.tenant_name}</span>
                  </div>
                )}
                {subsection.meter_serial_number && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-sm text-muted-foreground">Meter Serial</span>
                    <span className="font-mono font-medium">{subsection.meter_serial_number}</span>
                  </div>
                )}
                {subsection.ct_ratio && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <span className="text-sm text-muted-foreground">CT Ratio</span>
                    <span className="font-medium">{subsection.ct_ratio}</span>
                  </div>
                )}
                {!subsection.tenant_name && !subsection.meter_serial_number && !subsection.ct_ratio && (
                  <div className="text-center py-6 text-muted-foreground">
                    <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No tenant or metering information</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

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
                      <p className="text-2xl font-bold">{completedInspections}</p>
                      <p className="text-xs text-muted-foreground">Completed Inspections</p>
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
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                          inspection.status === "completed" ? "bg-emerald-500/10" : "bg-amber-500/10"
                        }`}>
                          <ShieldCheck className={`h-5 w-5 ${
                            inspection.status === "completed" ? "text-emerald-600" : "text-amber-600"
                          }`} />
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
                        <Badge 
                          variant={inspection.status === "completed" ? "default" : "secondary"}
                          className={inspection.status === "completed" ? "bg-emerald-500" : ""}
                        >
                          {inspection.status}
                        </Badge>
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
                  <div className="p-3 rounded-lg bg-muted/50">
                    <span className="text-xs text-muted-foreground block mb-1">Status</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${getInspectionStatusColor(inspectionDetails.status)}`} />
                      <span className="font-semibold capitalize text-sm">{inspectionDetails.status}</span>
                    </div>
                  </div>
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
                  {inspectionDetails.quality_rating && (
                    <div className="p-3 rounded-lg bg-muted/50">
                      <span className="text-xs text-muted-foreground block mb-1">Quality</span>
                      <span className="font-semibold text-sm">{inspectionDetails.quality_rating}/5</span>
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

                {/* Full Sections with Items, Notes & Photos */}
                {inspectionDetails.json_data && typeof inspectionDetails.json_data === 'object' && (() => {
                  const jsonData = inspectionDetails.json_data;
                  // Use template sections as schema if available
                  const templateSections = inspectionDetails.inspection_templates?.sections;
                  const parsedSections: any[] = typeof templateSections === 'string' 
                    ? JSON.parse(templateSections) 
                    : (Array.isArray(templateSections) ? templateSections : []);
                  
                  // If we have template sections, cross-reference with json_data
                  if (parsedSections.length > 0) {
                    return (
                      <div className="space-y-4">
                        <h3 className="text-base font-bold flex items-center gap-2 border-b pb-2">
                          <ShieldCheck className="h-5 w-5 text-primary" />
                          Inspection Results
                        </h3>
                        {parsedSections
                          .filter((s: any) => s.id !== 'observations')
                          .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
                          .map((section: any, sIdx: number) => {
                            const sectionData = jsonData[section.id] || {};
                            return (
                              <div key={sIdx} className="border rounded-lg overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b">
                                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                                    {sIdx + 1}
                                  </div>
                                  <h4 className="font-semibold">{section.name}</h4>
                                  {section.items && (
                                    <Badge variant="secondary" className="ml-auto text-xs">
                                      {section.items.length} items
                                    </Badge>
                                  )}
                                </div>
                                <div className="divide-y">
                                  {section.items?.map((templateItem: any, iIdx: number) => {
                                    const itemData = sectionData[templateItem.id] || {};
                                    const statusVal = (itemData.status || itemData.value || '').toLowerCase();
                                    const isPass = ['pass', 'passed', 'compliant', 'yes'].includes(statusVal);
                                    const isFail = ['fail', 'failed', 'non-compliant', 'no'].includes(statusVal);
                                    const isNA = ['n/a', 'na', 'not applicable'].includes(statusVal);
                                    const photos: string[] = itemData.photos || [];
                                    const hasData = statusVal || itemData.notes || photos.length > 0;

                                    return (
                                      <div key={iIdx} className="p-3">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-sm font-medium">{templateItem.name}</span>
                                          {statusVal ? (
                                            <Badge 
                                              variant="outline"
                                              className={
                                                isPass ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                isFail ? 'bg-red-50 text-red-700 border-red-200' :
                                                isNA ? 'bg-muted text-muted-foreground' :
                                                'bg-blue-50 text-blue-700 border-blue-200'
                                              }
                                            >
                                              {(itemData.status || itemData.value || 'N/A').toUpperCase()}
                                            </Badge>
                                          ) : (
                                            <Badge variant="outline" className="bg-muted text-muted-foreground">
                                              NOT RECORDED
                                            </Badge>
                                          )}
                                        </div>

                                        {itemData.notes && (
                                          <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-100">
                                            <p className="text-xs text-muted-foreground">
                                              <span className="font-semibold">Notes:</span> {itemData.notes}
                                            </p>
                                          </div>
                                        )}

                                        {photos.length > 0 && (
                                          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {photos.map((photo: string, pIdx: number) => (
                                              <div key={pIdx} className="aspect-[4/3] rounded-lg overflow-hidden bg-muted border">
                                                <img 
                                                  src={photo} 
                                                  alt={`${templateItem.name} - Photo ${pIdx + 1}`}
                                                  className="w-full h-full object-contain bg-muted"
                                                   
                                                  onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.style.display = 'none';
                                                  }}
                                                />
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}

                        {/* Observations section if present */}
                        {jsonData.observations && (
                          <div className="border rounded-lg overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b">
                              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                                ✎
                              </div>
                              <h4 className="font-semibold">Observations & Quality</h4>
                            </div>
                            <div className="p-4 space-y-3">
                              {jsonData.observations.comments?.value && (
                                <div>
                                  <span className="text-sm font-medium">Comments</span>
                                  <p className="text-sm text-muted-foreground mt-1">{jsonData.observations.comments.value}</p>
                                </div>
                              )}
                              {jsonData.observations.qualityRating?.value && (
                                <div>
                                  <span className="text-sm font-medium">Quality Rating</span>
                                  <p className="text-sm font-bold mt-1">{jsonData.observations.qualityRating.value}/5</p>
                                </div>
                              )}
                              {jsonData.observations.comments?.notes && (
                                <div className="p-2 rounded bg-amber-50 border border-amber-100">
                                  <p className="text-xs text-muted-foreground">
                                    <span className="font-semibold">Notes:</span> {jsonData.observations.comments.notes}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Fallback: if json_data has a 'sections' array (alternative format)
                  if (jsonData.sections?.length > 0) {
                    return (
                      <div className="space-y-4">
                        <h3 className="text-base font-bold flex items-center gap-2 border-b pb-2">
                          <ShieldCheck className="h-5 w-5 text-primary" />
                          Inspection Results
                        </h3>
                        {jsonData.sections.map((section: any, sIdx: number) => (
                          <div key={sIdx} className="border rounded-lg overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b">
                              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                                {sIdx + 1}
                              </div>
                              <h4 className="font-semibold">{section.name || `Section ${sIdx + 1}`}</h4>
                            </div>
                            <div className="divide-y">
                              {section.items?.map((item: any, iIdx: number) => (
                                <div key={iIdx} className="p-3 flex items-center justify-between">
                                  <span className="text-sm">{item.name || item.label}</span>
                                  <Badge variant="outline">{item.status || item.value || 'Pending'}</Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  
                  // Last fallback: render raw json_data keys as sections
                  const skipKeys = ['tenants', 'generalInfo', 'subsectionId'];
                  const dataKeys = Object.keys(jsonData).filter(k => !skipKeys.includes(k) && typeof jsonData[k] === 'object' && jsonData[k] !== null);
                  if (dataKeys.length > 0) {
                    return (
                      <div className="space-y-4">
                        <h3 className="text-base font-bold flex items-center gap-2 border-b pb-2">
                          <ShieldCheck className="h-5 w-5 text-primary" />
                          Inspection Results
                        </h3>
                        {dataKeys.map((key, sIdx) => {
                          const sectionData = jsonData[key];
                          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                          const subItems = Object.entries(sectionData).filter(([, v]) => typeof v === 'object' && v !== null);
                          return (
                            <div key={sIdx} className="border rounded-lg overflow-hidden">
                              <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b">
                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                                  {sIdx + 1}
                                </div>
                                <h4 className="font-semibold">{label}</h4>
                              </div>
                              <div className="divide-y">
                                {subItems.map(([itemKey, itemVal]: [string, any]) => {
                                  const itemLabel = itemKey.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                                  const photos: string[] = itemVal?.photos || [];
                                  return (
                                    <div key={itemKey} className="p-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium">{itemLabel}</span>
                                        {itemVal?.status && (
                                          <Badge variant="outline">{itemVal.status}</Badge>
                                        )}
                                      </div>
                                      {itemVal?.notes && (
                                        <p className="text-xs text-muted-foreground mt-1">Notes: {itemVal.notes}</p>
                                      )}
                                      {photos.length > 0 && (
                                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                          {photos.map((photo: string, pIdx: number) => (
                                            <div key={pIdx} className="aspect-[4/3] rounded-lg overflow-hidden bg-muted border">
                                              <img src={photo} alt={`${itemLabel} photo`} className="w-full h-full object-contain bg-muted"
                                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  
                  return null;
                })()}

                {/* Tenant Information */}
                {inspectionDetails.json_data?.tenants?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-base font-bold flex items-center gap-2 border-b pb-2">
                      <User className="h-5 w-5 text-primary" />
                      Tenant Information
                    </h3>
                    <div className="grid gap-3">
                      {inspectionDetails.json_data.tenants.map((tenant: any, tIdx: number) => (
                        <Card key={tIdx}>
                          <CardContent className="p-4">
                            <h5 className="font-semibold mb-2">{tenant.shopName || tenant.shop_name || `Tenant ${tIdx + 1}`}</h5>
                            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                              {(tenant.shopNumber || tenant.shop_number) && (
                                <div><span className="text-muted-foreground">Shop #:</span> {tenant.shopNumber || tenant.shop_number}</div>
                              )}
                              {(tenant.meterSerialNumber || tenant.meter_serial_number) && (
                                <div><span className="text-muted-foreground">Meter S/N:</span> {tenant.meterSerialNumber || tenant.meter_serial_number}</div>
                              )}
                              {(tenant.breakerSize || tenant.breaker_size) && (
                                <div><span className="text-muted-foreground">Breaker:</span> {tenant.breakerSize || tenant.breaker_size}</div>
                              )}
                              {(tenant.ctSizeAndRatio || tenant.ct_ratio) && (
                                <div><span className="text-muted-foreground">CT Ratio:</span> {tenant.ctSizeAndRatio || tenant.ct_ratio}</div>
                              )}
                            </div>
                            {/* Tenant verification photos */}
                            {(() => {
                              const tenantPhotos = [
                                tenant.meterImage || tenant.meter_image,
                                tenant.breakerImage || tenant.breaker_image,
                                tenant.ctRatioImage || tenant.ct_ratio_image,
                              ].filter(Boolean);
                              if (tenantPhotos.length === 0) return null;
                              return (
                                <div className="grid grid-cols-3 gap-2">
                                  {tenantPhotos.map((photo: string, pIdx: number) => (
                                    <div key={pIdx} className="aspect-[4/3] rounded-lg overflow-hidden bg-muted border">
                                      <img 
                                        src={photo} 
                                        alt={`Tenant verification ${pIdx + 1}`}
                                        className="w-full h-full object-contain bg-muted"
                                        
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {/* Signatures */}
                {inspectionDetails.inspection_signatures?.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-base font-bold flex items-center gap-2 border-b pb-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      Digital Signatures
                    </h3>
                    <div className="space-y-2">
                      {inspectionDetails.inspection_signatures.map((sig: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg border">
                          <div>
                            <p className="font-medium text-sm">{sig.signer_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{sig.signer_type}</p>
                          </div>
                          <div className="flex items-center gap-2 text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-xs">
                              {sig.signed_at ? format(new Date(sig.signed_at), "dd MMM yyyy HH:mm") : 'Signed'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
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