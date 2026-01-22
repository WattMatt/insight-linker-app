import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  ArrowLeft,
  Download, 
  FileText, 
  Eye, 
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Building2,
  Zap,
  Shield,
  FolderOpen,
  ClipboardList,
  Gauge,
  Calendar,
  Hash,
  MapPin,
  FileCheck,
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { downloadFile } from "@/lib/fileDownload";

interface SubsectionData {
  id: string;
  name: string;
  tenant_name?: string;
  description?: string;
  category?: string;
  coc_number?: string;
  coc_type?: string;
  coc_issue_date?: string;
  is_coc_required: boolean;
  coc_status?: string;
  metering_status?: string;
  meter_serial_number?: string;
  ct_ratio?: string;
}

interface SiteData {
  id: string;
  name: string;
  address?: string;
  client_logo_url?: string;
}

interface ClientData {
  id: string;
  name: string;
  company_name?: string;
  logo_url?: string;
}

interface DocumentFile {
  id: string;
  file_name: string;
  file_url: string;
  category_name?: string;
  uploaded_at?: string;
}

interface SnagData {
  id: string;
  title: string;
  description?: string;
  status: string;
  risk_level?: string;
  created_at: string;
}

interface InspectionData {
  id: string;
  title: string;
  status: string;
  inspection_date?: string;
  template_name?: string;
}

const PublicSubsectionReview = () => {
  const { token, subsectionId } = useParams<{ token: string; subsectionId: string }>();
  const navigate = useNavigate();
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [snags, setSnags] = useState<SnagData[]>([]);
  const [inspections, setInspections] = useState<InspectionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companySettings, setCompanySettings] = useState<{ company_name: string; company_logo_url?: string } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (token && subsectionId) {
      validateAndFetchData();
    }
  }, [token, subsectionId]);

  const validateAndFetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validate the access token
      const { data: linkResult, error: linkError } = await supabase
        .rpc('validate_access_link', { token });

      if (linkError) {
        console.error("Error validating link:", linkError);
        setError("Unable to validate access link");
        return;
      }

      if (!linkResult || linkResult.length === 0 || !linkResult[0].is_valid) {
        setError("This link is invalid or has expired");
        return;
      }

      // Fetch company settings
      const { data: settings } = await supabase
        .from('settings')
        .select('company_name, company_logo_url')
        .maybeSingle();

      if (settings) {
        setCompanySettings(settings);
      }

      // Fetch subsection data with site and client
      const { data: subsectionData, error: subsectionError } = await supabase
        .from('subsections')
        .select(`
          *,
          sites!inner (
            id,
            name,
            address,
            client_logo_url,
            clients!inner (
              id,
              name,
              company_name,
              logo_url
            )
          )
        `)
        .eq('id', subsectionId)
        .single();

      if (subsectionError || !subsectionData) {
        setError("Subsection not found");
        return;
      }

      // Verify the subsection belongs to the site from the access link
      const linkData = linkResult[0];
      if (linkData.site_id && subsectionData.sites.id !== linkData.site_id) {
        setError("You don't have access to this subsection");
        return;
      }

      setSubsection(subsectionData);
      setSiteData(subsectionData.sites);
      setClientData(subsectionData.sites.clients);

      // Fetch documents
      const { data: docsData } = await supabase
        .from('subsection_documents')
        .select(`
          id,
          file_name,
          file_url,
          uploaded_at,
          document_categories (name)
        `)
        .eq('subsection_id', subsectionId);

      if (docsData) {
        setDocuments(docsData.map(doc => ({
          id: doc.id,
          file_name: doc.file_name,
          file_url: doc.file_url,
          category_name: doc.document_categories?.name,
          uploaded_at: doc.uploaded_at
        })));
      }

      // Fetch snags
      const { data: snagsData } = await supabase
        .from('snags')
        .select('*')
        .eq('subsection_id', subsectionId)
        .order('created_at', { ascending: false });

      if (snagsData) {
        setSnags(snagsData);
      }

      // Fetch inspections
      const { data: inspectionsData } = await supabase
        .from('inspections')
        .select(`
          id,
          title,
          status,
          inspection_date,
          inspection_templates (name)
        `)
        .eq('subsection_id', subsectionId)
        .order('inspection_date', { ascending: false });

      if (inspectionsData) {
        setInspections(inspectionsData.map(insp => ({
          id: insp.id,
          title: insp.title,
          status: insp.status,
          inspection_date: insp.inspection_date,
          template_name: insp.inspection_templates?.name
        })));
      }

    } catch (err) {
      console.error("Error fetching data:", err);
      setError("An error occurred while loading data");
    } finally {
      setLoading(false);
    }
  };

  const getCocStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return 'bg-green-500';
      case 'failed': return 'bg-destructive';
      case 'pending': return 'bg-amber-500';
      default: return 'bg-muted';
    }
  };

  const getCocStatusIcon = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'approved': return <CheckCircle2 className="h-4 w-4" />;
      case 'failed': return <XCircle className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      default: return <Info className="h-4 w-4" />;
    }
  };

  const getSnagRiskColor = (risk?: string) => {
    switch (risk?.toLowerCase()) {
      case 'critical': return 'bg-red-100 border-red-300 text-red-800';
      case 'high': return 'bg-orange-100 border-orange-300 text-orange-800';
      case 'medium': return 'bg-amber-100 border-amber-300 text-amber-800';
      case 'low': return 'bg-blue-100 border-blue-300 text-blue-800';
      default: return 'bg-muted border-border text-muted-foreground';
    }
  };

  const getInspectionStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': return 'bg-green-500';
      case 'in_progress': return 'bg-amber-500';
      case 'scheduled': return 'bg-blue-500';
      default: return 'bg-muted';
    }
  };

  // Group documents by category
  const groupedDocuments = documents.reduce((acc, doc) => {
    const category = doc.category_name || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(doc);
    return acc;
  }, {} as Record<string, DocumentFile[]>);

  // Calculate stats
  const openSnags = snags.filter(s => s.status !== 'rectified').length;
  const completedInspections = inspections.filter(i => i.status === 'completed').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading subsection...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-lg">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!subsection || !siteData) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {companySettings?.company_logo_url && (
                <img 
                  src={companySettings.company_logo_url} 
                  alt="Company Logo" 
                  className="h-10 object-contain"
                />
              )}
              {clientData?.logo_url && (
                <>
                  <div className="h-8 w-px bg-border" />
                  <img 
                    src={clientData.logo_url} 
                    alt="Client Logo" 
                    className="h-10 object-contain"
                  />
                </>
              )}
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate(`/review/${token}`)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Site
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5" />
        <div className="container mx-auto px-4 py-8">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Building2 className="h-4 w-4" />
            <button 
              onClick={() => navigate(`/review/${token}`)}
              className="hover:text-primary transition-colors"
            >
              {siteData.name}
            </button>
            <span>/</span>
            <span className="text-foreground font-medium">{subsection.name}</span>
          </div>

          <div className="grid lg:grid-cols-3 gap-8 items-start">
            {/* Main Info */}
            <div className="lg:col-span-2">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold mb-2">{subsection.name}</h1>
                  {subsection.tenant_name && (
                    <p className="text-lg text-muted-foreground">
                      Tenant: {subsection.tenant_name}
                    </p>
                  )}
                </div>
                <Badge className={`${getCocStatusColor(subsection.coc_status)} text-white px-3 py-1.5 text-sm`}>
                  {getCocStatusIcon(subsection.coc_status)}
                  <span className="ml-1.5">{subsection.coc_status || 'Unknown'}</span>
                </Badge>
              </div>

              {subsection.description && (
                <p className="text-muted-foreground mb-6">{subsection.description}</p>
              )}

              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {subsection.category && (
                  <div className="bg-white/80 backdrop-blur rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Category</p>
                    <p className="font-medium text-sm">{subsection.category}</p>
                  </div>
                )}
                {subsection.coc_number && (
                  <div className="bg-white/80 backdrop-blur rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">COC Number</p>
                    <p className="font-medium text-sm">{subsection.coc_number}</p>
                  </div>
                )}
                {subsection.coc_issue_date && (
                  <div className="bg-white/80 backdrop-blur rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">Issue Date</p>
                    <p className="font-medium text-sm">{new Date(subsection.coc_issue_date).toLocaleDateString()}</p>
                  </div>
                )}
                {subsection.coc_type && (
                  <div className="bg-white/80 backdrop-blur rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground mb-1">COC Type</p>
                    <p className="font-medium text-sm">{subsection.coc_type}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Metering Card */}
            <Card className="bg-white/80 backdrop-blur border-2 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Gauge className="h-5 w-5 text-primary" />
                  Metering Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {subsection.meter_serial_number ? (
                  <>
                    <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                      <Zap className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-xs text-muted-foreground">Serial Number</p>
                        <p className="font-mono font-semibold">{subsection.meter_serial_number}</p>
                      </div>
                    </div>
                    {subsection.ct_ratio && (
                      <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                        <Hash className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">CT Ratio</p>
                          <p className="font-medium">{subsection.ct_ratio}</p>
                        </div>
                      </div>
                    )}
                    {subsection.metering_status && (
                      <div className="flex items-center justify-between pt-2 border-t">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <Badge variant="outline" className="font-medium">
                          {subsection.metering_status}
                        </Badge>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Zap className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No meter assigned</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* KPI Stats */}
      <section className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">{documents.length}</div>
              <div className="text-sm text-muted-foreground">Documents</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-white border-green-200">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-green-600 mb-1">{completedInspections}</div>
              <div className="text-sm text-muted-foreground">Inspections</div>
            </CardContent>
          </Card>
          <Card className={`bg-gradient-to-br ${openSnags > 0 ? 'from-amber-50 to-white border-amber-200' : 'from-green-50 to-white border-green-200'}`}>
            <CardContent className="p-4 text-center">
              <div className={`text-3xl font-bold mb-1 ${openSnags > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {openSnags}
              </div>
              <div className="text-sm text-muted-foreground">Open Snags</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-200">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-purple-600 mb-1">
                {snags.filter(s => s.status === 'rectified').length}
              </div>
              <div className="text-sm text-muted-foreground">Resolved</div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Tabs Content */}
      <section className="container mx-auto px-4 pb-12">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="gap-2">
              <Shield className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="inspections" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Inspections
            </TabsTrigger>
            <TabsTrigger value="issues" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Issues
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* COC Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5 text-primary" />
                    Certificate of Compliance
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm text-muted-foreground">Status</span>
                      <Badge className={`${getCocStatusColor(subsection.coc_status)} text-white`}>
                        {subsection.coc_status || 'Not Available'}
                      </Badge>
                    </div>
                    {subsection.coc_number && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <span className="text-sm text-muted-foreground">Certificate Number</span>
                        <span className="font-mono font-medium">{subsection.coc_number}</span>
                      </div>
                    )}
                    {subsection.coc_type && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <span className="text-sm text-muted-foreground">Type</span>
                        <span className="font-medium">{subsection.coc_type}</span>
                      </div>
                    )}
                    {subsection.coc_issue_date && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <span className="text-sm text-muted-foreground">Issue Date</span>
                        <span className="font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {new Date(subsection.coc_issue_date).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    {!subsection.coc_number && !subsection.coc_type && (
                      <div className="text-center py-6 text-muted-foreground">
                        <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
                        <p>No COC details available</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  {inspections.length > 0 || snags.length > 0 ? (
                    <div className="space-y-3">
                      {inspections.slice(0, 3).map((insp) => (
                        <div key={insp.id} className="flex items-center gap-3 p-3 rounded-lg border">
                          <div className={`w-2 h-2 rounded-full ${getInspectionStatusColor(insp.status)}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{insp.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {insp.inspection_date ? new Date(insp.inspection_date).toLocaleDateString() : 'No date'}
                            </p>
                          </div>
                          <Badge variant="outline" className="text-xs">{insp.status}</Badge>
                        </div>
                      ))}
                      {snags.slice(0, 2).map((snag) => (
                        <div key={snag.id} className="flex items-center gap-3 p-3 rounded-lg border">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{snag.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(snag.created_at).toLocaleDateString()}
                            </p>
                          </div>
                          <Badge variant={snag.status === 'rectified' ? 'secondary' : 'destructive'} className="text-xs">
                            {snag.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="h-10 w-10 mx-auto mb-2 opacity-30" />
                      <p>No recent activity</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
                <CardDescription>
                  {documents.length} document{documents.length !== 1 ? 's' : ''} available
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documents.length > 0 ? (
                  <Accordion type="multiple" defaultValue={[]} className="space-y-2">
                    {Object.entries(groupedDocuments).map(([category, docs]) => (
                      <AccordionItem key={category} value={category} className="border rounded-lg px-4">
                        <AccordionTrigger className="hover:no-underline py-3">
                          <div className="flex items-center gap-3">
                            <FolderOpen className="h-5 w-5 text-primary" />
                            <span className="font-medium">{category}</span>
                            <Badge variant="secondary" className="ml-2">{docs.length}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="space-y-2 mt-2">
                            {docs.map((doc) => (
                              <div 
                                key={doc.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                              >
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{doc.file_name}</p>
                                    {doc.uploaded_at && (
                                      <p className="text-xs text-muted-foreground">
                                        {new Date(doc.uploaded_at).toLocaleDateString()}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => setPreviewDocument({ url: doc.file_url, name: doc.file_name })}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => downloadFile(doc.file_url, doc.file_name)}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No documents available</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inspections Tab */}
          <TabsContent value="inspections" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Inspections</CardTitle>
                <CardDescription>
                  {inspections.length} inspection{inspections.length !== 1 ? 's' : ''} recorded
                </CardDescription>
              </CardHeader>
              <CardContent>
                {inspections.length > 0 ? (
                  <div className="space-y-3">
                    {inspections.map((insp) => (
                      <div 
                        key={insp.id}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-3 h-3 rounded-full ${getInspectionStatusColor(insp.status)}`} />
                          <div>
                            <p className="font-medium">{insp.title}</p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                              {insp.template_name && (
                                <span>{insp.template_name}</span>
                              )}
                              {insp.inspection_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(insp.inspection_date).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge 
                          variant={insp.status === 'completed' ? 'default' : 'secondary'}
                          className={insp.status === 'completed' ? 'bg-green-500' : ''}
                        >
                          {insp.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>No inspections recorded</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Issues Tab */}
          <TabsContent value="issues" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Outstanding Issues
                </CardTitle>
                <CardDescription>
                  {openSnags} open issue{openSnags !== 1 ? 's' : ''} • {snags.filter(s => s.status === 'rectified').length} resolved
                </CardDescription>
              </CardHeader>
              <CardContent>
                {snags.length > 0 ? (
                  <div className="space-y-4">
                    {snags.map((snag) => (
                      <div 
                        key={snag.id}
                        className={`p-4 rounded-lg border ${snag.status === 'rectified' ? 'bg-green-50/50 border-green-200' : 'bg-white'}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium">{snag.title}</h4>
                          <Badge 
                            variant={snag.status === 'rectified' ? 'secondary' : 'destructive'}
                            className={snag.status === 'rectified' ? 'bg-green-500 text-white' : ''}
                          >
                            {snag.status === 'rectified' ? 'Resolved' : snag.status}
                          </Badge>
                        </div>
                        {snag.description && (
                          <p className="text-sm text-muted-foreground mb-3">{snag.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs">
                          {snag.risk_level && (
                            <Badge variant="outline" className={getSnagRiskColor(snag.risk_level)}>
                              {snag.risk_level.charAt(0).toUpperCase() + snag.risk_level.slice(1)} Risk
                            </Badge>
                          )}
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(snag.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500 opacity-50" />
                    <p className="font-medium text-green-600">No issues reported</p>
                    <p className="text-sm mt-1">This subsection has a clean record</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      {/* Document Preview Dialog */}
      {previewDocument && (
        <DocumentPreviewDialog
          open={!!previewDocument}
          onOpenChange={(open) => !open && setPreviewDocument(null)}
          fileUrl={previewDocument.url}
          fileName={previewDocument.name}
        />
      )}
    </div>
  );
};

export default PublicSubsectionReview;
