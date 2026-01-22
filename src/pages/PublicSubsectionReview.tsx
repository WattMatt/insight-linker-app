import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Zap
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

const PublicSubsectionReview = () => {
  const { token, subsectionId } = useParams<{ token: string; subsectionId: string }>();
  const navigate = useNavigate();
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [snags, setSnags] = useState<SnagData[]>([]);
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

    } catch (err) {
      console.error("Error fetching data:", err);
      setError("An error occurred while loading data");
    } finally {
      setLoading(false);
    }
  };

  const getCocStatusBadge = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return <Badge className="bg-green-500"><CheckCircle2 className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'failed':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Failed</Badge>;
      case 'pending':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getSnagStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'rectified':
        return <Badge className="bg-green-500">Rectified</Badge>;
      case 'in_progress':
        return <Badge className="bg-amber-500">In Progress</Badge>;
      default:
        return <Badge variant="destructive">Open</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading subsection...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
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
              <div className="h-8 w-px bg-border" />
              {clientData?.logo_url && (
                <img 
                  src={clientData.logo_url} 
                  alt="Client Logo" 
                  className="h-10 object-contain"
                />
              )}
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate(`/review/${token}`)}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Site
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Building2 className="h-4 w-4" />
          <span>{siteData.name}</span>
          <span>/</span>
          <span className="text-foreground font-medium">{subsection.name}</span>
        </div>

        {/* Subsection Header */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-2xl">{subsection.name}</CardTitle>
                {subsection.tenant_name && (
                  <CardDescription className="text-base mt-1">
                    Tenant: {subsection.tenant_name}
                  </CardDescription>
                )}
              </div>
              {getCocStatusBadge(subsection.coc_status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {subsection.category && (
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium">{subsection.category}</p>
                </div>
              )}
              {subsection.coc_type && (
                <div>
                  <p className="text-sm text-muted-foreground">COC Type</p>
                  <p className="font-medium">{subsection.coc_type}</p>
                </div>
              )}
              {subsection.coc_number && (
                <div>
                  <p className="text-sm text-muted-foreground">COC Number</p>
                  <p className="font-medium">{subsection.coc_number}</p>
                </div>
              )}
              {subsection.coc_issue_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Issue Date</p>
                  <p className="font-medium">{new Date(subsection.coc_issue_date).toLocaleDateString()}</p>
                </div>
              )}
              {subsection.meter_serial_number && (
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Meter Serial</p>
                    <p className="font-medium">{subsection.meter_serial_number}</p>
                  </div>
                </div>
              )}
              {subsection.metering_status && (
                <div>
                  <p className="text-sm text-muted-foreground">Metering Status</p>
                  <Badge variant="outline">{subsection.metering_status}</Badge>
                </div>
              )}
            </div>
            {subsection.description && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="mt-1">{subsection.description}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documents */}
        <Card>
          <CardHeader>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              {documents.length} document{documents.length !== 1 ? 's' : ''} available
            </CardDescription>
          </CardHeader>
          <CardContent>
            {documents.length > 0 ? (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div 
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{doc.file_name}</p>
                        {doc.category_name && (
                          <p className="text-xs text-muted-foreground">{doc.category_name}</p>
                        )}
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
                        onClick={() => downloadFile(doc.file_url, doc.file_name)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No documents available</p>
            )}
          </CardContent>
        </Card>

        {/* Snags */}
        {snags.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Outstanding Issues
              </CardTitle>
              <CardDescription>
                {snags.filter(s => s.status !== 'rectified').length} open issue{snags.filter(s => s.status !== 'rectified').length !== 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {snags.map((snag) => (
                  <div 
                    key={snag.id}
                    className="p-4 rounded-lg border"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-medium">{snag.title}</h4>
                      {getSnagStatusBadge(snag.status)}
                    </div>
                    {snag.description && (
                      <p className="text-sm text-muted-foreground mb-2">{snag.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {snag.risk_level && (
                        <span className={`font-medium ${
                          snag.risk_level === 'high' ? 'text-destructive' :
                          snag.risk_level === 'medium' ? 'text-amber-500' :
                          'text-blue-500'
                        }`}>
                          {snag.risk_level.charAt(0).toUpperCase() + snag.risk_level.slice(1)} Risk
                        </span>
                      )}
                      <span>Created: {new Date(snag.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>

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
