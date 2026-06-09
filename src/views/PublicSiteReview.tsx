import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Building2,
  FileText,
  XCircle,
  AlertTriangle,
  MapPin,
  Zap,
  Eye,
  Loader2,
  LayoutGrid,
  Workflow,
  ShieldCheck,
  Layers,
  FileBarChart,
  Search,
  ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VisitorRegistrationGate, getVisitorSession } from "@/components/VisitorRegistrationGate";
import { SchematicDiagram } from "@/components/site/SchematicDiagram";
import { AssetVerification } from "@/components/site/AssetVerification";
import { SiteReports } from "@/components/site/SiteReports";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { ClientPortalDocuments } from "@/components/client-portal/ClientPortalDocuments";
import { downloadFile } from "@/lib/fileDownload";
import { Site, Subsection } from "@/types/site";

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

interface DocumentData {
  id: string;
  file_name: string;
  file_url: string;
  category?: string;
  category_id?: string;
  created_at: string;
}

interface SubsectionDocumentData {
  id: string;
  file_name: string;
  file_url: string;
  subsection_id: string;
  category_name?: string;
}

interface SiteDocCategoryData {
  id: string;
  name: string;
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
  const { token, siteId: routeSiteId } = useParams<{ token: string; siteId?: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [site, setSite] = useState<SiteData | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [subsections, setSubsections] = useState<SubsectionData[]>([]);
  const [snags, setSnags] = useState<SnagData[]>([]);
  const [siteDocuments, setSiteDocuments] = useState<DocumentData[]>([]);
  const [siteDocCategories, setSiteDocCategories] = useState<SiteDocCategoryData[]>([]);
  const [subsectionDocuments, setSubsectionDocuments] = useState<SubsectionDocumentData[]>([]);
  const [inspections, setInspections] = useState<InspectionData[]>([]);
  const [companySettings, setCompanySettings] = useState<{ company_name: string; company_logo_url?: string } | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [subsectionSearch, setSubsectionSearch] = useState("");
  const [previewDocument, setPreviewDocument] = useState<{ url: string; name: string } | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [visitorRegistered, setVisitorRegistered] = useState(false);

  useEffect(() => {
    if (token) {
      // Sign out any stale session so anonymous RPC calls work cleanly
      // Catch errors gracefully — signOut can fail on custom domains due to auth-bridge mismatch
      supabase.auth.signOut({ scope: 'local' }).catch(() => {}).finally(() => validateAndFetchData());
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
      
      // If this is a client-type link accessed via /review/:token, redirect to portfolio
      if (link.link_type === 'client' && !routeSiteId) {
        navigate(`/portfolio/${token}`, { replace: true });
        return;
      }
      
      setLinkData(link);
      setLinkId(link.link_id);

      // Check if visitor already registered in this session
      if (getVisitorSession(link.link_id)) {
        setVisitorRegistered(true);
      }

      // Fetch company settings
      const { data: settings } = await supabase
        .from('settings')
        .select('company_name, company_logo_url')
        .maybeSingle();
      
      if (settings) {
        setCompanySettings(settings);
      }

      // Determine which site to load: routeSiteId (from portfolio drill-down) or link.site_id
      const targetSiteId = routeSiteId || link.site_id;
      
      // Fetch site data
      if (targetSiteId) {
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
          .eq('id', targetSiteId)
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
          .eq('site_id', targetSiteId)
          .order('name');

        setSubsections(subsectionsData || []);

        // Fetch site documents
        const { data: docsData } = await supabase
          .from('site_documents')
          .select('*')
          .eq('site_id', targetSiteId)
          .order('created_at', { ascending: false });

        setSiteDocuments(docsData || []);

        // Fetch site document categories
        const { data: docCatsData } = await supabase
          .from('site_document_categories')
          .select('id, name')
          .eq('site_id', targetSiteId)
          .order('order_index');

        setSiteDocCategories(docCatsData || []);

        // Fetch inspections
        const { data: inspectionsData } = await supabase
          .from('inspections')
          .select('*')
          .eq('site_id', targetSiteId)
          .order('created_at', { ascending: false });

        setInspections(inspectionsData || []);

        // Fetch snags
        const subsectionIds = (subsectionsData || []).map(s => s.id);
        if (subsectionIds.length > 0) {
          const { data: snagsData } = await supabase
            .from('snags')
            .select('id, subsection_id, title, status, risk_level')
            .in('subsection_id', subsectionIds);

          setSnags(snagsData || []);

          // Fetch subsection documents
          const { data: subDocsData } = await supabase
            .from('subsection_documents')
            .select(`
              id, file_name, file_url, subsection_id,
              document_categories(name)
            `)
            .in('subsection_id', subsectionIds);

          setSubsectionDocuments((subDocsData || []).map(doc => ({
            ...doc,
            category_name: (doc.document_categories as any)?.name || "Uncategorized"
          })));
        }
      }
    } catch (err) {
      console.error("Error loading data:", err);
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const openSnags = snags.filter(s => !['Rectified', 'Closed', 'rectified'].includes(s.status));

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

  const totalDocs = siteDocuments.length + subsectionDocuments.length;

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

  // Show visitor registration gate before content
  if (!visitorRegistered && linkId && !error) {
    return (
      <VisitorRegistrationGate
        accessLinkId={linkId}
        companyLogoUrl={companySettings?.company_logo_url}
        companyName={companySettings?.company_name}
        onRegistered={() => setVisitorRegistered(true)}
      />
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
        </div>
      </section>

      {/* Stats Summary */}
      <section className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="text-center p-6">
            <div className="text-3xl font-bold text-primary mb-1">{subsections.length}</div>
            <p className="text-sm text-muted-foreground">Total Subsections</p>
          </Card>
          <Card className="text-center p-6">
            <div className="text-3xl font-bold text-destructive mb-1">{openSnags.length}</div>
            <p className="text-sm text-muted-foreground">Open Snags</p>
          </Card>
        </div>
      </section>

      {/* Tabbed Content - 6 Tabs */}
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
            {/* Snag Summary */}
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
            <SchematicDiagram siteId={site.id} siteName={site.name} readOnly accessToken={token} />
          </TabsContent>

          {/* Asset Verification Tab */}
          <TabsContent value="assets" className="space-y-6">
            <AssetVerification siteId={site.id} siteName={site.name} readOnly />
          </TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents" className="space-y-4">
            <ClientPortalDocuments
              siteDocuments={siteDocuments}
              siteCategories={siteDocCategories}
              subsectionDocuments={subsectionDocuments}
              subsections={subsections.map(s => ({ id: s.id, name: s.name }))}
              onPreview={(url, name) => setPreviewDocument({ url, name })}
              onDownload={handleDownload}
            />
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
                      <Link 
                        key={subsection.id}
                        to={`/review/${token}/subsection/${subsection.id}`}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/50 transition-colors cursor-pointer block"
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

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-6">
            <SiteReports site={site as Site} readOnly />
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
