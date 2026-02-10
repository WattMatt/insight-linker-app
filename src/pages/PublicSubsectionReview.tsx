import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { 
  FAILED_VALIDATION_STATUSES,
  hasValidCocStatus 
} from "@/lib/complianceCalculations";

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
  is_compliant?: boolean;
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
  file_size?: number;
}

interface SnagData {
  id: string;
  title: string;
  description?: string;
  status: string;
  risk_level?: string;
  created_at: string;
  rectified_at?: string;
  rectification_notes?: string;
}

interface InspectionData {
  id: string;
  title: string;
  status: string;
  inspection_date?: string;
  template_name?: string;
  inspector_name?: string;
  quality_rating?: number;
}

interface ValidationData {
  id: string;
  status: string;
  validated_at: string;
  violations?: any[];
}

interface FloorPlanData {
  id: string;
  file_name: string;
  file_url: string;
  pins_count: number;
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
  const [latestValidation, setLatestValidation] = useState<ValidationData | null>(null);
  const [floorPlans, setFloorPlans] = useState<FloorPlanData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companySettings, setCompanySettings] = useState<{ company_name: string; company_logo_url?: string } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string } | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<InspectionData | null>(null);
  const [inspectionDetails, setInspectionDetails] = useState<any | null>(null);
  const [loadingInspection, setLoadingInspection] = useState(false);

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

      // Fetch documents with file size
      const { data: docsData } = await supabase
        .from('subsection_documents')
        .select(`
          id,
          file_name,
          file_url,
          uploaded_at,
          file_size,
          document_categories (name)
        `)
        .eq('subsection_id', subsectionId)
        .order('uploaded_at', { ascending: false });

      if (docsData) {
        setDocuments(docsData.map(doc => ({
          id: doc.id,
          file_name: doc.file_name,
          file_url: doc.file_url,
          category_name: doc.document_categories?.name,
          uploaded_at: doc.uploaded_at,
          file_size: doc.file_size || undefined
        })));
      }

      // Fetch snags with rectification data
      const { data: snagsData } = await supabase
        .from('snags')
        .select('id, title, description, status, risk_level, created_at, rectified_at, rectification_notes')
        .eq('subsection_id', subsectionId)
        .order('created_at', { ascending: false });

      if (snagsData) {
        setSnags(snagsData);
      }

      // Fetch inspections with inspector info
      const { data: inspectionsData } = await supabase
        .from('inspections')
        .select(`
          id,
          title,
          status,
          inspection_date,
          inspector_name,
          quality_rating,
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
          template_name: insp.inspection_templates?.name,
          inspector_name: insp.inspector_name || undefined,
          quality_rating: insp.quality_rating || undefined
        })));
      }

      // Fetch latest COC validation for this subsection
      const { data: validationData } = await supabase
        .from('coc_validations')
        .select('id, status, validated_at, violations')
        .eq('subsection_id', subsectionId)
        .order('validated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (validationData) {
        setLatestValidation({
          id: validationData.id,
          status: validationData.status,
          validated_at: validationData.validated_at,
          violations: validationData.violations as any[] || []
        });
      }

      // Fetch floor plans with pin count
      const { data: floorPlanData } = await supabase
        .from('subsection_floor_plans')
        .select(`
          id,
          file_name,
          file_url,
          floor_plan_pins (id)
        `)
        .eq('subsection_id', subsectionId);

      if (floorPlanData) {
        setFloorPlans(floorPlanData.map(fp => ({
          id: fp.id,
          file_name: fp.file_name,
          file_url: fp.file_url,
          pins_count: fp.floor_plan_pins?.length || 0
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

  // Calculate stats from actual data using consistent status checks
  // Snag status normalization: treat 'Rectified', 'rectified', 'Closed' as resolved
  const normalizeSnagStatus = (status: string) => status?.toLowerCase();
  const openSnags = snags.filter(s => {
    const status = normalizeSnagStatus(s.status);
    return status !== 'rectified' && status !== 'closed';
  }).length;
  const rectifiedSnags = snags.filter(s => {
    const status = normalizeSnagStatus(s.status);
    return status === 'rectified' || status === 'closed';
  }).length;
  const completedInspections = inspections.filter(i => i.status?.toLowerCase() === 'completed').length;
  const totalFloorPlanPins = floorPlans.reduce((sum, fp) => sum + fp.pins_count, 0);
  
  // Determine effective compliance status using shared logic from complianceCalculations.ts
  // A subsection is compliant if:
  // 1. COC is not required, OR
  // 2. COC is required AND has a valid status AND no failed validations
  const getEffectiveComplianceStatus = (): string => {
    // If COC is not required, it's compliant by default
    if (!subsection?.is_coc_required) return 'Compliant';
    
    // Check latest validation first (most authoritative)
    if (latestValidation) {
      const validationStatus = latestValidation.status;
      if (FAILED_VALIDATION_STATUSES.includes(validationStatus as any)) {
        return 'Non-Compliant';
      }
      if (validationStatus === 'Pass' || validationStatus === 'Passed') {
        return 'Compliant';
      }
    }
    
    // Fallback to COC status field using shared utility
    if (hasValidCocStatus(subsection?.coc_status)) {
      return 'Compliant';
    }
    
    return 'Pending Review';
  };
  
  const effectiveComplianceStatus = getEffectiveComplianceStatus();

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className={`bg-gradient-to-br ${
            effectiveComplianceStatus === 'Compliant' 
              ? 'from-green-50 to-white border-green-200' 
              : effectiveComplianceStatus === 'Non-Compliant'
              ? 'from-red-50 to-white border-red-200'
              : 'from-amber-50 to-white border-amber-200'
          }`}>
            <CardContent className="p-4 text-center">
              <div className={`text-lg font-bold mb-1 ${
                effectiveComplianceStatus === 'Compliant' ? 'text-green-600' : 
                effectiveComplianceStatus === 'Non-Compliant' ? 'text-red-600' : 'text-amber-600'
              }`}>
                {effectiveComplianceStatus}
              </div>
              <div className="text-sm text-muted-foreground">Status</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-blue-600 mb-1">{documents.length}</div>
              <div className="text-sm text-muted-foreground">Documents</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-200">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-indigo-600 mb-1">{inspections.length}</div>
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
          <Card className="bg-gradient-to-br from-emerald-50 to-white border-emerald-200">
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold text-emerald-600 mb-1">
                {rectifiedSnags}
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
                      <span className="text-sm text-muted-foreground">COC Status</span>
                      <Badge className={`${getCocStatusColor(subsection.coc_status)} text-white`}>
                        {subsection.coc_status || 'Not Available'}
                      </Badge>
                    </div>
                    {latestValidation && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <span className="text-sm text-muted-foreground">Validation Result</span>
                        <div className="flex items-center gap-2">
                          <Badge className={`${
                            latestValidation.status === 'Pass' ? 'bg-green-500' : 
                            latestValidation.status === 'Fail' ? 'bg-destructive' : 
                            'bg-amber-500'
                          } text-white`}>
                            {latestValidation.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(latestValidation.validated_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    )}
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
                    {latestValidation?.violations && latestValidation.violations.length > 0 && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm font-medium text-destructive mb-2">
                          {latestValidation.violations.length} Validation Issue{latestValidation.violations.length !== 1 ? 's' : ''}
                        </p>
                        <div className="space-y-2 max-h-40 overflow-y-auto">
                          {latestValidation.violations.slice(0, 5).map((v: any, i: number) => (
                            <div key={i} className="text-xs p-2 rounded bg-destructive/10 text-destructive">
                              {v.message || v.description || JSON.stringify(v)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!subsection.coc_number && !subsection.coc_type && !latestValidation && (
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
                  {inspections.length} inspection{inspections.length !== 1 ? 's' : ''} recorded • {completedInspections} completed
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
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                              {insp.template_name && (
                                <span className="flex items-center gap-1">
                                  <ClipboardList className="h-3 w-3" />
                                  {insp.template_name}
                                </span>
                              )}
                              {insp.inspection_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(insp.inspection_date).toLocaleDateString()}
                                </span>
                              )}
                              {insp.inspector_name && (
                                <span className="flex items-center gap-1">
                                  <Eye className="h-3 w-3" />
                                  {insp.inspector_name}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {insp.quality_rating && insp.quality_rating > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {insp.quality_rating}/5
                            </Badge>
                          )}
                          <Badge 
                            variant={insp.status?.toLowerCase() === 'completed' ? 'default' : 'secondary'}
                            className={insp.status?.toLowerCase() === 'completed' ? 'bg-green-500 text-white' : ''}
                          >
                            {insp.status || 'Unknown'}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedInspection(insp)}
                            className="gap-1"
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                        </div>
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
                  {openSnags} open issue{openSnags !== 1 ? 's' : ''} • {rectifiedSnags} resolved
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
                            {snag.status === 'rectified' ? 'Resolved' : snag.status || 'Open'}
                          </Badge>
                        </div>
                        {snag.description && (
                          <p className="text-sm text-muted-foreground mb-3">{snag.description}</p>
                        )}
                        {snag.status === 'rectified' && snag.rectification_notes && (
                          <div className="p-2 bg-green-100/50 rounded text-sm text-green-800 mb-3">
                            <span className="font-medium">Resolution: </span>
                            {snag.rectification_notes}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                          {snag.risk_level && (
                            <Badge variant="outline" className={getSnagRiskColor(snag.risk_level)}>
                              {snag.risk_level.charAt(0).toUpperCase() + snag.risk_level.slice(1)} Risk
                            </Badge>
                          )}
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Created: {new Date(snag.created_at).toLocaleDateString()}
                          </span>
                          {snag.rectified_at && (
                            <span className="text-green-600 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Resolved: {new Date(snag.rectified_at).toLocaleDateString()}
                            </span>
                          )}
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
                      <span className="font-semibold text-sm">{new Date(inspectionDetails.inspection_date).toLocaleDateString()}</span>
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

                {inspectionDetails.description && (
                  <div className="p-4 rounded-lg border bg-muted/20">
                    <h4 className="text-sm font-semibold mb-1">Description</h4>
                    <p className="text-sm text-muted-foreground">{inspectionDetails.description}</p>
                  </div>
                )}

                {/* Full Sections - Template-aware rendering */}
                {inspectionDetails.json_data && typeof inspectionDetails.json_data === 'object' && (() => {
                  const jsonData = inspectionDetails.json_data;
                  const templateSections = inspectionDetails.inspection_templates?.sections;
                  const parsedSections: any[] = typeof templateSections === 'string' 
                    ? JSON.parse(templateSections) 
                    : (Array.isArray(templateSections) ? templateSections : []);
                  
                  if (parsedSections.length > 0) {
                    return (
                      <div className="space-y-4">
                        <h3 className="text-base font-bold flex items-center gap-2 border-b pb-2">
                          <Shield className="h-5 w-5 text-primary" />
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
                                                  className="w-full h-full object-cover"
                                                  crossOrigin="anonymous"
                                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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

                        {jsonData.observations && (
                          <div className="border rounded-lg overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b">
                              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">✎</div>
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
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Fallback: raw json_data keys as sections
                  const skipKeys = ['tenants', 'generalInfo', 'subsectionId'];
                  const dataKeys = Object.keys(jsonData).filter(k => !skipKeys.includes(k) && typeof jsonData[k] === 'object' && jsonData[k] !== null);
                  if (dataKeys.length > 0) {
                    return (
                      <div className="space-y-4">
                        <h3 className="text-base font-bold flex items-center gap-2 border-b pb-2">
                          <Shield className="h-5 w-5 text-primary" />
                          Inspection Results
                        </h3>
                        {dataKeys.map((key, sIdx) => {
                          const sectionData = jsonData[key];
                          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
                          const subItems = Object.entries(sectionData).filter(([, v]) => typeof v === 'object' && v !== null);
                          return (
                            <div key={sIdx} className="border rounded-lg overflow-hidden">
                              <div className="flex items-center gap-3 px-4 py-3 bg-primary/5 border-b">
                                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">{sIdx + 1}</div>
                                <h4 className="font-semibold">{label}</h4>
                              </div>
                              <div className="divide-y">
                                {subItems.map(([itemKey, itemVal]: [string, any]) => {
                                  const itemLabel = itemKey.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase());
                                  const photos: string[] = itemVal?.photos || [];
                                  return (
                                    <div key={itemKey} className="p-3">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-sm font-medium">{itemLabel}</span>
                                        {itemVal?.status && <Badge variant="outline">{itemVal.status}</Badge>}
                                      </div>
                                      {itemVal?.notes && <p className="text-xs text-muted-foreground mt-1">Notes: {itemVal.notes}</p>}
                                      {photos.length > 0 && (
                                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                                          {photos.map((photo: string, pIdx: number) => (
                                            <div key={pIdx} className="aspect-[4/3] rounded-lg overflow-hidden bg-muted border">
                                              <img src={photo} alt={`${itemLabel} photo`} className="w-full h-full object-cover" crossOrigin="anonymous"
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
                      <Building2 className="h-5 w-5 text-primary" />
                      Tenant Information
                    </h3>
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
                                    <img src={photo} alt={`Tenant photo ${pIdx + 1}`} className="w-full h-full object-cover" crossOrigin="anonymous"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </CardContent>
                      </Card>
                    ))}
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
                              {sig.signed_at ? new Date(sig.signed_at).toLocaleDateString() : 'Signed'}
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
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Unable to load inspection details</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicSubsectionReview;
