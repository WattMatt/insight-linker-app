import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Building2, 
  FileText, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Clock,
  MapPin,
  Zap,
  ChevronRight,
  Shield,
  BarChart3,
  Download,
  Eye,
  Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
// Helper function to calculate stats locally
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
  tenant_name?: string;
  category?: string;
  coc_status?: string;
  coc_type?: string;
  is_coc_required: boolean;
  metering_status?: string;
  meter_serial_number?: string;
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
  const [companySettings, setCompanySettings] = useState<{ company_name: string; company_logo_url?: string } | null>(null);

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

        // Fetch snags
        const subsectionIds = (subsectionsData || []).map(s => s.id);
        if (subsectionIds.length > 0) {
          const { data: snagsData } = await supabase
            .from('snags')
            .select('id, subsection_id, title, status, risk_level')
            .in('subsection_id', subsectionIds);

          setSnags(snagsData || []);

          // Fetch validations
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
      } else if (s.coc_status === 'Approved' || s.coc_status === 'Valid' || s.coc_status === 'Pass') {
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
      if (!s.is_coc_required || ['Approved', 'Valid', 'Pass'].includes(s.coc_status || '')) {
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
        return 'bg-green-500/10 text-green-600 border-green-200';
      case 'pending':
      case 'review':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-200';
      case 'fail':
      case 'failed':
      case 'expired':
      case 'missing':
        return 'bg-red-500/10 text-red-600 border-red-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

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
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
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
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
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
                        className={healthScore >= 80 ? 'text-green-500' : healthScore >= 50 ? 'text-yellow-500' : 'text-red-500'}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold">{healthScore}%</span>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        Compliant
                      </span>
                      <span className="font-medium">{stats.approved}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-yellow-500" />
                        Pending
                      </span>
                      <span className="font-medium">{stats.pending}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-500" />
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
            <div className="text-3xl font-bold text-green-600 mb-1">{stats.approved}</div>
            <p className="text-sm text-muted-foreground">COC Approved</p>
          </Card>
          <Card className="text-center p-6">
            <div className="text-3xl font-bold text-red-600 mb-1">{openSnags.length}</div>
            <p className="text-sm text-muted-foreground">Open Snags</p>
          </Card>
          <Card className="text-center p-6">
            <div className="text-3xl font-bold text-yellow-600 mb-1">{failedValidations.length}</div>
            <p className="text-sm text-muted-foreground">Failed Validations</p>
          </Card>
        </div>
      </section>

      {/* Tabbed Content */}
      <section className="container mx-auto px-4 pb-12">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="subsections">Subsections</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
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
              </CardContent>
            </Card>

            {/* Quick Status */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">COC Status Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-200">
                      <span className="flex items-center gap-2 text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Approved / Valid
                      </span>
                      <Badge className="bg-green-500">{stats.approved}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                      <span className="flex items-center gap-2 text-yellow-700">
                        <Clock className="h-4 w-4" />
                        Pending Review
                      </span>
                      <Badge className="bg-yellow-500">{stats.pending}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                      <span className="flex items-center gap-2 text-red-700">
                        <XCircle className="h-4 w-4" />
                        Failed / Missing
                      </span>
                      <Badge className="bg-red-500">{stats.failed + stats.missing}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
                      <span className="flex items-center gap-2 text-gray-700">
                        <FileText className="h-4 w-4" />
                        Not Required
                      </span>
                      <Badge variant="secondary">{stats.notRequired}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Snag Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {['Critical', 'High', 'Medium', 'Low'].map(level => {
                      const count = openSnags.filter(s => s.risk_level?.toLowerCase() === level.toLowerCase()).length;
                      const colors = {
                        Critical: 'bg-red-50 border-red-200 text-red-700',
                        High: 'bg-orange-50 border-orange-200 text-orange-700',
                        Medium: 'bg-yellow-50 border-yellow-200 text-yellow-700',
                        Low: 'bg-green-50 border-green-200 text-green-700'
                      };
                      return (
                        <div key={level} className={`flex items-center justify-between p-3 rounded-lg border ${colors[level as keyof typeof colors]}`}>
                          <span className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4" />
                            {level}
                          </span>
                          <Badge variant="outline">{count}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="subsections">
            <Card>
              <CardHeader>
                <CardTitle>All Subsections</CardTitle>
                <CardDescription>Complete list of subsections and their compliance status</CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px] pr-4">
                  <div className="space-y-3">
                    {subsections.map((sub) => {
                      const subSnags = openSnags.filter(s => s.subsection_id === sub.id);
                      const subValidations = failedValidations.filter(v => v.subsection_id === sub.id);
                      
                      return (
                        <Link
                          key={sub.id}
                          to={`/public/subsections/${sub.id}`}
                          className="block"
                        >
                          <Card className="hover:shadow-md transition-shadow cursor-pointer">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-medium truncate">{sub.name}</h3>
                                    {sub.category && (
                                      <Badge variant="outline" className="text-xs">
                                        {sub.category}
                                      </Badge>
                                    )}
                                  </div>
                                  {sub.tenant_name && (
                                    <p className="text-sm text-muted-foreground mb-2">
                                      Tenant: {sub.tenant_name}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap gap-2">
                                    {sub.is_coc_required ? (
                                      <Badge 
                                        variant="outline" 
                                        className={getStatusColor(sub.coc_status)}
                                      >
                                        COC: {sub.coc_status || 'Missing'}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="bg-muted">
                                        COC: Not Required
                                      </Badge>
                                    )}
                                    {subSnags.length > 0 && (
                                      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-200">
                                        {subSnags.length} Open Snag{subSnags.length > 1 ? 's' : ''}
                                      </Badge>
                                    )}
                                    {subValidations.length > 0 && (
                                      <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-200">
                                        Validation Failed
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                              </div>
                            </CardContent>
                          </Card>
                        </Link>
                      );
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issues">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Open Snags */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-red-500" />
                    Open Snags ({openSnags.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    {openSnags.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                        <p className="text-muted-foreground">No open snags</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {openSnags.map((snag) => {
                          const sub = subsections.find(s => s.id === snag.subsection_id);
                          return (
                            <Card key={snag.id} className="p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{snag.title}</p>
                                  <p className="text-xs text-muted-foreground">{sub?.name}</p>
                                </div>
                                <Badge 
                                  variant="outline"
                                  className={
                                    snag.risk_level?.toLowerCase() === 'critical' ? 'bg-red-100 text-red-700' :
                                    snag.risk_level?.toLowerCase() === 'high' ? 'bg-orange-100 text-orange-700' :
                                    snag.risk_level?.toLowerCase() === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                                    'bg-green-100 text-green-700'
                                  }
                                >
                                  {snag.risk_level || 'Unknown'}
                                </Badge>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Failed Validations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-orange-500" />
                    Failed Validations ({failedValidations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    {failedValidations.length === 0 ? (
                      <div className="text-center py-8">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
                        <p className="text-muted-foreground">All validations passed</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {failedValidations.map((validation) => {
                          const sub = subsections.find(s => s.id === validation.subsection_id);
                          return (
                            <Card key={validation.id} className="p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">{sub?.name}</p>
                                  <p className="text-xs text-muted-foreground">COC Validation Failed</p>
                                </div>
                                <Badge variant="outline" className="bg-red-100 text-red-700">
                                  Failed
                                </Badge>
                              </div>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30 py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>This compliance review was generated by {companySettings?.company_name || 'Electrical Compliance'}</p>
          <p className="mt-1">For questions, contact your service provider</p>
        </div>
      </footer>
    </div>
  );
};

export default PublicSiteReview;