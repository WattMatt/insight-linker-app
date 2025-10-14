import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText } from "lucide-react";
import { readFirebaseData } from "@/lib/firebase";

interface SubsectionData {
  name: string;
  tenantName?: string;
  description?: string;
  category: string;
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  isCocRequired: boolean;
  files?: Record<string, any>;
}

interface SiteData {
  siteName: string;
  physicalAddress?: string;
  clientLogoUrl?: string;
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
  const { clientId, siteId, subsectionId } = useParams();
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [documents, setDocuments] = useState<DocumentCategory[]>([]);
  const [cocDocuments, setCocDocuments] = useState<DocumentCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clientId && siteId && subsectionId) {
      fetchPublicData();
    }
  }, [clientId, siteId, subsectionId]);

  const fetchPublicData = async () => {
    try {
      setLoading(true);

      // Fetch subsection data
      const subsectionPath = `/clients/${clientId}/${siteId}/subsections/${subsectionId}`;
      const subsectionData = await readFirebaseData(subsectionPath);

      if (!subsectionData) {
        return;
      }

      setSubsection(subsectionData);

      // Fetch site data
      const siteInfo = await readFirebaseData(`/clients/${clientId}/${siteId}`);
      setSiteData(siteInfo);

      // Parse documents
      parseDocuments(subsectionData);
    } catch (error) {
      console.error("Error fetching public data:", error);
    } finally {
      setLoading(false);
    }
  };

  const parseDocuments = (data: SubsectionData) => {
    const filesData = data.files || {};
    const categories: DocumentCategory[] = [];
    const cocCategories: DocumentCategory[] = [];

    Object.entries(filesData).forEach(([categoryKey, categoryData]: [string, any]) => {
      if (typeof categoryData === 'object' && categoryData !== null) {
        const files: DocumentFile[] = [];

        Object.entries(categoryData).forEach(([fileKey, fileData]: [string, any]) => {
          if (typeof fileData === 'object' && fileData !== null) {
            if (fileData.url || fileData.name || fileData.downloadURL) {
              files.push({
                name: fileData.name || fileKey,
                url: fileData.url || fileData.downloadURL || '',
                uploadedAt: fileData.uploadedAt || fileData.timestamp,
              });
            }
          } else if (typeof fileData === 'string') {
            files.push({
              name: fileKey,
              url: fileData,
            });
          }
        });

        if (files.length > 0) {
          const categoryName = categoryKey.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
          const category = {
            name: categoryName,
            files,
          };
          
          // Separate COC documents from other documents
          if (categoryKey.toLowerCase().includes('coc') || categoryKey.toLowerCase().includes('certificate')) {
            cocCategories.push(category);
          } else {
            categories.push(category);
          }
        }
      }
    });

    // Set COC documents first
    setCocDocuments(cocCategories);
    setDocuments(categories);
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

  const isCompliant = subsection.cocNumber && subsection.isCocRequired;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header with branding */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">Watson Mattheus</h1>
            {siteData.clientLogoUrl && (
              <img src={siteData.clientLogoUrl} alt="Client Logo" className="h-10" />
            )}
          </div>
        </div>
      </header>

      {/* Hero section */}
      <div className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl font-bold mb-2">{siteData.siteName}</h2>
          <p className="text-slate-200">{subsection.name}</p>
        </div>
      </div>

      {/* Main content */}
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Subsection Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Subsection Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Site Name</p>
                <p className="font-medium">{siteData.siteName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Subsection / Tenant</p>
                <p className="font-medium">{subsection.tenantName || subsection.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Description</p>
                <p className="font-medium">{subsection.description || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Compliance Status</p>
                <Badge variant={isCompliant ? "default" : "destructive"} className={isCompliant ? "bg-green-500" : ""}>
                  {isCompliant ? "Compliant" : "Non-Compliant"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* COC Documents */}
        {cocDocuments.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Certificates of Compliance (COC)</CardTitle>
              {subsection.cocNumber && (
                <div className="text-sm space-y-1 mt-2">
                  <p><span className="font-medium">COC Number:</span> {subsection.cocNumber}</p>
                  {subsection.cocIssueDate && (
                    <p><span className="font-medium">Issue Date:</span> {new Date(subsection.cocIssueDate).toLocaleDateString()}</p>
                  )}
                  {subsection.cocType && (
                    <p><span className="font-medium">Type:</span> {subsection.cocType}</p>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {cocDocuments.map((category, catIdx) =>
                category.files.map((file, fileIdx) => (
                  <div
                    key={`${catIdx}-${fileIdx}`}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-muted-foreground">
                          Uploaded on {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleDownload(file.url, file.name)}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Document Categories */}
        {documents.map((category, idx) => (
          <Card key={idx} className="mb-6">
            <CardHeader>
              <CardTitle>{String(idx + 2).padStart(2, '0')} {category.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {category.files.map((file, fileIdx) => (
                <div
                  key={fileIdx}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Uploaded on {file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownload(file.url, file.name)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {documents.length === 0 && cocDocuments.length === 0 && (
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
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium">
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
