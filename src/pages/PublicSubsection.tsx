import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText } from "lucide-react";
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

const PublicSubsection = () => {
  const { subsectionId } = useParams(); // clientId and siteId are in the URL but not needed since we fetch from Supabase
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [documents, setDocuments] = useState<DocumentCategory[]>([]);
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

      // Fetch documents organized by categories
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
        return;
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
    } catch (error) {
      console.error("Error fetching public data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (url: string, fileName: string) => {
    window.open(url, '_blank');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header with branding */}
      <header className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-center">
            <h1 className="text-lg font-semibold text-center">{companySettings?.company_name || 'Watson Mattheus'}</h1>
          </div>
        </div>
      </header>

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

      {/* Main content */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
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

        {/* Document Categories */}
        {documents.map((category, idx) => (
          <Card key={idx} className="mb-6 shadow-sm">
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
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-2 flex-shrink-0"
                    onClick={() => handleDownload(file.url, file.name)}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    <span className="text-xs">Download</span>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {documents.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">No documents available for this subsection</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-white border-t mt-12 py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
            <span className="inline-flex items-center justify-center w-6 h-6 bg-blue-600 text-white rounded text-xs font-bold">
              WM
            </span>
            Powered by Watson Mattheus Consulting Electrical Engineers (Pty) Ltd
          </p>
        </div>
      </footer>
    </div>
  );
};

export default PublicSubsection;
