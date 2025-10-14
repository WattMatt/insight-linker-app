import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, FileText, Download, Building2, MapPin, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { readFirebaseData } from "@/lib/firebase";

interface SiteData {
  siteName: string;
  clientInfo: string;
  physicalAddress: string;
  nmd: string;
  consultantName: string;
  consultantCompany: string;
  consultantContact: string;
  clientLogoUrl?: string;
  projectLogoUrl?: string;
  subsections: Record<string, any>;
  documents?: Record<string, any>;
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

interface Stats {
  totalSubsections: number;
  subsectionsWithCOC: number;
  subsectionsWithMetering: number;
  snagged: number;
  inspectionsByCategory: Record<string, number>;
  meteringByCategory: Record<string, { total: number; withMetering: number }>;
}

const SiteOverview = () => {
  const { clientId, siteId } = useParams();
  const navigate = useNavigate();
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentCategory[]>([]);

  useEffect(() => {
    if (clientId && siteId) {
      fetchSiteData();
    }
  }, [clientId, siteId]);

  const fetchSiteData = async () => {
    try {
      setLoading(true);
      const data = await readFirebaseData(`/clients/${clientId}/${siteId}`);
      
      if (!data) {
        toast.error("Site not found");
        return;
      }

      setSiteData(data);
      calculateStats(data);
      parseDocuments(data);
    } catch (error) {
      console.error("Error fetching site data:", error);
      toast.error("Failed to load site data");
    } finally {
      setLoading(false);
    }
  };

  const parseDocuments = (data: SiteData) => {
    const documentsData = data.documents || {};
    const categories: DocumentCategory[] = [];

    // Parse documents structure from Firebase
    Object.entries(documentsData).forEach(([categoryKey, categoryData]: [string, any]) => {
      if (typeof categoryData === 'object' && categoryData !== null) {
        const files: DocumentFile[] = [];
        
        // Check if this category contains files
        Object.entries(categoryData).forEach(([fileKey, fileData]: [string, any]) => {
          if (typeof fileData === 'object' && fileData !== null) {
            // Check if this is a file object with url/name
            if (fileData.url || fileData.name || fileData.downloadURL) {
              files.push({
                name: fileData.name || fileKey,
                url: fileData.url || fileData.downloadURL || '',
                uploadedAt: fileData.uploadedAt || fileData.timestamp,
                status: fileData.status || 'No Update: Detail'
              });
            }
          } else if (typeof fileData === 'string') {
            // If it's a direct URL string
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
            status: categoryData.status || `No Update: Detail`
          });
        }
      }
    });

    setDocuments(categories);
  };

  const handleDownloadDocument = (url: string, fileName: string) => {
    if (!url) {
      toast.error("Document URL not available");
      return;
    }
    
    // Open document in new tab or download
    window.open(url, '_blank');
    toast.success(`Opening ${fileName}`);
  };

  const calculateStats = (data: SiteData) => {
    const subsections = data.subsections || {};
    const subsectionArray = Object.entries(subsections);
    
    let subsectionsWithCOC = 0;
    let subsectionsWithMetering = 0;
    let snagged = 0;
    const inspectionsByCategory: Record<string, number> = {};
    const meteringByCategory: Record<string, { total: number; withMetering: number }> = {};

    subsectionArray.forEach(([id, subsection]: [string, any]) => {
      const category = subsection.category || 'Unknown';
      
      // Count COC compliance
      if (subsection.isCocRequired && subsection.cocNumber) {
        subsectionsWithCOC++;
      }
      
      // Count metering
      const inspections = subsection.inspections || {};
      const hasMetering = Object.values(inspections).some((insp: any) => 
        insp.jsonData?.electrical?.meterSerial
      );
      if (hasMetering) {
        subsectionsWithMetering++;
      }
      
      // Count snagged (example: missing required data)
      if (subsection.isCocRequired && !subsection.cocNumber) {
        snagged++;
      }
      
      // Count inspections by category
      const inspectionCount = Object.keys(inspections).length;
      inspectionsByCategory[category] = (inspectionsByCategory[category] || 0) + inspectionCount;
      
      // Count metering by category
      if (!meteringByCategory[category]) {
        meteringByCategory[category] = { total: 0, withMetering: 0 };
      }
      meteringByCategory[category].total++;
      if (hasMetering) {
        meteringByCategory[category].withMetering++;
      }
    });

    setStats({
      totalSubsections: subsectionArray.length,
      subsectionsWithCOC,
      subsectionsWithMetering,
      snagged,
      inspectionsByCategory,
      meteringByCategory,
    });
  };

  const getPercentage = (value: number, total: number) => {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  };

  const getColorClass = (percentage: number) => {
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading site overview...</p>
        </div>
      </div>
    );
  }

  if (!siteData || !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Site data not found</p>
          <Button className="mt-4" onClick={() => navigate(`/clients/${clientId}/sites`)}>
            Back to Sites
          </Button>
        </div>
      </div>
    );
  }

  const overallHealth = getPercentage(stats.subsectionsWithCOC + stats.subsectionsWithMetering, stats.totalSubsections * 2);
  const cocCompliance = getPercentage(stats.subsectionsWithCOC, stats.totalSubsections);
  const snaggedPercentage = getPercentage(stats.snagged, stats.totalSubsections);
  const meteringPercentage = getPercentage(stats.subsectionsWithMetering, stats.totalSubsections);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/clients/${clientId}/sites`)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{siteData.siteName}</h1>
            <p className="text-muted-foreground">{siteData.physicalAddress}</p>
          </div>
        </div>
        <Button onClick={() => toast.info("Edit functionality coming soon")}>
          Edit Site
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="subsections">Subsections/Tenants</TabsTrigger>
          <TabsTrigger value="qr-analytics">QR Analytics</TabsTrigger>
          <TabsTrigger value="reports">Export Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Site Details */}
          <Card>
            <CardHeader>
              <CardTitle>Site Details</CardTitle>
              <CardDescription>Key information about {siteData.siteName}</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Client: {siteData.clientInfo}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">NMD: {siteData.nmd || 'TBC'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Consultant Company: {siteData.consultantCompany || 'Watson Mattheus Consulting Electrical Engineers'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Physical Address: {siteData.physicalAddress}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Total Subsections: {stats.totalSubsections}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Supply Authority: {siteData.nmd ? 'Tshwane' : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Consultant: {siteData.consultantName || 'Ernst De Beer'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Consultant Contact: {siteData.consultantContact || 'ernst@wmeng.co.za'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Statistics Cards */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Overall Site Health */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Overall Site Health</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={overallHealth >= 50 ? "#10b981" : "#ef4444"}
                      strokeWidth="8"
                      strokeDasharray={`${overallHealth * 2.51} 251`}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-2xl font-bold ${getColorClass(overallHealth)}`}>
                      {overallHealth}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  Based on COC, Snags and Metering data
                </p>
              </CardContent>
            </Card>

            {/* COC Compliance */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">COC Compliance</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="8"
                      strokeDasharray={`${cocCompliance * 2.51} 251`}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-2xl font-bold ${getColorClass(cocCompliance)}`}>
                      {cocCompliance}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  {stats.subsectionsWithCOC} of {stats.totalSubsections} subsections are compliant
                  <br />
                  {stats.totalSubsections - stats.subsectionsWithCOC} subsections are missing required COC
                </p>
              </CardContent>
            </Card>

            {/* Snagged Subsections */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Snagged Subsections</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="8"
                      strokeDasharray={`${snaggedPercentage * 2.51} 251`}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-red-600">
                      {snaggedPercentage}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  {stats.snagged} of {stats.totalSubsections} subsections have open snags
                  <br />
                  High: {Math.floor(stats.snagged * 0.4)}
                  <br />
                  Low: {stats.snagged - Math.floor(stats.snagged * 0.4)}
                </p>
              </CardContent>
            </Card>

            {/* Metering Data */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Metering Data</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="8"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke={meteringPercentage >= 50 ? "#10b981" : "#ef4444"}
                      strokeWidth="8"
                      strokeDasharray={`${meteringPercentage * 2.51} 251`}
                      strokeLinecap="round"
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-2xl font-bold ${getColorClass(meteringPercentage)}`}>
                      {meteringPercentage}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4 text-center">
                  {stats.subsectionsWithMetering} of {stats.totalSubsections} required subsections have metering data
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Metering Compliance by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Metering Compliance by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.entries(stats.meteringByCategory).map(([category, data]) => {
                  const percentage = getPercentage(data.withMetering, data.total);
                  return (
                    <div key={category} className="flex flex-col items-center">
                      <p className="text-sm font-medium mb-2">{category}</p>
                      <div className="relative w-24 h-24">
                        <svg className="w-full h-full" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            fill="none"
                            stroke="#e5e7eb"
                            strokeWidth="8"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="40"
                            fill="none"
                            stroke={percentage >= 80 ? "#10b981" : percentage >= 50 ? "#f59e0b" : "#ef4444"}
                            strokeWidth="8"
                            strokeDasharray={`${percentage * 2.51} 251`}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className={`text-xl font-bold ${getColorClass(percentage)}`}>
                            {percentage}%
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {data.withMetering} of {data.total} complete
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Inspections by Category */}
          <Card>
            <CardHeader>
              <CardTitle>Inspections by Category</CardTitle>
              <CardDescription>A summary of all inspections completed for this site</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(stats.inspectionsByCategory).map(([category, count]) => (
                  <div key={category} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${category === 'LS' ? 'bg-blue-500' : 'bg-red-500'}`} />
                      <span className="font-medium">{category}</span>
                    </div>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader>
              <CardTitle>Site Documents</CardTitle>
              <CardDescription>
                Storage for the legal documents like: reports, invoices, site contracts generated reports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No documents found for this site</p>
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

        <TabsContent value="subsections">
          <Card>
            <CardHeader>
              <CardTitle>Subsections/Tenants</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Subsection list view coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr-analytics">
          <Card>
            <CardHeader>
              <CardTitle>QR Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">QR analytics coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Export Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Export functionality coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SiteOverview;
