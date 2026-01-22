import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { 
  Building2, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock,
  MapPin,
  Zap,
  Shield,
  BarChart3,
  Download,
  Eye,
  Loader2,
  LayoutGrid,
  Workflow,
  ShieldCheck,
  Layers,
  FileBarChart,
  Search
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SchematicDiagram } from "@/components/site/SchematicDiagram";
import { AssetVerification } from "@/components/site/AssetVerification";
import { ComplianceDashboard } from "@/components/ComplianceDashboard";
import { SiteReports } from "@/components/site/SiteReports";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { downloadFile } from "@/lib/fileDownload";
import { Site, Subsection } from "@/types/site";

interface LocalComplianceStats {
  approved: number;
  pending: number;
  failed: number;
  missing: number;
  notRequired: number;
  total: number;
}

interface SiteData {
  id: string;
  name: string;
  address?: string;
  site_type?: string;
  site_image_url?: string;
  status?: string;
  supply_authority?: string;
  nominated_max_demand?: string;
}

interface ClientData {
  id: string;
  name: string;
  company_name?: string;
  logo_url?: string;
}

interface SubsectionData {
  id: string;
  name: string;
  description?: string;
  tenant_name?: string;
  category?: string;
  coc_status?: string;
  coc_type?: string;
  is_coc_required: boolean;
  metering_status?: string;
  meter_serial_number?: string;
  is_compliant?: boolean;
}

interface SnagData {
  id: string;
  subsection_id: string;
  title: string;
  status: string;
  risk_level?: string;
}

interface ValidationData {
  id: string;
  subsection_id: string;
  status: string;
}

interface DocumentData {
  id: string;
  file_name: string;
  file_url: string;
  category?: string;
  created_at: string;
}

interface InspectionData {
  id: string;
  subsection_id: string | null;
  inspection_date: string;
  json_data: any;
  status?: string;
}

interface LinkData {
  link_type: string;
  client_id: string | null;
  site_id: string | null;
  subsection_id: string | null;
  is_valid: boolean;
}

const PublicSiteReview = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [site, setSite] = useState<SiteData | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [subsections, setSubsections] = useState<SubsectionData[]>([]);
  const [snags, setSnags] = useState<SnagData[]>([]);
  const [validations, setValidations] = useState<ValidationData[]>([]);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [inspections, setInspections] = useState<InspectionData[]>([]);
  const [companySettings, setCompanySettings] = useState<{ company_name: string; company_logo_url?: string } | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [subsectionSearch, setSubsectionSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string } | null>(null);

  useEffect(() => {
    if (token) {
      validateAndFetchData();
    }
  }, [token]);

  const validateAndFetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validate the access token using the database function
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

      const link = linkResult[0];
      setLinkData(link);

      // Fetch company settings
      const { data: settings } = await supabase
        .from('settings')
        .select('company_name, company_logo_url')
        .maybeSingle();
      
      if (settings) {
        setCompanySettings(settings);
      }

      // Fetch site data
      if (link.site_id) {
        const { data: siteData, error: siteError } = await supabase
          .from('sites')
          .select(`
            *,
            clients!inner (
              id,
              name,
              company_name,
              logo_url
            )
          `)
          .eq('id', link.site_id)
          .single();

        if (siteError) {
          console.error("Error fetching site:", siteError);
          setError("Unable to load site data");
          return;
        }

        setSite(siteData);
        setClient(siteData.clients);

        // Fetch subsections
        const { data: subsectionsData } = await supabase
          .from('subsections')
          .select('*')
          .eq('site_id', link.site_id)
          .order('name');

        setSubsections(subsectionsData || []);

        // Fetch documents
        const { data: docsData } = await supabase
          .from('site_documents')
          .select('*')
          .eq('site_id', link.site_id)
          .order('created_at', { ascending: false });

        setDocuments(docsData || []);

        // Fetch inspections
        const { data: inspectionsData } = await supabase
          .from('inspections')
          .select('*')
          .eq('site_id', link.site_id)
          .order('created_at', { ascending: false });

        setInspections(inspectionsData || []);

        // Fetch snags and validations
        const subsectionIds = (subsectionsData || []).map(s => s.id);
        if (subsectionIds.length > 0) {
          const { data: snagsData } = await supabase
            .from('snags')
            .select('id, subsection_id, title, status, risk_level')
            .in('subsection_id', subsectionIds);

          setSnags(snagsData || []);

          const { data: validationsData } = await supabase
            .from('coc_validations')
            .select('id, subsection_id, status')
            .in('subsection_id', subsectionIds);

          setValidations(validationsData || []);
        }
      }
    } catch (err) {
      console.error("Error loading data:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats locally
  const calculateLocalStats = (): LocalComplianceStats => {
    let approved = 0;
    let pending = 0;
    let failed = 0;
    let missing = 0;
    let notRequired = 0;
    
    subsections.forEach(s => {
      if (!s.is_coc_required) {
        notRequired++;
      } else {
        const status = s.coc_status?.toLowerCase();
        if (status === 'approved' || status === 'valid' || status === 'pass') {
          approved++;
        } else if (status === 'pending' || status === 'review') {
          pending++;
        } else if (status === 'fail' || status === 'failed' || status === 'expired') {
          failed++;
        } else {
          missing++;
        }
      }
    });
    
    return { approved, pending, failed, missing, notRequired, total: subsections.length };
  };
  
  const stats = calculateLocalStats();
  const openSnags = snags.filter(s => !['Rectified', 'Closed', 'rectified'].includes(s.status));
  const failedValidations = validations.filter(v => ['Fail', 'Failed'].includes(v.status));

  const getOverallHealthScore = () => {
    if (subsections.length === 0) return 0;
    let score = 0;
    const total = subsections.length;
    
    subsections.forEach(s => {
      if (!s.is_coc_required) {
        score += 1;
      } else if (['Approved', 'Valid', 'Pass', 'approved', 'valid', 'pass'].includes(s.coc_status || '')) {
        score += 1;
      }
    });
    
    return Math.round((score / total) * 100);
  };

  const healthScore = getOverallHealthScore();

  const getCategoryBreakdown = () => {
    const categories: Record<string, { total: number; compliant: number }> = {};
    
    subsections.forEach(s => {
      const cat = s.category || 'Uncategorized';
      if (!categories[cat]) {
        categories[cat] = { total: 0, compliant: 0 };
      }
      categories[cat].total++;
      if (!s.is_coc_required || ['Approved', 'Valid', 'Pass', 'approved', 'valid', 'pass'].includes(s.coc_status || '')) {
        categories[cat].compliant++;
      }
    });
    
    return Object.entries(categories).map(([name, data]) => ({
      name,
      ...data,
      percentage: Math.round((data.compliant / data.total) * 100)
    }));
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'approved':
      case 'valid':
      case 'pass':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
      case 'pending':
      case 'review':
        return 'bg-amber-500/10 text-amber-600 border-amber-200';
      case 'fail':
      case 'failed':
      case 'expired':
      case 'missing':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusBadgeColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'approved':
      case 'valid':
      case 'pass':
      case 'compliant':
        return 'bg-emerald-500';
      case 'pending':
      case 'review':
        return 'bg-amber-500';
      case 'fail':
      case 'failed':
      case 'expired':
      case 'missing':
        return 'bg-destructive';
      default:
        return 'bg-muted-foreground';
    }
  };

  const handleDownload = async (url: string, fileName: string) => {
    try {
      await downloadFile(url, fileName);
    } catch (error) {
      console.error("Error downloading document:", error);
    }
  };

  const filteredSubsections = subsections.filter(s => {
    const searchLower = subsectionSearch.toLowerCase();
    return (
      s.name.toLowerCase().includes(searchLower) ||
      s.description?.toLowerCase().includes(searchLower) ||
      s.coc_status?.toLowerCase().includes(searchLower)
    );
  });

  const filteredDocuments = documents.filter(doc => {
    const searchLower = documentSearch.toLowerCase();
    return (
      doc.file_name?.toLowerCase().includes(searchLower) ||
      doc.category?.toLowerCase().includes(searchLower)
    );
  });

  // Format data for ComplianceDashboard
  const formattedSubsections = subsections.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category || null,
    coc_status: s.coc_status || '',
    metering_status: s.metering_status || '',
    is_compliant: s.is_compliant || false,
    is_coc_required: s.is_coc_required || false,
  }));

  const formattedInspections = inspections.map(i => ({
    id: i.id,
    subsection_id: i.subsection_id,
    inspection_date: i.inspection_date,
    json_data: i.json_data,
  }));

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading site review...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="max-w-md mx-4">
          <CardContent className="pt-8 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!site || !client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="max-w-md mx-4">
          <CardContent className="pt-8 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Site Not Found</h2>
            <p className="text-muted-foreground">The requested site could not be loaded.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {companySettings?.company_logo_url ? (
                <img 
                  src={companySettings.company_logo_url} 
                  alt={companySettings.company_name}
                  className="h-10 w-10 object-contain"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Compliance Review</p>
                <h1 className="font-semibold">{companySettings?.company_name || 'Site Review'}</h1>
              </div>
            </div>
            {client.logo_url && (
              <img 
                src={client.logo_url} 
                alt={client.company_name || client.name}
                className="h-10 w-auto object-contain"
              />
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5" />
        <div className="container mx-auto px-4 py-12">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <Badge variant="outline" className="mb-4">
                <Building2 className="h-3 w-3 mr-1" />
                {site.site_type || 'Commercial'}
              </Badge>
              <h1 className="text-4xl font-bold mb-2">{site.name}</h1>
              {site.address && (
                <p className="text-lg text-muted-foreground flex items-center gap-2 mb-6">
                  <MapPin className="h-4 w-4" />
                  {site.address}
                </p>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Prepared for</span>
                <Badge variant="secondary">{client.company_name || client.name}</Badge>
              </div>
            </div>

            {/* Health Score Card */}
            <Card className="bg-white/80 backdrop-blur border-2 shadow-xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  Overall Site Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full -rotate-90">
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="12"
                        className="text-muted/20"
                      />
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="12"
                        strokeDasharray={`${(healthScore / 100) * 352} 352`}
                        strokeLinecap="round"
                        className={healthScore >= 80 ? 'text-emerald-500' : healthScore >= 50 ? 'text-amber-500' : 'text-destructive'}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold">{healthScore}%</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        Compliant
                      </span>
                      <span className="font-medium">{stats.approved}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-500" />
                        Pending
                      </span>
                      <span className="font-medium">{stats.pending}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-destructive" />
                        Non-Compliant
                      </span>
                      <span className="font-medium">{stats.failed}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Stats Summary */}
      <section className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="text-center p-6">
            <div className="text-3xl font-bold text-primary mb-1">{subsections.length}</div>
            <p className="text-sm text-muted-foreground">Total Subsections</p>
          </Card>
          <Card className="text-center p-6">
            <div className="text-3xl font-bold text-emerald-600 mb-1">{stats.approved}</div>
            <p className="text-sm text-muted-foreground">COC Approved</p>
          </Card>
          <Card className="text-center p-6">
            <div className="text-3xl font-bold text-destructive mb-1">{openSnags.length}</div>
            <p className="text-sm text-muted-foreground">Open Snags</p>
          </Card>
          <Card className="text-center p-6">
            <div className="text-3xl font-bold text-amber-600 mb-1">{failedValidations.length}</div>
            <p className="text-sm text-muted-foreground">Failed Validations</p>
          </Card>
        </div>
      </section>

      {/* Tabbed Content - 7 Tabs */}
      <section className="container mx-auto px-4 pb-12">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="flex flex-wrap w-full h-auto gap-1 p-1 overflow-visible">
            <TabsTrigger value="dashboard" className="gap-2 shrink-0">
              <LayoutGrid className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="schematic" className="gap-2 shrink-0">
              <Workflow className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Schematic</span>
            </TabsTrigger>
            <TabsTrigger value="assets" className="gap-2 shrink-0">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Assets</span>
            </TabsTrigger>
            <TabsTrigger value="compliance" className="gap-2 shrink-0">
              <Shield className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Compliance</span>
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2 shrink-0">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Documents</span>
            </TabsTrigger>
            <TabsTrigger value="subsections" className="gap-2 shrink-0">
              <Layers className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Subsections</span>
            </TabsTrigger>
            <TabsTrigger value="reports" className="gap-2 shrink-0">
              <FileBarChart className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">Reports</span>
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Compliance by Category
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {getCategoryBreakdown().map((cat) => (
                  <div key={cat.name} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-muted-foreground">
                        {cat.compliant} / {cat.total} ({cat.percentage}%)
                      </span>
                    </div>
                    <Progress value={cat.percentage} className="h-2" />
                  </div>
                ))}
                {getCategoryBreakdown().length === 0 && (
                  <p className="text-center text-muted-foreground py-4">No categories found</p>
                )}
              </CardContent>
            </Card>

            {/* COC Status Summary & Snag Summary */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>COC Status Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                    <span className="flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Approved / Valid
                    </span>
                    <Badge className="bg-emerald-500">{stats.approved}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <span className="flex items-center gap-2 text-amber-700">
                      <Clock className="h-4 w-4" />
                      Pending Review
                    </span>
                    <Badge className="bg-amber-500">{stats.pending}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                    <span className="flex items-center gap-2 text-red-700">
                      <XCircle className="h-4 w-4" />
                      Failed / Missing
                    </span>
                    <Badge className="bg-destructive">{stats.failed + stats.missing}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Snag Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {['Critical', 'High', 'Medium', 'Low'].map(priority => {
                    const count = openSnags.filter(s => s.risk_level?.toLowerCase() === priority.toLowerCase()).length;
                    const colorMap: Record<string, string> = {
                      critical: 'bg-red-50 border-red-200 text-red-700',
                      high: 'bg-orange-50 border-orange-200 text-orange-700',
                      medium: 'bg-amber-50 border-amber-200 text-amber-700',
                      low: 'bg-blue-50 border-blue-200 text-blue-700',
                    };
                    const badgeMap: Record<string, string> = {
                      critical: 'bg-destructive',
                      high: 'bg-orange-500',
                      medium: 'bg-amber-500',
                      low: 'bg-blue-500',
                    };
                    return (
                      <div key={priority} className={`flex items-center justify-between p-3 rounded-lg border ${colorMap[priority.toLowerCase()]}`}>
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          {priority}
                        </span>
                        <Badge className={badgeMap[priority.toLowerCase()]}>{count}</Badge>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* Site Information */}
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
            <SchematicDiagram siteId={site.id} siteName={site.name} />
          </TabsContent>

          {/* Asset Verification Tab */}
          <TabsContent value="assets" className="space-y-6">
            <AssetVerification siteId={site.id} siteName={site.name} />
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance" className="space-y-6">
            <ComplianceDashboard 
              siteId={site.id} 
              subsections={formattedSubsections} 
              inspections={formattedInspections} 
            />
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={documentSearch}
                onChange={(e) => setDocumentSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Site Documents</CardTitle>
                <CardDescription>
                  {documents.length} document{documents.length !== 1 ? 's' : ''} available
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredDocuments.length > 0 ? (
                  <div className="space-y-2">
                    {filteredDocuments.map((doc) => (
                      <div 
                        key={doc.id}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{doc.file_name}</p>
                            <p className="text-xs text-muted-foreground">{doc.category || 'Uncategorized'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
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
                            className="gap-2"
                            onClick={() => handleDownload(doc.file_url, doc.file_name)}
                          >
                            <Download className="h-4 w-4" />
                            <span className="hidden sm:inline">Download</span>
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    {documentSearch ? "No documents match your search" : "No documents found for this site"}
                  </p>
                )}
              </CardContent>
            </Card>
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
              <CardHeader>
                <CardTitle>Subsections</CardTitle>
                <CardDescription>
                  {subsections.length} subsection{subsections.length !== 1 ? 's' : ''} in this site
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredSubsections.length > 0 ? (
                  <div className="space-y-2">
                    {filteredSubsections.map((subsection) => (
                      <div 
                        key={subsection.id}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <Layers className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{subsection.name}</p>
                            {subsection.description && (
                              <p className="text-sm text-muted-foreground">{subsection.description}</p>
                            )}
                            {subsection.tenant_name && (
                              <p className="text-xs text-muted-foreground">Tenant: {subsection.tenant_name}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {subsection.category && (
                            <Badge variant="outline">{subsection.category}</Badge>
                          )}
                          {subsection.coc_status && (
                            <Badge className={`${getStatusBadgeColor(subsection.coc_status)} text-white`}>
                              COC: {subsection.coc_status}
                            </Badge>
                          )}
                        </div>
                      </div>
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

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <SiteReports site={site as Site} />
          </TabsContent>
        </Tabs>
      </section>

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

export default PublicSiteReview;
