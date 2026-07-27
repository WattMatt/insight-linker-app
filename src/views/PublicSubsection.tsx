import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "@/lib/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Eye, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PublicVerdictCard } from "@/components/public/PublicVerdictCard";
import { PublicIssueReportDialog } from "@/components/public/PublicIssueReportDialog";
import { presentVerdict, type PublicVerdict } from "@/lib/publicVerdict";
import { useAuthSession } from "@/components/auth/useAuthSession";
import { useUserRole } from "@/hooks/useUserRole";

// get_public_subsection returns only these subsection fields (deliberate
// data-minimization — no COC/metering on the public landing).
interface SubsectionData {
  id: string;
  name: string;
  tenant_name?: string;
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


// Slim session-aware banner rendered below the verdict card. Anonymous visitors
// (no session) see nothing — this must never affect the unauthenticated path.
// Role resolution is async (useUserRole via react-query), so we wait for it to
// settle (data !== undefined) rather than flash a wrong/generic action.
type RoleBannerProps = {
  session: ReturnType<typeof useAuthSession>["session"];
  userRole: ReturnType<typeof useUserRole>["data"];
  siteData: SiteData | null;
  subsectionId: string | undefined;
  navigate: ReturnType<typeof useNavigate>;
};

function RoleBanner({ session, userRole, siteData, subsectionId, navigate }: RoleBannerProps) {
  if (!session || !siteData?.id || userRole === undefined) return null;

  let text: string;
  let buttonLabel: string;
  let onClick: () => void;

  if (userRole === "Contractor") {
    text = "You're signed in as a contractor.";
    buttonLabel = "Upload COC for this subsection";
    onClick = () => navigate(`/contractor/subsections/${subsectionId}?tab=upload`);
  } else if (userRole === "Client") {
    text = "You're signed in.";
    buttonLabel = "Open client portal";
    onClick = () => navigate('/client-portal');
  } else {
    // Admin or any other staff (userRole "Admin" or null-but-session-exists)
    text = "You're signed in as staff.";
    buttonLabel = "Open in admin";
    onClick = () => navigate(`/sites/${siteData.id}/subsections/${subsectionId}?tab=coc-metering`);
  }

  return (
    <Card className="mb-6 shadow-sm border-primary/20 bg-primary/5">
      <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-medium">{text}</p>
        <Button size="sm" onClick={onClick}>{buttonLabel}</Button>
      </CardContent>
    </Card>
  );
}

const PublicSubsection = () => {
  const { subsectionId } = useParams();
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const { data: userRole } = useUserRole();
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [documents, setDocuments] = useState<DocumentCategory[]>([]);
  const [snags, setSnags] = useState<SnagData[]>([]);
  const [verdict, setVerdict] = useState<PublicVerdict | null>(null);
  const [loading, setLoading] = useState(true);
  const [companySettings, setCompanySettings] = useState<{company_name: string; company_logo_url?: string} | null>(null);
  const presenceLogged = useRef(false);

  useEffect(() => {
    if (subsectionId) {
      fetchPublicData();
    }
  }, [subsectionId]);

  // One-time presence log per mount, only when signed in. RLS (Task 1) permits exactly
  // this shape: authenticated, scanned_by = auth.uid(), source = 'landing'. Pre-migration
  // this fails with an RLS error — non-blocking, the page must not break for it.
  useEffect(() => {
    if (!session || !subsectionId || presenceLogged.current) return;
    presenceLogged.current = true;
    supabase.from('qr_scans').insert({
      subsection_id: subsectionId,
      scanned_by: session.user.id,
      source: 'landing',
    }).then(({ error }) => {
      if (error) console.error('presence log failed (non-blocking):', error);
    });
  }, [session, subsectionId]);

  const fetchPublicData = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .rpc('get_public_subsection', { p_subsection_id: subsectionId });

      if (error) {
        console.error("Error fetching public data:", error);
        return;
      }

      if (!data) {
        console.error("Subsection not found");
        return;
      }

      const payload = data as any;

      if (payload.settings) {
        setCompanySettings(payload.settings);
      }

      setSubsection(payload.subsection);
      setSiteData(payload.site);

      const transformedDocs: DocumentCategory[] = (payload.categories || [])
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
      setSnags(payload.snags || []);
      setVerdict((payload.verdict as PublicVerdict) ?? null);
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

  if (!subsection || !siteData) {
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
        <div className="flex justify-end mb-4">
          <PublicIssueReportDialog
            subsectionId={subsectionId ?? ""}
            trigger={
              <Button variant="outline" size="sm">
                <AlertTriangle className="h-4 w-4 mr-1.5" />
                Report an issue
              </Button>
            }
          />
        </div>

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

        <PublicVerdictCard verdict={verdict} />

        {presentVerdict(verdict, new Date()).kind === "fail" && (
          <div className="flex justify-center mb-6 -mt-3">
            <PublicIssueReportDialog
              subsectionId={subsectionId ?? ""}
              trigger={
                <Button variant="outline" size="sm">
                  <AlertTriangle className="h-4 w-4 mr-1.5" />
                  Report an issue
                </Button>
              }
            />
          </div>
        )}

        <RoleBanner session={session} userRole={userRole} siteData={siteData} subsectionId={subsectionId} navigate={navigate} />

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
