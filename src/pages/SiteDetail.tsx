import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { readFirebaseData } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { FileText, QrCode, Plus, Layers, MapPin, Building, User, Mail, Download } from "lucide-react";
import { toast } from "sonner";
import { SiteSummaryReport } from "@/components/SiteSummaryReport";

interface Site {
  id: string;
  name: string;
  address: string | null;
  site_type: string | null;
  client_id: string;
  supply_authority: string | null;
  nominated_max_demand: string | null;
  consultant_name: string | null;
  consultant_company: string | null;
  consultant_contact: string | null;
  clients: {
    id: string;
    name: string;
  };
}

interface Subsection {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  coc_status: string;
  metering_status: string;
  is_compliant: boolean;
  is_coc_required: boolean;
  tenant_name: string | null;
  coc_number: string | null;
  meter_serial_number: string | null;
  ct_ratio: string | null;
}

interface SiteDocument {
  category: string;
  file_count: number;
}

interface FirebaseDocument {
  name: string;
  url: string;
  category: string;
  fbKey: string;
}

interface Inspection {
  id: string;
  subsection_id: string | null;
  inspection_date: string;
  json_data: any;
}

interface SiteStats {
  totalSubsections: number;
  compliantCount: number;
  cocApprovedCount: number;
  meteringInstalledCount: number;
  openSnags: number;
}

const SiteDetail = () => {
  const { clientId, siteId } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [subsections, setSubsections] = useState<Subsection[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [documents, setDocuments] = useState<SiteDocument[]>([]);
  const [firebaseDocuments, setFirebaseDocuments] = useState<FirebaseDocument[]>([]);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    fetchSiteData();
  }, [siteId]);

  const fetchSiteData = async () => {
    try {
      const [siteRes, subsectionsRes, inspectionsRes, docsRes] = await Promise.all([
        supabase
          .from("sites")
          .select("*, clients(id, name)")
          .eq("id", siteId)
          .maybeSingle(),
        supabase
          .from("subsections")
          .select("*")
          .eq("site_id", siteId)
          .order("name"),
        supabase
          .from("inspections")
          .select("id, subsection_id, inspection_date, json_data")
          .eq("site_id", siteId)
          .order("inspection_date", { ascending: false }),
        supabase
          .from("site_documents")
          .select("category, id")
          .eq("site_id", siteId),
      ]);

      if (siteRes.error) throw siteRes.error;
      if (subsectionsRes.error) throw subsectionsRes.error;
      if (inspectionsRes.error) throw inspectionsRes.error;

      setSite(siteRes.data);
      const subs = subsectionsRes.data || [];
      const insp = inspectionsRes.data || [];
      setSubsections(subs);
      setInspections(insp);
      
      // Aggregate documents by category
      const docsData = docsRes.data || [];
      const aggregated = docsData.reduce((acc, doc) => {
        const existing = acc.find(d => d.category === doc.category);
        if (existing) {
          existing.file_count++;
        } else {
          acc.push({ category: doc.category, file_count: 1 });
        }
        return acc;
      }, [] as SiteDocument[]);
      
      setDocuments(aggregated);

      // Fetch Firebase documents if site has firebase_id
      if (siteRes.data.firebase_id && siteRes.data.clients) {
        try {
          // First, get the client's firebase_id
          const { data: clientData } = await supabase
            .from('clients')
            .select('firebase_id')
            .eq('id', siteRes.data.client_id)
            .maybeSingle();
          
          if (clientData?.firebase_id) {
            // Sites are nested under clients in Firebase: clients/{clientFirebaseId}/{siteFirebaseId}
            const fbSiteData = await readFirebaseData(`clients/${clientData.firebase_id}/${siteRes.data.firebase_id}`);
            if (fbSiteData) {
              const fbDocs: FirebaseDocument[] = [];
              const siteDocuments = fbSiteData.documents || fbSiteData.Documents || fbSiteData.files || fbSiteData.Files;
              
              if (siteDocuments && typeof siteDocuments === 'object') {
                Object.entries(siteDocuments).forEach(([categoryName, categoryDocs]: [string, any]) => {
                  if (categoryDocs && typeof categoryDocs === 'object') {
                    Object.entries(categoryDocs).forEach(([docKey, docData]: [string, any]) => {
                      if (docData && typeof docData === 'object' && docData.url) {
                        fbDocs.push({
                          name: docData.name || docKey,
                          url: docData.url,
                          category: categoryName,
                          fbKey: docKey
                        });
                      }
                    });
                  }
                });
              }
              setFirebaseDocuments(fbDocs);
            }
          }
        } catch (fbError) {
          console.error("Error fetching Firebase documents:", fbError);
        }
      }

      // Calculate stats from inspection data with Firebase rules
      const totalSubsections = subs.length;
      
      // Calculate compliant count using Firebase rules
      let compliantCount = 0;
      subs.forEach(sub => {
        // Rule 1: If COC required, must be approved
        if (sub.is_coc_required && sub.coc_status !== 'Approved') {
          return; // Not compliant
        }
        
        // Rule 2: If COC required, metering must not be missing
        if (sub.is_coc_required && sub.metering_status === 'Missing') {
          return; // Not compliant
        }
        
        // Rule 3: Check for open snags
        const latestInspection = insp.find(i => i.subsection_id === sub.id);
        let hasOpenSnags = false;
        if (latestInspection?.json_data) {
          const jsonData = latestInspection.json_data as any;
          if (jsonData.sections && Array.isArray(jsonData.sections)) {
            jsonData.sections.forEach((section: any) => {
              if (section.items && Array.isArray(section.items)) {
                const openItems = section.items.filter((item: any) => 
                  item.status !== 'Pass' && item.status !== 'N/A'
                );
                if (openItems.length > 0) hasOpenSnags = true;
              }
            });
          }
        }
        
        if (hasOpenSnags) {
          return; // Not compliant
        }
        
        // All checks passed
        compliantCount++;
      });
      
      const cocApprovedCount = subs.filter((s) => s.coc_status === "Approved").length;
      const meteringInstalledCount = subs.filter((s) => s.metering_status === "Installed").length;
      
      // Calculate open snags from inspections
      let totalOpenSnags = 0;
      subs.forEach(sub => {
        const latestInspection = insp.find(i => i.subsection_id === sub.id);
        if (latestInspection?.json_data) {
          const jsonData = latestInspection.json_data as any;
          if (jsonData.sections && Array.isArray(jsonData.sections)) {
            jsonData.sections.forEach((section: any) => {
              if (section.items && Array.isArray(section.items)) {
                const openItems = section.items.filter((item: any) => 
                  item.status !== 'Pass' && item.status !== 'N/A'
                );
                totalOpenSnags += openItems.length;
              }
            });
          }
        }
      });

      setStats({
        totalSubsections,
        compliantCount,
        cocApprovedCount,
        meteringInstalledCount,
        openSnags: totalOpenSnags,
      });
    } catch (error) {
      console.error("Error fetching site data:", error);
      toast.error("Failed to fetch site data");
    } finally {
      setLoading(false);
    }
  };

  const migrateDocument = async (doc: FirebaseDocument) => {
    if (!site) return;
    
    setMigrating(doc.fbKey);
    try {
      // Check if already migrated
      const { data: existing } = await supabase
        .from('site_documents')
        .select('id')
        .eq('site_id', site.id)
        .eq('file_url', doc.url)
        .maybeSingle();

      if (existing) {
        toast.info("Document already migrated");
        setMigrating(null);
        return;
      }

      // Insert site document record
      const { error: insertError } = await supabase.from('site_documents').insert([{
        site_id: site.id,
        category: doc.category,
        file_name: doc.name,
        file_url: doc.url,
      }]);

      if (insertError) throw insertError;

      toast.success(`Migrated: ${doc.name}`);
      await fetchSiteData(); // Refresh data
    } catch (error) {
      console.error("Migration error:", error);
      toast.error("Failed to migrate document");
    } finally {
      setMigrating(null);
    }
  };

  const CircularProgress = ({ value, color }: { value: number; color: string }) => (
    <div className="relative inline-flex items-center justify-center w-32 h-32">
      <svg className="transform -rotate-90 w-32 h-32">
        <circle
          cx="64"
          cy="64"
          r="56"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          className="text-muted"
        />
        <circle
          cx="64"
          cy="64"
          r="56"
          stroke="currentColor"
          strokeWidth="8"
          fill="none"
          strokeDasharray={`${2 * Math.PI * 56}`}
          strokeDashoffset={`${2 * Math.PI * 56 * (1 - value / 100)}`}
          className={color}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute text-2xl font-bold">{value}%</span>
    </div>
  );

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

  if (!site) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">Site not found</h3>
        <Button onClick={() => navigate(`/clients/${clientId}`)}>Back to Client</Button>
      </div>
    );
  }

  // Calculate compliance based on Firebase rules
  const calculateCompliance = (subsection: Subsection) => {
    // Rule 1: If COC is required, must have approved COC
    if (subsection.is_coc_required && subsection.coc_status !== 'Approved') {
      return false;
    }
    
    // Rule 2: If COC is required, metering must not be missing
    if (subsection.is_coc_required && subsection.metering_status === 'Missing') {
      return false;
    }
    
    // Rule 3: Must have zero open snags
    const openSnags = getOpenSnags(subsection.id);
    if (openSnags > 0) {
      return false;
    }
    
    return true;
  };
  
  const overallHealth = stats ? Math.round((stats.compliantCount / stats.totalSubsections) * 100) || 0 : 0;
  const cocCompliance = stats ? Math.round((stats.cocApprovedCount / stats.totalSubsections) * 100) || 0 : 0;
  const meteringPercentage = stats ? Math.round((stats.meteringInstalledCount / stats.totalSubsections) * 100) || 0 : 0;
  
  // Helper functions
  const getLastInspectionDate = (subsectionId: string) => {
    const inspection = inspections.find(i => i.subsection_id === subsectionId);
    return inspection?.inspection_date || null;
  };
  
  const getOpenSnags = (subsectionId: string) => {
    const inspection = inspections.find(i => i.subsection_id === subsectionId);
    if (!inspection?.json_data) return 0;
    
    const jsonData = inspection.json_data as any;
    if (!jsonData.sections || !Array.isArray(jsonData.sections)) return 0;
    
    let count = 0;
    jsonData.sections.forEach((section: any) => {
      if (section.items && Array.isArray(section.items)) {
        count += section.items.filter((item: any) => 
          item.status !== 'Pass' && item.status !== 'N/A'
        ).length;
      }
    });
    return count;
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/clients" },
          { label: site.clients.name, href: `/clients/${clientId}` },
          { label: site.name },
        ]}
      />

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{site.name}</h1>
          <p className="text-muted-foreground mt-1">{site.address}</p>
        </div>
        <Button variant="outline">
          Edit Site
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="subsections">Subsections/Tenants</TabsTrigger>
          <TabsTrigger value="qr-analytics">QR Analytics</TabsTrigger>
          <TabsTrigger value="export">Export Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Site Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Site Details</CardTitle>
              <CardDescription>Key information about {site.name}</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Client</p>
                  <p className="font-medium">{site.clients.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">NMD</p>
                  <p className="font-medium">{site.nominated_max_demand || "TBC"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Consultant Company</p>
                  <p className="font-medium">{site.consultant_company || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Physical Address</p>
                  <p className="font-medium">{site.address || "—"}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Supply Authority</p>
                  <p className="font-medium">{site.supply_authority || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Consultant</p>
                  <p className="font-medium">{site.consultant_name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Consultant Contact</p>
                  <p className="font-medium">{site.consultant_contact || "—"}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-sm text-muted-foreground">
            Total Subsections: <span className="font-semibold text-foreground">{stats?.totalSubsections || 0}</span>
          </div>

          {/* Stats Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Overall Site Health</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <CircularProgress value={overallHealth} color="text-green-500" />
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Based on CoC, snags and Metering data
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">COC Compliance</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <CircularProgress value={cocCompliance} color="text-yellow-500" />
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  {stats?.cocApprovedCount || 0} of {stats?.totalSubsections || 0} required COCs are compliant
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Open Snags</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <div className="text-5xl font-bold text-red-500 mb-2">{stats?.openSnags || 0}</div>
                <p className="text-sm text-muted-foreground text-center">
                  Total open snags across all subsections
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Metering Data</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center">
                <CircularProgress value={meteringPercentage} color="text-red-500" />
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  {stats?.meteringInstalledCount || 0} of {stats?.totalSubsections || 0} required subsections have metering data
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          {/* Supabase Documents */}
          <Card>
            <CardHeader>
              <CardTitle>Supabase Documents</CardTitle>
              <CardDescription>Documents migrated to Supabase storage</CardDescription>
            </CardHeader>
            <CardContent>
              {documents.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No documents yet</h3>
                  <p className="text-muted-foreground text-sm">Upload documents to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc, idx) => (
                    <div key={idx} className="flex justify-between items-center p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <span className="font-medium">{doc.category}</span>
                      </div>
                      <Badge variant="secondary">{doc.file_count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Firebase Documents - hidden from UI */}
        </TabsContent>

        <TabsContent value="subsections" className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Subsections / Tenants</h3>
              <p className="text-sm text-muted-foreground">
                Manage all sub-boards or tenants at this site
              </p>
            </div>
            <Button onClick={() => {
              const basePath = clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`;
              navigate(`${basePath}/subsections/new`);
            }}>
              <Plus className="mr-2 h-4 w-4" />
              Create New Subsection
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {subsections.length === 0 ? (
                <div className="text-center py-12">
                  <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No subsections yet</h3>
                  <p className="text-muted-foreground">Create your first subsection</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>CoC</TableHead>
                      <TableHead>Metering</TableHead>
                      <TableHead>Last Inspected</TableHead>
                      <TableHead>Open Snags</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subsections.map((sub) => {
                      const lastInspected = getLastInspectionDate(sub.id);
                      const openSnags = getOpenSnags(sub.id);
                      const isCompliant = calculateCompliance(sub);
                      
                      return (
                        <TableRow
                          key={sub.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            const basePath = clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`;
                            navigate(`${basePath}/subsections/${sub.id}`);
                          }}
                        >
                          <TableCell className="font-medium">{sub.name}</TableCell>
                          <TableCell>{sub.tenant_name || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{sub.category || "—"}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                isCompliant
                                  ? "bg-green-500/10 text-green-500"
                                  : "bg-red-500/10 text-red-500"
                              }
                            >
                              {isCompliant ? "Pass" : "Fail"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                sub.coc_status === "Approved"
                                  ? "bg-green-500/10 text-green-500"
                                  : sub.is_coc_required
                                  ? "bg-red-500/10 text-red-500"
                                  : "bg-gray-500/10 text-gray-500"
                              }
                            >
                              {sub.is_coc_required ? sub.coc_status : "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                sub.metering_status === "Installed"
                                  ? "bg-green-500/10 text-green-500"
                                  : sub.is_coc_required
                                  ? "bg-red-500/10 text-red-500"
                                  : "bg-gray-500/10 text-gray-500"
                              }
                            >
                              {sub.is_coc_required ? sub.metering_status : "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {lastInspected ? new Date(lastInspected).toLocaleDateString() : "Never"}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant="outline"
                              className={openSnags > 0 ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}
                            >
                              {openSnags}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr-analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>QR Code Analytics</CardTitle>
              <CardDescription>
                A summary of QR code scan activity across all subsections for {site.name}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                QR analytics feature coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Export Report</CardTitle>
              <CardDescription>{site.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Generate comprehensive site reports with all subsection data
              </p>
              <SiteSummaryReport 
                siteId={site.id}
                siteName={site.name}
                clientName={site.clients.name}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SiteDetail;
