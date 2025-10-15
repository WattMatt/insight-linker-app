import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileText, AlertCircle, QrCode as QrCodeIcon, Edit, Download, Upload, Trash2, Plus } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { format } from "date-fns";
import QRCode from "qrcode";
import { readFirebaseData } from "@/lib/firebase";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface SubsectionData {
  name: string;
  tenantName?: string;
  category: string;
  cocNumber?: string;
  cocType?: string;
  cocIssueDate?: string;
  cocValidationStatus?: string;
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
  const [cocType, setCocType] = useState<string>("");
  const [cocValidationStatus, setCocValidationStatus] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [isCreateInspectionOpen, setIsCreateInspectionOpen] = useState(false);
  const [newInspectionDate, setNewInspectionDate] = useState("");
  const [deleteInspectionId, setDeleteInspectionId] = useState<string | null>(null);
  const [actualClientId, setActualClientId] = useState<string | null>(null);
  const [linkedTemplate, setLinkedTemplate] = useState<{id: string, name: string, category: string} | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<Array<{id: string, name: string, category: string}>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateNameMap, setTemplateNameMap] = useState<Record<string, string>>({});
  const [migratingDocs, setMigratingDocs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (subsectionId) {
      fetchSubsectionData();
      generateQRCode();
      fetchTemplates();
    }
  }, [subsectionId]);

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('inspection_templates')
        .select('id, name, category')
        .order('name');
      
      if (error) throw error;
      
      setAvailableTemplates(data || []);
      
      // Create a mapping from category (which matches Firebase templateId) to template name
      const nameMap: Record<string, string> = {};
      data?.forEach(template => {
        // Map both the category and name (lowercase) to the template name for flexible matching
        if (template.category) {
          nameMap[template.category.toLowerCase()] = template.name;
        }
        nameMap[template.name.toLowerCase()] = template.name;
      });
      setTemplateNameMap(nameMap);
    } catch (error) {
      console.error("Error fetching templates:", error);
    }
  };

  const fetchSubsectionData = async () => {
    try {
      setLoading(true);
      
      // First, fetch the subsection from Supabase to get the firebase_id and client info
      const { data: supabaseSubsection, error: subsectionError } = await supabase
        .from('subsections')
        .select(`
          id,
          firebase_id,
          site_id,
          inspection_template_id,
          inspection_templates!inspection_template_id (
            id,
            name,
            category
          ),
          sites!inner (
            id,
            firebase_id,
            client_id,
            clients!inner (
              id,
              firebase_id
            )
          )
        `)
        .eq('id', subsectionId)
        .maybeSingle();

      if (subsectionError || !supabaseSubsection) {
        console.error("Error fetching subsection from Supabase:", subsectionError);
        toast.error("Subsection not found in database");
        return;
      }

      // Extract firebase IDs and store the client ID
      const firebaseClientId = supabaseSubsection.sites.clients.firebase_id;
      const firebaseSiteId = supabaseSubsection.sites.firebase_id;
      const firebaseSubsectionId = supabaseSubsection.firebase_id;
      const supabaseClientId = supabaseSubsection.sites.clients.id;
      
      setActualClientId(supabaseClientId);
      
      // Store linked template if available
      if (supabaseSubsection.inspection_templates) {
        setLinkedTemplate(supabaseSubsection.inspection_templates as any);
      }

      console.log('Firebase IDs:', { firebaseClientId, firebaseSiteId, firebaseSubsectionId });

      // Fetch subsection data from Firebase
      const data = await readFirebaseData(`/clients/${firebaseClientId}/${firebaseSiteId}/subsections/${firebaseSubsectionId}`);
      
      if (!data) {
        toast.error("Subsection data not found in Firebase");
        return;
      }

      console.log('Subsection data:', data);
      
      // Fetch inspections from Supabase
      const { data: inspectionsData, error: inspectionsError } = await supabase
        .from('inspections')
        .select('*')
        .eq('subsection_id', subsectionId)
        .order('inspection_date', { ascending: false });

      if (inspectionsError) {
        console.error("Error fetching inspections:", inspectionsError);
      }

      // Merge Firebase inspections with Supabase inspections
      const firebaseInspections = data.inspections || {};
      const inspectionsObj: Record<string, any> = { ...firebaseInspections };
      
      // Add Supabase inspections (they will override Firebase ones with same firebase_id)
      inspectionsData?.forEach(inspection => {
        const key = inspection.firebase_id || inspection.id;
        inspectionsObj[key] = {
          templateId: inspection.template_id,
          date: inspection.inspection_date,
          status: inspection.status,
          priority: inspection.priority,
          title: inspection.title,
        };
      });

      // Set subsection with merged inspections
      setSubsection({
        ...data,
        inspections: inspectionsObj
      });
      setCocType(data.cocType || '');
      setCocValidationStatus(data.cocValidationStatus || '');
      
      // Fetch site info for header
      const siteInfo = await readFirebaseData(`/clients/${firebaseClientId}/${firebaseSiteId}`);
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

  const handleSaveCocDetails = async () => {
    if (!subsection) return;
    
    try {
      setSaving(true);
      
      // Find the subsection in Supabase by firebase_id
      const { data: supabaseSubsection, error: findError } = await supabase
        .from('subsections')
        .select('id, firebase_id')
        .eq('firebase_id', subsectionId)
        .maybeSingle();
      
      if (findError) {
        console.error("Error finding subsection:", findError);
        toast.error("Database error: " + findError.message);
        return;
      }
      
      if (!supabaseSubsection) {
        console.log("Subsection not found in Supabase. Firebase ID:", subsectionId);
        toast.error("This subsection hasn't been migrated to the database yet. Please migrate this client first.");
        return;
      }
      
      // Update the subsection with new COC details
      const { error: updateError } = await supabase
        .from('subsections')
        .update({
          coc_type: cocType,
          coc_validation_status: cocValidationStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', supabaseSubsection.id);
      
      if (updateError) {
        console.error("Error updating subsection:", updateError);
        throw updateError;
      }
      
      // Update local state
      setSubsection({
        ...subsection,
        cocType,
        cocValidationStatus
      });
      
      toast.success("COC details saved successfully");
    } catch (error) {
      console.error("Error saving COC details:", error);
      toast.error("Failed to save COC details");
    } finally {
      setSaving(false);
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

  // Helper function to find COC documents
  const getCocDocuments = () => {
    return documents.filter(cat => 
      cat.name.toLowerCase().includes('coc') || 
      cat.name.toLowerCase().includes('certificate')
    ).flatMap(cat => cat.files);
  };

  // Helper function to find metering documents
  const getMeteringDocuments = () => {
    return documents.filter(cat => 
      cat.name.toLowerCase().includes('meter') || 
      cat.name.toLowerCase().includes('metering')
    ).flatMap(cat => cat.files);
  };

  const generateQRCode = async () => {
    try {
      // QR code uses the subsectionId directly from URL params which is the Supabase UUID
      const url = `${window.location.origin}/public/clients/${clientId || 'unknown'}/sites/${siteId || 'unknown'}/subsections/${subsectionId}`;
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

  const handleMigrateDocument = async (firebaseUrl: string, fileName: string, categoryName: string) => {
    const docKey = `${categoryName}-${fileName}`;
    
    if (migratingDocs.has(docKey)) {
      return; // Already migrating
    }

    setMigratingDocs(prev => new Set(prev).add(docKey));
    
    try {
      // Check if document already exists in Supabase
      const { data: existingDoc, error: checkError } = await supabase
        .from('subsection_documents')
        .select('id')
        .eq('subsection_id', subsectionId)
        .eq('file_name', fileName)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingDoc) {
        toast.info(`${fileName} is already migrated`);
        setMigratingDocs(prev => {
          const newSet = new Set(prev);
          newSet.delete(docKey);
          return newSet;
        });
        return;
      }

      // Get or create document category
      let categoryId: string;
      const { data: existingCategory } = await supabase
        .from('document_categories')
        .select('id')
        .eq('subsection_id', subsectionId)
        .eq('name', categoryName)
        .maybeSingle();

      if (existingCategory) {
        categoryId = existingCategory.id;
      } else {
        const { data: newCategory, error: categoryError } = await supabase
          .from('document_categories')
          .insert({ subsection_id: subsectionId, name: categoryName })
          .select('id')
          .single();

        if (categoryError) throw categoryError;
        categoryId = newCategory.id;
      }

      // Migrate file using edge function
      const { data: migrationResult, error: migrationError } = await supabase.functions.invoke('migrate-storage', {
        body: {
          firebaseStorageUrl: firebaseUrl,
          targetBucket: 'documents',
          targetPath: `subsections/${subsectionId}/${fileName}`
        }
      });

      if (migrationError) throw migrationError;

      // Create subsection_documents record
      const { error: insertError } = await supabase
        .from('subsection_documents')
        .insert({
          subsection_id: subsectionId,
          category_id: categoryId,
          file_name: fileName,
          file_url: migrationResult.publicUrl
        });

      if (insertError) throw insertError;

      toast.success(`${fileName} migrated successfully`);
      
      // Refresh the data
      await fetchSubsectionData();
      
    } catch (error) {
      console.error('Error migrating document:', error);
      toast.error(`Failed to migrate ${fileName}: ${error.message}`);
    } finally {
      setMigratingDocs(prev => {
        const newSet = new Set(prev);
        newSet.delete(docKey);
        return newSet;
      });
    }
  };

  const handleCreateInspection = async () => {
    if (!newInspectionDate) {
      toast.error("Please select an inspection date");
      return;
    }

    const templateToUse = selectedTemplateId || linkedTemplate?.id;
    if (!templateToUse) {
      toast.error("Please select an inspection template");
      return;
    }

    try {
      // Get template name
      const template = availableTemplates.find(t => t.id === templateToUse) || linkedTemplate;
      const inspectionTitle = template?.name || 'New Inspection';
      
      // Generate a unique firebase-style ID for backwards compatibility
      const firebaseId = `-${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;
      
      // Create inspection in Supabase with template_id link and firebase_id
      const { data: newInspection, error } = await supabase
        .from('inspections')
        .insert({
          subsection_id: subsectionId,
          site_id: siteId,
          template_id: templateToUse,
          firebase_id: firebaseId,
          title: inspectionTitle,
          inspection_date: newInspectionDate,
          status: 'Pending',
          priority: 'Medium',
          json_data: {} // Initialize empty jsonData
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Inspection created successfully");
      setIsCreateInspectionOpen(false);
      setSelectedTemplateId("");
      setNewInspectionDate("");
      fetchSubsectionData();
    } catch (error) {
      console.error("Error creating inspection:", error);
      toast.error("Failed to create inspection");
    }
  };

  const handleUpdateInspectionStatus = async (inspectionId: string, newStatus: string) => {
    try {
      // Update using firebase_id (since inspectionId from the list is the firebase_id)
      const { error } = await supabase
        .from('inspections')
        .update({ status: newStatus })
        .eq('firebase_id', inspectionId);

      if (error) throw error;

      toast.success("Inspection status updated");
      fetchSubsectionData();
    } catch (error) {
      console.error("Error updating inspection:", error);
      toast.error("Failed to update inspection status");
    }
  };

  const handleDeleteInspection = async () => {
    if (!deleteInspectionId) return;

    try {
      // Delete using firebase_id (since deleteInspectionId is the firebase_id)
      const { error } = await supabase
        .from('inspections')
        .delete()
        .eq('firebase_id', deleteInspectionId);

      if (error) throw error;

      toast.success("Inspection deleted successfully");
      setDeleteInspectionId(null);
      fetchSubsectionData();
    } catch (error) {
      console.error("Error deleting inspection:", error);
      toast.error("Failed to delete inspection");
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

  if (!subsection || !siteData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Subsection data not found</p>
          <Button className="mt-4" onClick={() => navigate(`/clients/${actualClientId || clientId}/sites/${siteId}`)}>
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
          <Button variant="ghost" size="icon" onClick={() => navigate(`/clients/${actualClientId || clientId}/sites/${siteId}`)}>
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
                      onClick={() => navigate(`/clients/${actualClientId || clientId}/sites/${siteId}/subsections/${subsectionId}/inspections/${id}`)}
                    >
                      <div>
                        <p className="font-medium">
                          {inspection.templateId 
                            ? (templateNameMap[inspection.templateId.toLowerCase()] || inspection.templateId)
                            : (inspection.type || 'Inspection')}
                        </p>
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Inspections</CardTitle>
              <Dialog open={isCreateInspectionOpen} onOpenChange={setIsCreateInspectionOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    New Inspection
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Create New Inspection</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {linkedTemplate && (
                      <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                          This subsection is linked to the <strong>{linkedTemplate.name}</strong> template by default.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="templateSelect">Inspection Template</Label>
                      <Select 
                        value={selectedTemplateId || linkedTemplate?.id || ""} 
                        onValueChange={setSelectedTemplateId}
                      >
                        <SelectTrigger id="templateSelect" className="bg-background">
                          <SelectValue placeholder="Select a template" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover z-50">
                          {availableTemplates.map(template => (
                            <SelectItem key={template.id} value={template.id}>
                              <div>
                                <p className="font-medium">{template.name}</p>
                                <p className="text-xs text-muted-foreground">{template.category}</p>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="inspectionDate">Inspection Date</Label>
                      <Input
                        id="inspectionDate"
                        type="date"
                        value={newInspectionDate}
                        onChange={(e) => setNewInspectionDate(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => {
                      setIsCreateInspectionOpen(false);
                      setSelectedTemplateId("");
                      setNewInspectionDate("");
                    }}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateInspection}>
                      Create Inspection
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
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
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <div 
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => navigate(`/clients/${actualClientId || clientId}/sites/${siteId}/subsections/${subsectionId}/inspections/${id}`)}
                      >
                         <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {inspection.templateId 
                              ? (templateNameMap[inspection.templateId.toLowerCase()] || inspection.templateId)
                              : (inspection.type || 'Inspection')}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {inspection.date ? format(new Date(inspection.date), "dd MMMM yyyy") : "No date"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={inspection.status || 'Pending'}
                          onValueChange={(value) => handleUpdateInspectionStatus(id, value)}
                        >
                          <SelectTrigger className="w-32" onClick={(e) => e.stopPropagation()}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                            <SelectItem value="Failed">Failed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteInspectionId(id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <AlertDialog open={deleteInspectionId !== null} onOpenChange={() => setDeleteInspectionId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Inspection</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this inspection? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteInspection} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDownloadDocument(file.url, file.name)}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleMigrateDocument(file.url, file.name, category.name)}
                                  disabled={migratingDocs.has(`${category.name}-${file.name}`)}
                                >
                                  {migratingDocs.has(`${category.name}-${file.name}`) ? (
                                    <>
                                      <Upload className="h-4 w-4 mr-1 animate-pulse" />
                                      Migrating...
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="h-4 w-4 mr-1" />
                                      Migrate
                                    </>
                                  )}
                                </Button>
                              </div>
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
          <div className="space-y-6">
            {/* Certificates of Compliance */}
            <Card>
              <CardHeader>
                <CardTitle>Certificates of Compliance</CardTitle>
                <p className="text-sm text-muted-foreground">Manage COC documents and their details.</p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Existing COC Documents */}
                {(() => {
                  const cocDocs = getCocDocuments();
                  return cocDocs.length > 0 ? (
                    <div className="space-y-4">
                      {cocDocs.map((doc, idx) => (
                        <div key={idx} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{doc.name}</p>
                                <p className="text-sm text-muted-foreground">Size: 1.19 MB</p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-green-500 text-white hover:bg-green-600 border-green-500"
                            >
                              Pass
                            </Button>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <Label>COC Number</Label>
                              <Input
                                value={subsection.cocNumber || ''}
                                placeholder="ECA 642760"
                                className="mt-1"
                                readOnly
                              />
                            </div>
                            <div>
                              <Label>Issue Date</Label>
                              <Input
                                type="date"
                                value={subsection.cocIssueDate ? format(new Date(subsection.cocIssueDate), 'yyyy-MM-dd') : ''}
                                className="mt-1"
                                readOnly
                              />
                            </div>
                          </div>

                          <div className="mt-4">
                            <Label>Type</Label>
                            <div className="flex gap-4 mt-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocType-${idx}`}
                                  value="Pass"
                                  checked={cocType === 'Pass' || cocType === 'Supplementary'}
                                  onChange={(e) => setCocType(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Pass</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocType-${idx}`}
                                  value="Fail"
                                  checked={cocType === 'Fail'}
                                  onChange={(e) => setCocType(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Fail</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocType-${idx}`}
                                  value="Pending"
                                  checked={cocType === 'Pending'}
                                  onChange={(e) => setCocType(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Pending</span>
                              </label>
                            </div>
                          </div>

                          <div className="mt-4">
                            <Label>Validation Status</Label>
                            <Input
                              value={cocValidationStatus}
                              onChange={(e) => setCocValidationStatus(e.target.value)}
                              placeholder="Enter validation status"
                              className="mt-1"
                            />
                          </div>

                          <Button 
                            onClick={handleSaveCocDetails} 
                            disabled={saving}
                            className="mt-4 bg-blue-500 hover:bg-blue-600"
                          >
                            {saving ? "Saving..." : "Save Details"}
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : subsection.cocNumber ? (
                    <div className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{subsection.name} - ECA {subsection.cocNumber}.pdf</p>
                            <p className="text-sm text-muted-foreground">Size: 1.19 MB</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="bg-green-500 text-white hover:bg-green-600 border-green-500"
                        >
                          Pass
                        </Button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <Label>COC Number</Label>
                          <Input
                            value={subsection.cocNumber || ''}
                            placeholder="ECA 642760"
                            className="mt-1"
                            readOnly
                          />
                        </div>
                        <div>
                          <Label>Issue Date</Label>
                          <Input
                            type="date"
                            value={subsection.cocIssueDate ? format(new Date(subsection.cocIssueDate), 'yyyy-MM-dd') : ''}
                            className="mt-1"
                            readOnly
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <Label>Type</Label>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="cocType"
                              value="Pass"
                              checked={cocType === 'Pass' || cocType === 'Supplementary'}
                              onChange={(e) => setCocType(e.target.value)}
                              className="w-4 h-4 text-primary cursor-pointer"
                            />
                            <span className="text-sm">Pass</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="cocType"
                              value="Fail"
                              checked={cocType === 'Fail'}
                              onChange={(e) => setCocType(e.target.value)}
                              className="w-4 h-4 text-primary cursor-pointer"
                            />
                            <span className="text-sm">Fail</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="cocType"
                              value="Pending"
                              checked={cocType === 'Pending'}
                              onChange={(e) => setCocType(e.target.value)}
                              className="w-4 h-4 text-primary cursor-pointer"
                            />
                            <span className="text-sm">Pending</span>
                          </label>
                        </div>
                      </div>

                      <div className="mt-4">
                        <Label>Validation Status</Label>
                        <Input
                          value={cocValidationStatus}
                          onChange={(e) => setCocValidationStatus(e.target.value)}
                          placeholder="Enter validation status"
                          className="mt-1"
                        />
                      </div>

                      <Button 
                        onClick={handleSaveCocDetails} 
                        disabled={saving}
                        className="mt-4 bg-blue-500 hover:bg-blue-600"
                      >
                        {saving ? "Saving..." : "Save Details"}
                      </Button>
                    </div>
                  ) : null;
                })()}

                {/* Upload New COC */}
                <div>
                  <p className="text-sm font-medium mb-2">Upload a new COC document</p>
                  <div className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click to select or drag & drop files
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Metering Details & Documents */}
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle>Metering Details & Documents</CardTitle>
                <Alert className="mt-2 bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-600">
                    This information is a requirement for the subsection to pass compliance checks.
                  </AlertDescription>
                </Alert>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Meter Serial Number</Label>
                    <Input
                      value={subsection.meterSerialNumber || ''}
                      placeholder="Enter meter serial number"
                      className="mt-1"
                      readOnly
                    />
                  </div>
                  <div>
                    <Label>CT Ratio</Label>
                    <Input
                      value={subsection.ctRatio || ''}
                      placeholder="Enter CT ratio"
                      className="mt-1"
                      readOnly
                    />
                  </div>
                </div>

                <div>
                  <Label>Metering Documents</Label>
                  {(() => {
                    const meteringDocs = getMeteringDocuments();
                    return meteringDocs.length > 0 ? (
                      <div className="mt-2 space-y-2">
                        {meteringDocs.map((doc, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{doc.name}</span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDownloadDocument(doc.url, doc.name)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-sm text-muted-foreground">
                          No metering documents uploaded.
                        </p>
                      </div>
                    );
                  })()}
                </div>

                {/* Upload Metering Document */}
                <div>
                  <p className="text-sm font-medium mb-2">Upload a new metering document</p>
                  <div className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Click to select or drag & drop files
                    </p>
                  </div>
                </div>

                <Button className="w-full md:w-auto bg-blue-500 hover:bg-blue-600">
                  Save Metering Details
                </Button>
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
                    Scan this QR code to view public subsection details, documents, and COC
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
