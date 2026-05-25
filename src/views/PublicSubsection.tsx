import { useEffect, useState } from "react";
import { useParams } from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Eye, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  const { subsectionId } = useParams();
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [clientData, setClientData] = useState<ClientData | null>(null);
  const [documents, setDocuments] = useState<DocumentCategory[]>([]);
  const [snags, setSnags] = useState<SnagData[]>([]);
  const [cocValidations, setCocValidations] = useState<Record<string, any>>({});
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

      const { data: settings } = await supabase
        .from('settings')
        .select('company_name, company_logo_url')
        .maybeSingle();
      
      if (settings) {
        setCompanySettings(settings);
      }

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

      // Fetch COC validations to check for any failed validations
      const { data: validationsData, error: validationsError } = await supabase
        .from('coc_validations')
        .select('*')
        .eq('subsection_id', subsectionId);

      if (validationsError) {
        console.error("Error fetching COC validations:", validationsError);
      } else {
        const validationsMap: Record<string, any> = {};
        validationsData?.forEach(validation => {
          validationsMap[validation.document_id] = validation;
        });
        setCocValidations(validationsMap);
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

  // Calculate status values using consistent snag status normalization
  const normalizeSnagStatus = (status: string) => status?.toLowerCase();
  const openSnags = snags.filter(s => {
    const status = normalizeSnagStatus(s.status);
    return status !== 'rectified' && status !== 'closed';
  });
  const openSnagsCount = openSnags.length;
  
  // Severity breakdown
  const severityCounts = {
    critical: openSnags.filter(s => s.risk_level?.toLowerCase() === 'critical').length,
    high: openSnags.filter(s => s.risk_level?.toLowerCase() === 'high').length,
    medium: openSnags.filter(s => s.risk_level?.toLowerCase() === 'medium').length,
    low: openSnags.filter(s => s.risk_level?.toLowerCase() === 'low').length,
  };
  
  // Use shared compliance logic from complianceCalculations.ts
  const getOverallStatus = () => {
    // Check if any COC validation has failed using shared constants
    const hasFailedValidation = Object.values(cocValidations).some(
      (v: any) => FAILED_VALIDATION_STATUSES.includes(v?.status as any)
    );
    
    // If COC is required but has failed validation
    if (subsection.is_coc_required && hasFailedValidation) return "Fail";
    
    // If COC is required but status is not valid (using shared utility)
    if (subsection.is_coc_required && !hasValidCocStatus(subsection.coc_status)) return "Fail";
    
    // If COC is required but metering is missing
    if (subsection.is_coc_required && subsection.metering_status === 'Missing' && !subsection.meter_serial_number) return "Fail";
    
    // If there are open snags
    if (openSnagsCount > 0) return "Fail";
    
    return "Pass";
  };

  const overallStatus = getOverallStatus();

  const getRiskLevelColor = (level?: string) => {
    switch (level?.toLowerCase()) {
      case 'critical': return 'bg-red-500/20 text-red-600 border-red-300';
      case 'high': return 'bg-orange-500/20 text-orange-600 border-orange-300';
      case 'medium': return 'bg-yellow-500/20 text-yellow-600 border-yellow-300';
      case 'low': return 'bg-green-500/20 text-green-600 border-green-300';
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

      {/* Main content */}
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Status Summary Card - matching SubsectionDetail layout */}
        <Card className="mb-6 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Subsection Status</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Subsection Name</p>
              <p className="font-medium">{subsection.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Tenant Name</p>
              <p className="font-medium">{subsection.tenant_name || siteData.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">COC Required</p>
              <Badge variant={subsection.is_coc_required ? "default" : "secondary"}>
                {subsection.is_coc_required ? "Yes" : "No"}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Overall Status</p>
              <Badge 
                variant="outline"
                className={overallStatus === "Pass" 
                  ? "bg-green-500/10 text-green-500" 
                  : "bg-red-500/10 text-red-500"
                }
              >
                {overallStatus}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">CoC Status</p>
              <Badge
                variant="outline"
                className={
                  subsection.coc_status === "Approved" || subsection.coc_status === "Valid" || subsection.coc_status === "Pass"
                    ? "bg-green-500/10 text-green-500"
                    : subsection.is_coc_required
                    ? "bg-red-500/10 text-red-500"
                    : "bg-gray-500/10 text-gray-500"
                }
              >
                {subsection.is_coc_required ? (subsection.coc_status || "Missing") : "N/A"}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Metering Status</p>
              <Badge
                variant="outline"
                className={
                  subsection.metering_status === "Installed" || subsection.meter_serial_number
                    ? "bg-green-500/10 text-green-500"
                    : subsection.is_coc_required
                    ? "bg-red-500/10 text-red-500"
                    : "bg-gray-500/10 text-gray-500"
                }
              >
                {subsection.is_coc_required 
                  ? (subsection.metering_status === "Installed" || subsection.meter_serial_number ? "Installed" : subsection.metering_status || "Missing")
                  : "N/A"}
              </Badge>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-muted-foreground mb-1">Open Snags</p>
              <div className="flex items-start gap-2 flex-wrap">
                <Badge 
                  variant="outline"
                  className={openSnagsCount > 0 ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}
                >
                  {openSnagsCount} Total
                </Badge>
                {openSnagsCount > 0 && (
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {severityCounts.critical > 0 && (
                      <Badge variant="outline" className="bg-red-500/20 text-red-600 border-red-300 text-xs">
                        {severityCounts.critical} Critical
                      </Badge>
                    )}
                    {severityCounts.high > 0 && (
                      <Badge variant="outline" className="bg-orange-500/20 text-orange-600 border-orange-300 text-xs">
                        {severityCounts.high} High
                      </Badge>
                    )}
                    {severityCounts.medium > 0 && (
                      <Badge variant="outline" className="bg-yellow-500/20 text-yellow-600 border-yellow-300 text-xs">
                        {severityCounts.medium} Medium
                      </Badge>
                    )}
                    {severityCounts.low > 0 && (
                      <Badge variant="outline" className="bg-green-500/20 text-green-600 border-green-300 text-xs">
                        {severityCounts.low} Low
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {snags.length > 0 && (
                <div className="mt-3 space-y-2">
                  {snags.map((snag) => (
                    <div key={snag.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-2 border rounded text-sm gap-2">
                      <span className="break-words sm:truncate flex-1 text-left">{snag.title}</span>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {snag.risk_level && (
                          <Badge 
                            variant="outline" 
                            className={`${getRiskLevelColor(snag.risk_level)} text-xs`}
                          >
                            {snag.risk_level}
                          </Badge>
                        )}
                        <Badge 
                          variant="outline"
                          className={`text-xs ${snag.status === 'Rectified' || snag.status === 'Closed' || snag.status === 'rectified' 
                            ? 'bg-green-500/10 text-green-500' 
                            : 'bg-red-500/10 text-red-500'
                          }`}
                        >
                          {snag.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
