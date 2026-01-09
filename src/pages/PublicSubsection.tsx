import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Eye, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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

interface DocumentCategory {
  name: string;
  files: DocumentFile[];
}

interface DocumentFile {
  name: string;
  url: string;
  uploadedAt?: string;
}

interface SnagData {
  id: string;
  title: string;
  description?: string;
  status: string;
  risk_level?: string;
  created_at: string;
}


const PublicSubsection = () => {
  const { subsectionId } = useParams(); // clientId and siteId are in the URL but not needed since we fetch from Supabase
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [documents, setDocuments] = useState<DocumentCategory[]>([]);
  const [snags, setSnags] = useState<SnagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [companySettings, setCompanySettings] = useState<{company_name: string; company_logo_url?: string} | null>(null);

  useEffect(() => {
    if (subsectionId) {
      fetchPublicData();
    }
  }, [subsectionId]);

  const fetchPublicData = async () => {
    try {
      setLoading(true);

      // Fetch company settings
      const { data: settings } = await supabase
        .from('settings')
        .select('company_name, company_logo_url')
        .maybeSingle();
      
      if (settings) {
        setCompanySettings(settings);
      }

      // Fetch subsection with site and client data
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
        .maybeSingle();

      if (subsectionError) {
        console.error("Error fetching subsection:", subsectionError);
        return;
      }

      if (!subsectionData) {
        console.error("Subsection not found");
        return;
      }

      setSubsection(subsectionData);
      setSiteData(subsectionData.sites);
      setClientData(subsectionData.sites.clients);

      // Fetch subsection documents organized by categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('document_categories')
        .select(`
          id,
          name,
          order_index,
          subsection_documents (
            id,
            file_name,
            file_url,
            uploaded_at
          )
        `)
        .eq('subsection_id', subsectionId)
        .order('order_index');

      if (categoriesError) {
        console.error("Error fetching categories:", categoriesError);
      }

      // Transform data to match DocumentCategory interface
      const transformedDocs: DocumentCategory[] = (categoriesData || [])
        .filter((cat: any) => cat.subsection_documents && cat.subsection_documents.length > 0)
        .map((cat: any) => ({
          name: cat.name,
          files: cat.subsection_documents.map((doc: any) => ({
            name: doc.file_name,
            url: doc.file_url,
            uploadedAt: doc.uploaded_at
          }))
        }));

      setDocuments(transformedDocs);

      // Fetch snags for this subsection
      const { data: snagsData, error: snagsError } = await supabase
        .from('snags')
        .select('id, title, description, status, risk_level, created_at')
        .eq('subsection_id', subsectionId)
        .order('created_at', { ascending: false });

      if (snagsError) {
        console.error("Error fetching snags:", snagsError);
      } else {
        setSnags(snagsData || []);
      }
    } catch (error) {
      console.error("Error fetching public data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleView = (url: string) => {
    window.open(url, '_blank');
  };

  const handleDownload = async (url: string, fileName: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to opening in new tab
      window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!subsection || !siteData || !clientData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Subsection not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCompliant = subsection.coc_status === 'Valid' || (subsection.coc_number && subsection.is_coc_required);
  const openSnags = snags.filter(s => s.status !== 'Rectified' && s.status !== 'Closed');
  const closedSnags = snags.filter(s => s.status === 'Rectified' || s.status === 'Closed');

  const getRiskLevelColor = (level?: string) => {
    switch (level?.toLowerCase()) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-500 text-black';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Hero section with geometric pattern */}
      <div className="relative bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 text-white py-12 overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="geometric" x="0" y="0" width="120" height="120" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="25" fill="#d4a574" opacity="0.6"/>
                <polygon points="90,20 105,50 75,50" fill="#4a7c59" opacity="0.6"/>
                <polygon points="30,80 45,110 15,110" fill="#8b4513" opacity="0.6"/>
                <rect x="70" y="70" width="35" height="35" fill="#c85a3e" opacity="0.6"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#geometric)"/>
          </svg>
        </div>
        <div className="container mx-auto px-4 text-center relative z-10">
          <h2 className="text-3xl font-bold mb-1">{siteData.name}</h2>
          <p className="text-slate-200 text-sm">{subsection.name}</p>
        </div>
      </div>

      {/* Status Summary Section */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {/* Compliance Status */}
          <Card className={`shadow-sm border-l-4 ${isCompliant ? 'border-l-green-500' : 'border-l-red-500'}`}>
            <CardContent className="p-4 flex items-center gap-3">
              {isCompliant ? (
                <CheckCircle className="h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 text-red-500" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">Compliance</p>
                <p className={`font-semibold ${isCompliant ? 'text-green-600' : 'text-red-600'}`}>
                  {isCompliant ? 'Compliant' : 'Non-Compliant'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* COC Status */}
          <Card className="shadow-sm border-l-4 border-l-blue-500">
            <CardContent className="p-4 flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">COC Status</p>
                <p className="font-semibold text-blue-600">
                  {subsection.coc_status || (subsection.is_coc_required ? 'Required' : 'N/A')}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Open Snags */}
          <Card className={`shadow-sm border-l-4 ${openSnags.length > 0 ? 'border-l-orange-500' : 'border-l-green-500'}`}>
            <CardContent className="p-4 flex items-center gap-3">
              {openSnags.length > 0 ? (
                <AlertTriangle className="h-8 w-8 text-orange-500" />
              ) : (
                <CheckCircle className="h-8 w-8 text-green-500" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">Open Issues</p>
                <p className={`font-semibold ${openSnags.length > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {openSnags.length} {openSnags.length === 1 ? 'Snag' : 'Snags'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Closed Snags */}
          <Card className="shadow-sm border-l-4 border-l-slate-400">
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-slate-500" />
              <div>
                <p className="text-xs text-muted-foreground">Resolved</p>
                <p className="font-semibold text-slate-600">
                  {closedSnags.length} {closedSnags.length === 1 ? 'Snag' : 'Snags'}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 pb-8 max-w-4xl">
        {/* Subsection Details */}
        <Card className="mb-6 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Subsection Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
              <div className="flex justify-between items-start">
                <p className="text-sm text-muted-foreground">Site Name</p>
                <p className="font-medium text-right">{siteData.name}</p>
              </div>
              <div className="flex justify-between items-start">
                <p className="text-sm text-muted-foreground">Subsection / Tenant</p>
                <p className="font-medium text-right">{subsection.tenant_name || subsection.name}</p>
              </div>
              <div className="flex justify-between items-start">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="font-medium text-right">{subsection.description || 'N/A'}</p>
              </div>
              <div className="flex justify-between items-start">
                <p className="text-sm text-muted-foreground">Compliance Status</p>
                <p className={`font-medium text-right ${isCompliant ? "text-green-600" : "text-red-600"}`}>
                  {isCompliant ? "Compliant" : "Non-Compliant"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subsection Document Categories */}
        {documents.map((category, idx) => (
          <Card key={`subsection-${idx}`} className="mb-6 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{category.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {category.files.map((file, fileIdx) => (
                <div
                  key={fileIdx}
                  className="flex items-center justify-between py-3 border-b last:border-b-0"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded on {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleView(file.url)}
                      title="View document"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      <span className="text-xs">View</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDownload(file.url, file.name)}
                      title="Download document"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      <span className="text-xs">Download</span>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {documents.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No documents available</p>
            </CardContent>
          </Card>
        )}

        {/* Snags Section */}
        {snags.length > 0 && (
          <Card className="mb-6 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Reported Issues ({snags.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {snags.map((snag) => (
                <div
                  key={snag.id}
                  className="flex items-start justify-between py-3 border-b last:border-b-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium">{snag.title}</p>
                      {snag.risk_level && (
                        <Badge className={`text-xs ${getRiskLevelColor(snag.risk_level)}`}>
                          {snag.risk_level}
                        </Badge>
                      )}
                    </div>
                    {snag.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{snag.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Reported: {new Date(snag.created_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}
                    </p>
                  </div>
                  <Badge 
                    variant={snag.status === 'Rectified' || snag.status === 'Closed' ? 'default' : 'secondary'}
                    className="ml-2 flex-shrink-0"
                  >
                    {snag.status}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-3">
            {companySettings?.company_logo_url && (
              <img 
                src={companySettings.company_logo_url} 
                alt={companySettings.company_name || "Company Logo"}
                className="h-12 w-auto object-contain"
              />
            )}
            <p className="text-xs text-muted-foreground text-center">
              Powered by {companySettings?.company_name || 'Watson Mattheus Consulting Electrical Engineers (Pty) Ltd'}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PublicSubsection;
