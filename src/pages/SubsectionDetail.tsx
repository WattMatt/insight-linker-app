import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, FileText, AlertCircle, QrCode as QrCodeIcon, Edit, Download } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { format } from "date-fns";
import QRCode from "qrcode";
import { readFirebaseData } from "@/lib/firebase";

interface SubsectionData {
  name: string;
  tenantName?: string;
  category: string;
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  meterSerialNumber?: string;
  ctRatio?: string;
  isCocRequired: boolean;
  inspections?: Record<string, any>;
  files?: Record<string, any>;
  snags?: any[];
}

interface SiteData {
  siteName: string;
  clientInfo?: string;
}

interface DocumentCategory {
  name: string;
  files: DocumentFile[];
  status?: string;
}

interface DocumentFile {
  name: string;
  url: string;
  uploadedAt?: string;
  status?: string;
}

const SubsectionDetail = () => {
  const { clientId, siteId, subsectionId } = useParams();
  const navigate = useNavigate();
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [documents, setDocuments] = useState<DocumentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  useEffect(() => {
    if (clientId && siteId && subsectionId) {
      fetchSubsectionData();
      generateQRCode();
    }
  }, [clientId, siteId, subsectionId]);

  const fetchSubsectionData = async () => {
    try {
      setLoading(true);
      
      // Fetch subsection data from Firebase
      const data = await readFirebaseData(`/clients/${clientId}/${siteId}/subsections/${subsectionId}`);
      
      if (!data) {
        toast.error("Subsection not found");
        return;
      }

      console.log('Subsection data:', data);
      setSubsection(data);
      
      // Fetch site info for header
      const siteInfo = await readFirebaseData(`/clients/${clientId}/${siteId}`);
      setSiteData(siteInfo);
      
      // Parse documents
      parseDocuments(data);
    } catch (error) {
      console.error("Error fetching subsection data:", error);
      toast.error("Failed to load subsection data");
    } finally {
      setLoading(false);
    }
  };

  const parseDocuments = (data: SubsectionData) => {
    const filesData = data.files || {};
    const categories: DocumentCategory[] = [];

    console.log('Parsing subsection documents:', filesData);

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
                status: fileData.status || 'No Update: Detail'
              });
            }
          } else if (typeof fileData === 'string') {
            files.push({
              name: fileKey,
              url: fileData,
              status: 'No Update: Detail'
            });
          }
        });

        if (files.length > 0) {
          categories.push({
            name: categoryKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            files,
            status: categoryData.status || 'No Update: Detail'
          });
        }
      }
    });

    console.log('Parsed document categories:', categories);
    setDocuments(categories);
  };

  const generateQRCode = async () => {
    try {
      const url = `${window.location.origin}/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}`;
      const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2 });
      setQrCodeUrl(qrDataUrl);
    } catch (error) {
      console.error("Error generating QR code:", error);
    }
  };

  const handleDownloadDocument = (url: string, fileName: string) => {
    if (!url) {
      toast.error("Document URL not available");
      return;
    }
    window.open(url, '_blank');
    toast.success(`Opening ${fileName}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!subsection || !siteData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Subsection data not found</p>
          <Button className="mt-4" onClick={() => navigate(`/clients/${clientId}/sites/${siteId}`)}>
            Back to Site
          </Button>
        </div>
      </div>
    );
  }

  const inspections = subsection.inspections || {};
  const inspectionArray = Object.entries(inspections);
  const hasSnags = subsection.snags && subsection.snags.length > 0;
  const cocExpired = !subsection.cocNumber;
  const isNotCompliant = hasSnags || cocExpired;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/clients/${clientId}/sites/${siteId}`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded flex items-center justify-center text-white font-bold ${
                subsection.category === 'HS' ? 'bg-red-500' : 'bg-blue-500'
              }`}>
                {subsection.category?.substring(0, 2) || "EE"}
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {subsection.name} - {siteData.siteName}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Subsection of {siteData.siteName}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">Export Reports</Button>
          <Button variant="outline">
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="inspections">Inspections</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="coc-metering">COC Docs & Metering Data</TabsTrigger>
          <TabsTrigger value="qr-code">QR Code</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Compliance Alert */}
          {isNotCompliant && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Compliance Status: Fail</strong>
                <br />
                This status is determined by open snags and COC validation. The following issues were found:
                <ul className="list-disc list-inside mt-2">
                  {cocExpired && <li>Certificate of Compliance is missing or expired.</li>}
                  {hasSnags && subsection.snags?.map((snag, idx) => (
                    <li key={idx}>{snag.description || 'Open snag'}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Subsection Details */}
          <Card>
            <CardHeader>
              <CardTitle>Subsection Details</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Subsection Name</p>
                <p className="font-medium">{subsection.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Tenant Name</p>
                <p className="font-medium">{subsection.tenantName || siteData.siteName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">COC Required</p>
                <Badge variant={subsection.isCocRequired ? "default" : "secondary"}>
                  {subsection.isCocRequired ? "Yes" : "No"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Inspections */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Inspections
                <Button 
                  variant="link" 
                  size="sm"
                  onClick={() => setActiveTab("inspections")}
                >
                  View All
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inspectionArray.length === 0 ? (
                <p className="text-sm text-muted-foreground">No inspections found</p>
              ) : (
                <div className="space-y-2">
                  {inspectionArray.slice(0, 3).map(([id, inspection]) => (
                    <div 
                      key={id} 
                      className="flex justify-between items-center p-3 border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}/inspections/${id}`)}
                    >
                      <div>
                        <p className="font-medium">{inspection.type || 'Inspection'}</p>
                        <p className="text-sm text-muted-foreground">
                          {inspection.date ? format(new Date(inspection.date), "dd MMMM yyyy") : "No date"}
                        </p>
                      </div>
                      <Badge variant="default" className="bg-blue-500">
                        Completed
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Documents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Documents
                <Button 
                  variant="link" 
                  size="sm"
                  onClick={() => setActiveTab("documents")}
                >
                  View All
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {documents.reduce((sum, cat) => sum + cat.files.length, 0)} file(s) found for this subsection.
              </p>
            </CardContent>
          </Card>

          {/* Certificate of Compliance */}
          {subsection.cocNumber && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Certificate of Compliance
                  <Button 
                    variant="link" 
                    size="sm"
                    onClick={() => setActiveTab("coc-metering")}
                  >
                    View All
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium">{subsection.name}.pdf</p>
                    <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                      <span>COC #: {subsection.cocNumber}</span>
                      {subsection.cocIssueDate && (
                        <span>Issue Date: {format(new Date(subsection.cocIssueDate), "yyyy-MM-dd")}</span>
                      )}
                      {subsection.cocType && (
                        <span>Type: {subsection.cocType}</span>
                      )}
                    </div>
                  </div>
                  <Badge>Pass</Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Inspections Tab */}
        <TabsContent value="inspections" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Inspections</CardTitle>
            </CardHeader>
            <CardContent>
              {inspectionArray.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No inspections found for this subsection</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inspectionArray.map(([id, inspection]) => (
                    <div 
                      key={id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                      onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}/inspections/${id}`)}
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{inspection.type || 'Inspection'}</p>
                          <p className="text-sm text-muted-foreground">
                            {inspection.date ? format(new Date(inspection.date), "dd MMMM yyyy") : "No date"}
                          </p>
                        </div>
                      </div>
                      <Badge variant="default" className="bg-blue-500">
                        Completed
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No documents found for this subsection</p>
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {documents.map((category, idx) => (
                    <AccordionItem key={idx} value={`category-${idx}`}>
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{category.name}</span>
                          </div>
                          <Badge variant="outline">{category.files.length}</Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 pl-7 pt-2">
                          <p className="text-sm text-muted-foreground mb-3">{category.status}</p>
                          {category.files.map((file, fileIdx) => (
                            <div
                              key={fileIdx}
                              className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                <div className="w-2 h-2 rounded-full bg-primary" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{file.name}</p>
                                  {file.uploadedAt && (
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(file.uploadedAt).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownloadDocument(file.url, file.name)}
                                className="ml-2"
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* COC Docs & Metering Data Tab */}
        <TabsContent value="coc-metering" className="space-y-4">
          <div className="grid gap-4">
            {/* COC Information */}
            <Card>
              <CardHeader>
                <CardTitle>Certificate of Compliance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">COC Number</p>
                    <p className="font-medium">{subsection.cocNumber || 'Not available'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Issue Date</p>
                    <p className="font-medium">
                      {subsection.cocIssueDate 
                        ? format(new Date(subsection.cocIssueDate), "yyyy-MM-dd")
                        : 'Not available'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Type</p>
                    <p className="font-medium">{subsection.cocType || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Status</p>
                    <Badge variant={subsection.cocNumber ? "default" : "destructive"}>
                      {subsection.cocNumber ? 'Valid' : 'Missing'}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Metering Data */}
            <Card>
              <CardHeader>
                <CardTitle>Metering Data</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Meter Serial Number</p>
                    <p className="font-medium">{subsection.meterSerialNumber || 'Not available'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">CT Ratio</p>
                    <p className="font-medium">{subsection.ctRatio || 'Not available'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* QR Code Tab */}
        <TabsContent value="qr-code" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>QR Code</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center py-8">
              {qrCodeUrl ? (
                <>
                  <img src={qrCodeUrl} alt="QR Code" className="w-64 h-64 border rounded-lg" />
                  <p className="text-sm text-muted-foreground mt-4 text-center max-w-md">
                    Scan this QR code to quickly access this subsection's details
                  </p>
                  <Button 
                    className="mt-4"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.download = `${subsection.name}-qr-code.png`;
                      link.href = qrCodeUrl;
                      link.click();
                      toast.success('QR code downloaded');
                    }}
                  >
                    Download QR Code
                  </Button>
                </>
              ) : (
                <p className="text-muted-foreground">Generating QR code...</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SubsectionDetail;
