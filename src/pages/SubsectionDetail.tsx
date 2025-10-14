import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, ClipboardCheck, FileText, Upload, AlertCircle, QrCode as QrCodeIcon, Edit } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import QRCode from "qrcode";

interface Subsection {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  coc_status: string;
  coc_number: string | null;
  coc_issue_date: string | null;
  coc_type: string | null;
  metering_status: string;
  meter_serial_number: string | null;
  ct_ratio: string | null;
  is_compliant: boolean;
  is_coc_required: boolean;
  tenant_name: string | null;
  sites: {
    id: string;
    name: string;
    clients: {
      id: string;
      name: string;
    };
  };
}

interface Inspection {
  id: string;
  title: string;
  status: string;
  inspection_date: string | null;
  priority: string;
}

interface DocumentCategory {
  id: string;
  name: string;
  order_index: number;
  documents: SubsectionDocument[];
}

interface SubsectionDocument {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  uploaded_at: string;
}

const SubsectionDetail = () => {
  const { clientId, siteId, subsectionId } = useParams();
  const navigate = useNavigate();
  const [subsection, setSubsection] = useState<Subsection | null>(null);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [documentCategories, setDocumentCategories] = useState<DocumentCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [cocForm, setCocForm] = useState({
    coc_number: "",
    issue_date: "",
    type: "Supplementary",
  });
  const [meteringForm, setMeteringForm] = useState({
    meter_serial_number: "",
    ct_ratio: "",
  });

  useEffect(() => {
    fetchSubsectionData();
  }, [subsectionId]);

  useEffect(() => {
    if (subsectionId) {
      generateQRCode();
    }
  }, [subsectionId]);

  const fetchSubsectionData = async () => {
    try {
      const [subsectionRes, inspectionsRes, categoriesRes] = await Promise.all([
        supabase
          .from("subsections")
          .select("*, sites(id, name, clients(id, name))")
          .eq("id", subsectionId)
          .single(),
        supabase
          .from("inspections")
          .select("*")
          .eq("subsection_id", subsectionId)
          .order("created_at", { ascending: false }),
        supabase
          .from("document_categories")
          .select("*")
          .eq("subsection_id", subsectionId)
          .order("order_index"),
      ]);

      if (subsectionRes.error) throw subsectionRes.error;
      if (inspectionsRes.error) throw inspectionsRes.error;

      const sub = subsectionRes.data;
      setSubsection(sub);
      setInspections(inspectionsRes.data || []);

      // Fetch documents for each category
      const categories = categoriesRes.data || [];
      const categoriesWithDocs = await Promise.all(
        categories.map(async (cat) => {
          const { data: docs } = await supabase
            .from("subsection_documents")
            .select("*")
            .eq("category_id", cat.id);
          return { ...cat, documents: docs || [] };
        })
      );
      setDocumentCategories(categoriesWithDocs);

      // Set form data
      if (sub) {
        setCocForm({
          coc_number: sub.coc_number || "",
          issue_date: sub.coc_issue_date || "",
          type: sub.coc_type || "Supplementary",
        });
        setMeteringForm({
          meter_serial_number: sub.meter_serial_number || "",
          ct_ratio: sub.ct_ratio || "",
        });
      }
    } catch (error) {
      console.error("Error fetching subsection data:", error);
      toast.error("Failed to fetch subsection data");
    } finally {
      setLoading(false);
    }
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

  const handleCocUpdate = async () => {
    try {
      const { error } = await supabase
        .from("subsections")
        .update({
          coc_number: cocForm.coc_number,
          coc_issue_date: cocForm.issue_date,
          coc_type: cocForm.type,
          coc_status: "Approved",
        })
        .eq("id", subsectionId);

      if (error) throw error;
      toast.success("COC details updated");
      fetchSubsectionData();
    } catch (error) {
      console.error("Error updating COC:", error);
      toast.error("Failed to update COC");
    }
  };

  const handleMeteringUpdate = async () => {
    try {
      const { error } = await supabase
        .from("subsections")
        .update({
          meter_serial_number: meteringForm.meter_serial_number,
          ct_ratio: meteringForm.ct_ratio,
        })
        .eq("id", subsectionId);

      if (error) throw error;
      toast.success("Metering details updated");
      fetchSubsectionData();
    } catch (error) {
      console.error("Error updating metering:", error);
      toast.error("Failed to update metering");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Completed":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      case "In Progress":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "Pending":
        return "bg-orange-500/10 text-orange-500 border-orange-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      case "Medium":
        return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
      case "Low":
        return "bg-green-500/10 text-green-500 border-green-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
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

  if (!subsection) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-semibold mb-2">Subsection not found</h3>
        <Button onClick={() => navigate(`/clients/${clientId}/sites/${siteId}`)}>
          Back to Site
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/clients" },
          { label: subsection.sites.clients.name, href: `/clients/${clientId}` },
          { label: subsection.sites.name, href: `/clients/${clientId}/sites/${siteId}` },
          { label: subsection.name },
        ]}
      />

      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-500 rounded flex items-center justify-center text-white font-bold">
              {subsection.category?.substring(0, 2) || "EE"}
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {subsection.name} - {subsection.sites.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                Subsection of {subsection.sites.name}
              </p>
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="inspections">Inspections</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="coc-metering">COC Docs & Metering Data</TabsTrigger>
          <TabsTrigger value="qr-code">QR Code</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {!subsection.is_compliant && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Compliance Status: Fail</strong>
                <br />
                This status is determined by open snags and COC validation. The following issues were found:
                <ul className="list-disc list-inside mt-2">
                  <li>BCE on right hand side loose.</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

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
                <p className="font-medium">{subsection.tenant_name || subsection.sites.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">COC Required</p>
                <Badge variant={subsection.is_coc_required ? "default" : "secondary"}>
                  {subsection.is_coc_required ? "Yes" : "No"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Inspections
                <Button variant="link" size="sm">View All</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inspections.length === 0 ? (
                <p className="text-sm text-muted-foreground">No inspections found</p>
              ) : (
                <div className="space-y-2">
                  {inspections.slice(0, 3).map((inspection) => (
                    <div 
                      key={inspection.id} 
                      className="flex justify-between items-center p-3 border rounded cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}/inspections/${inspection.id}`)}
                    >
                      <div>
                        <p className="font-medium">{inspection.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {inspection.inspection_date
                            ? format(new Date(inspection.inspection_date), "MMMM dd, yyyy")
                            : "No date"}
                        </p>
                      </div>
                      <Badge variant="outline" className={getStatusColor(inspection.status)}>
                        {inspection.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                Documents
                <Button variant="link" size="sm">View All</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {documentCategories.reduce((sum, cat) => sum + cat.documents.length, 0)} file(s) found for this subsection.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inspections" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Inspections</h3>
            <Button onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}/inspections/new`)}>
              <Plus className="mr-2 h-4 w-4" />
              Create Inspection
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {inspections.length === 0 ? (
                <div className="text-center py-12">
                  <ClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No inspections yet</h3>
                  <p className="text-muted-foreground">Create an inspection for this subsection</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inspections.map((inspection) => (
                      <TableRow 
                        key={inspection.id} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/${subsectionId}/inspections/${inspection.id}`)}
                      >
                        <TableCell className="font-medium">{inspection.title}</TableCell>
                        <TableCell>
                          {inspection.inspection_date
                            ? format(new Date(inspection.inspection_date), "MMMM dd, yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusColor(inspection.status)}>
                            {inspection.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Documents</h3>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Category
            </Button>
          </div>

          {documentCategories.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No document categories</h3>
                <p className="text-muted-foreground">Create categories to organize documents</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {documentCategories.map((category) => (
                <Card key={category.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{category.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {category.documents.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-sm text-muted-foreground mb-3">
                          Add a document to this category
                        </p>
                        <div className="flex gap-2 items-center justify-center">
                          <Input type="file" className="max-w-xs" />
                          <Button size="sm">
                            <Upload className="mr-2 h-4 w-4" />
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {category.documents.map((doc) => (
                          <div key={doc.id} className="flex justify-between items-center p-2 border rounded">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{doc.file_name}</span>
                              {doc.file_size && (
                                <span className="text-xs text-muted-foreground">
                                  {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                                </span>
                              )}
                            </div>
                            <Button variant="ghost" size="sm">Delete</Button>
                          </div>
                        ))}
                        <div className="flex gap-2 items-center pt-2">
                          <Input type="file" className="max-w-xs text-sm" />
                          <Button size="sm">
                            <Upload className="mr-2 h-4 w-4" />
                            Save
                          </Button>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="coc-metering" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Uploaded COC Documents</CardTitle>
              <CardDescription>
                Select a document to view and edit its details. Mark it as valid or invalid.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {subsection.coc_number ? (
                <div className="border-2 border-primary rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      <span className="font-medium">{subsection.name}.pdf</span>
                    </div>
                    <Button variant="ghost" size="sm">Delete</Button>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500">Pass</Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">COC #</p>
                      <p className="text-sm font-medium">{subsection.coc_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Issue Date</p>
                      <p className="text-sm font-medium">
                        {subsection.coc_issue_date
                          ? format(new Date(subsection.coc_issue_date), "yyyy-MM-dd")
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Type</p>
                      <p className="text-sm font-medium">{subsection.coc_type || "—"}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No COC documents uploaded yet</p>
              )}

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-4">Verify COC: {subsection.name}.pdf</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter the COC details and mark its validity.
                </p>
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="coc_number">COC Number</Label>
                    <Input
                      id="coc_number"
                      value={cocForm.coc_number}
                      onChange={(e) => setCocForm({ ...cocForm, coc_number: e.target.value })}
                      placeholder="ECA M0327258"
                    />
                  </div>
                  <div>
                    <Label htmlFor="issue_date">Issue Date</Label>
                    <Input
                      id="issue_date"
                      type="date"
                      value={cocForm.issue_date}
                      onChange={(e) => setCocForm({ ...cocForm, issue_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <Select value={cocForm.type} onValueChange={(val) => setCocForm({ ...cocForm, type: val })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Supplementary">Supplementary</SelectItem>
                        <SelectItem value="Full">Full</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleCocUpdate}>Mark as Valid</Button>
                    <Button variant="outline">Mark as Invalid</Button>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-4">Upload New COC Document</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload a scanned copy or image. A new COC record will be created for it.
                </p>
                <div className="flex gap-2 items-center">
                  <Input type="file" accept=".pdf,image/*" />
                  <Button>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Document
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Metering Details & Documents</CardTitle>
              <CardDescription>
                Manage metering-specific data and calibration certificates or test reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="meter_serial">Meter Serial Number</Label>
                  <Input
                    id="meter_serial"
                    value={meteringForm.meter_serial_number}
                    onChange={(e) => setMeteringForm({ ...meteringForm, meter_serial_number: e.target.value })}
                    placeholder="32752347"
                  />
                </div>
                <div>
                  <Label htmlFor="ct_ratio">CT Ratio</Label>
                  <Input
                    id="ct_ratio"
                    value={meteringForm.ct_ratio}
                    onChange={(e) => setMeteringForm({ ...meteringForm, ct_ratio: e.target.value })}
                    placeholder="3:1/6:5"
                  />
                </div>
              </div>
              <Button onClick={handleMeteringUpdate}>Save Metering Details</Button>

              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Metering Documents</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Upload calibration certificates or test reports
                </p>
                <div className="flex gap-2 items-center">
                  <Input type="file" />
                  <Button>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="qr-code" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>QR Code</CardTitle>
              <CardDescription>
                Scan this code to quickly access this subsection
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {qrCodeUrl && (
                <>
                  <img src={qrCodeUrl} alt="QR Code" className="mb-4 border rounded p-4" />
                  <Button onClick={() => {
                    const link = document.createElement('a');
                    link.download = `${subsection.name}-qr-code.png`;
                    link.href = qrCodeUrl;
                    link.click();
                  }}>
                    Download QR Code
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SubsectionDetail;
