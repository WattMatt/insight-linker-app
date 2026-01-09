import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { FileText, QrCode, Layers, MapPin, Building, Image, BarChart3, FileDown, LayoutGrid, ClipboardCheck, Shield, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ComplianceDashboard } from "@/components/ComplianceDashboard";
import { DocumentPreviewDialog } from '@/components/DocumentPreviewDialog';
import { downloadFile } from '@/lib/fileDownload';
import { Site, Subsection, SiteStats } from "@/types/site";
import { SiteOverview } from "@/components/site/SiteOverview";
import { SubsectionList } from "@/components/site/SubsectionList";
import { SiteDocuments as SiteDocumentsComponent } from "@/components/site/SiteDocuments";
import { QRAnalytics } from "@/components/site/QRAnalytics";
import { SiteImages } from "@/components/site/SiteImages";
import { SiteExport } from "@/components/site/SiteExport";
import { SiteEditDialog } from "@/components/site/SiteEditDialog";
import { SiteLevelInspections } from "@/components/site/SiteLevelInspections";
import { DocumentDialogs } from "@/components/site/DocumentDialogs";
import { InspectionDialogs } from "@/components/site/InspectionDialogs";
import { Card, CardTitle, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { FortressMarkingChecklist } from "@/components/FortressMarkingChecklist";

interface SiteDocument {
  category: string;
  file_count: number;
}

interface Inspection {
  id: string;
  subsection_id: string | null;
  inspection_date: string;
  json_data: any;
}

const SiteDetail = () => {
  const { clientId, siteId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // States
  const [site, setSite] = useState<Site | null>(null);
  const [subsections, setSubsections] = useState<Subsection[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || "overview");
  const [siteDocuments, setSiteDocuments] = useState<any[]>([]);
  const [previewDocument, setPreviewDocument] = useState<{ url: string, name: string } | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string>("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<"client_logo" | "site_image" | null>(null);
  const [imagePreview, setImagePreview] = useState<{ site_image?: string, client_logo?: string }>({});
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '', address: '', description: '', status: '', location_lat: '', location_lng: '',
  });
  const [documentCategories, setDocumentCategories] = useState<any[]>([]);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isCreateInspectionOpen, setIsCreateInspectionOpen] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [newInspectionDate, setNewInspectionDate] = useState("");

  useEffect(() => {
    fetchSiteData();
    fetchSiteDocuments();
    fetchDocumentCategories();
    fetchTemplates();
    fetchCompanyLogo();
  }, [siteId]);

  const fetchCompanyLogo = async () => {
    try {
      const { data } = await supabase
        .from('settings')
        .select('company_logo_url')
        .limit(1)
        .maybeSingle();

      if (data?.company_logo_url) {
        setCompanyLogo(data.company_logo_url);
      }
    } catch (error) {
      console.error('Error fetching company logo:', error);
    }
  };

  const fetchSiteDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('site_documents')
        .select('id, file_name, file_url, category, category_id')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSiteDocuments(data || []);
    } catch (error) {
      console.error("Error fetching site documents:", error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('inspection_templates')
        .select('id, name, category')
        .order('name');

      if (error) throw error;
      setAvailableTemplates(data || []);
    } catch (error) {
      console.error("Error fetching templates:", error);
    }
  };

  const fetchDocumentCategories = async () => {
    if (!siteId) return;

    try {
      const { data, error } = await supabase
        .from('site_document_categories')
        .select('id, name')
        .eq('site_id', siteId)
        .order('order_index');

      if (error) throw error;

      // If no categories exist, create default ones
      if (!data || data.length === 0) {
        const defaultCategories = [
          { name: '01 COC', order_index: 1 },
          { name: '02 Manuals', order_index: 2 },
          { name: '03 Line Diagram', order_index: 3 },
          { name: '04 Metering', order_index: 4 },
          { name: '05 Thermal Reports', order_index: 5 },
          { name: '06 Other', order_index: 6 }
        ];

        const { data: newCategories, error: insertError } = await supabase
          .from('site_document_categories')
          .insert(
            defaultCategories.map(cat => ({
              site_id: siteId,
              ...cat
            }))
          )
          .select('id, name');

        if (!insertError && newCategories) {
          setDocumentCategories(newCategories);
        }
      } else {
        setDocumentCategories(data);
      }
    } catch (error) {
      console.error("Error fetching document categories:", error);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !siteId) return;

    try {
      toast.info("Creating category...");

      // Get the current max order_index
      const maxOrder = documentCategories.length > 0
        ? Math.max(...documentCategories.map(cat => parseInt(cat.name.split(' ')[0]) || 0))
        : 0;

      const { data, error } = await supabase
        .from('site_document_categories')
        .insert({
          site_id: siteId,
          name: newCategoryName.trim(),
          order_index: maxOrder + 1
        })
        .select('id, name')
        .single();

      if (error) throw error;

      toast.success("Category created successfully!");
      setCreateCategoryOpen(false);
      setNewCategoryName("");
      fetchDocumentCategories();
    } catch (error) {
      console.error("Error creating category:", error);
      toast.error("Failed to create category");
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    try {
      // First delete all documents in this category
      const { error: docsError } = await supabase
        .from('site_documents')
        .delete()
        .eq('category_id', categoryId);

      if (docsError) throw docsError;

      // Then delete the category
      const { error: categoryError } = await supabase
        .from('site_document_categories')
        .delete()
        .eq('id', categoryId);

      if (categoryError) throw categoryError;

      toast.success(`${categoryName} deleted successfully`);
      setDeleteCategoryId(null);
      fetchDocumentCategories();
      fetchSiteDocuments();
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    }
  };

  const handleDeleteSubsection = async (subsectionId: string, subsectionName: string) => {
    try {
      toast.info("Deleting subsection...");

      // Delete related records first
      const deletions = [
        supabase.from('subsection_documents').delete().eq('subsection_id', subsectionId),
        supabase.from('inspection_items').delete().eq('subsection_id', subsectionId),
        supabase.from('snags').delete().eq('subsection_id', subsectionId),
        supabase.from('inspections').delete().eq('subsection_id', subsectionId),
        supabase.from('qr_scans').delete().eq('subsection_id', subsectionId),
        supabase.from('coc_validations').delete().eq('subsection_id', subsectionId),
        supabase.from('document_categories').delete().eq('subsection_id', subsectionId),
      ];

      await Promise.all(deletions);

      // Finally delete the subsection itself
      const { error: subsectionError } = await supabase
        .from('subsections')
        .delete()
        .eq('id', subsectionId);

      if (subsectionError) throw subsectionError;

      toast.success(`${subsectionName} deleted successfully`);
      fetchSiteData(); // Refresh all data
    } catch (error) {
      console.error("Error deleting subsection:", error);
      toast.error("Failed to delete subsection");
    }
  };

  const fetchSiteData = async () => {
    try {
      const { data: siteRes, error: siteError } = await supabase
        .from("sites")
        .select("*, clients(id, name)")
        .eq("id", siteId)
        .maybeSingle();

      if (siteError) throw siteError;

      const { data: subsectionsRes, error: subsError } = await supabase
        .from("subsections")
        .select("*")
        .eq("site_id", siteId)
        .order("name");

      if (subsError) throw subsError;

      const { data: inspectionsRes, error: inspError } = await supabase
        .from("inspections")
        .select("id, subsection_id, inspection_date, json_data")
        .eq("site_id", siteId)
        .order("inspection_date", { ascending: false });

      if (inspError) throw inspError;

      const { data: snagsRes, error: snagsError } = await supabase
        .from("snags")
        .select("id, subsection_id, status, title")
        .in("subsection_id", subsectionsRes?.map(s => s.id) || []);

      if (snagsError) throw snagsError;

      let siteData = siteRes;
      if (siteData?.site_image_url) {
        try {
          const urlParts = siteData.site_image_url.split('/site-images/');
          if (urlParts.length > 1) {
            const path = urlParts[1].split('?')[0];
            const { data: signedData } = await supabase.storage
              .from('site-images')
              .createSignedUrl(path, 3600);

            if (signedData?.signedUrl) {
              siteData = { ...siteData, site_image_url: signedData.signedUrl };
            }
          }
        } catch (error) {
          console.error('Error generating signed URL for site image:', error);
        }
      }

      setSite(siteData);

      const subs = subsectionsRes || [];
      const sortedSubs = [...subs].sort((a, b) => {
        const extractNumber = (str: string) => {
          const match = str.match(/(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };
        const numA = extractNumber(a.name);
        const numB = extractNumber(b.name);
        if (numA !== 0 && numB !== 0) return numA - numB;
        return a.name.localeCompare(b.name);
      });

      setSubsections(sortedSubs);
      setInspections(inspectionsRes || []);

      // Calculate Stats
      const totalSubsections = subs.length;
      let compliantCount = 0;

      subs.forEach(sub => {
        if (sub.is_coc_required && sub.coc_status !== 'Approved' && sub.coc_status !== 'Valid' && sub.coc_status !== 'Pass') return;
        if (sub.is_coc_required && sub.metering_status === 'Missing' && !sub.meter_serial_number) return;
        const subsectionSnags = (snagsRes || []).filter(snag =>
          snag.subsection_id === sub.id &&
          snag.status !== 'rectified' &&
          snag.status !== 'Rectified'
        );
        if (subsectionSnags.length > 0) return;
        compliantCount++;
      });

      setStats({
        totalSubsections,
        compliantCount,
        cocRequiredCount: subs.filter(s => s.is_coc_required).length,
        cocApprovedCount: subs.filter(s => s.is_coc_required && ['Approved', 'Valid', 'Pass'].includes(s.coc_status || '')).length,
        meteringInstalledCount: subs.filter(s => s.metering_status === 'Installed' || s.meter_serial_number).length,
        openSnags: (snagsRes || []).filter(snag => !['rectified', 'Rectified'].includes(snag.status || '')).length,
      });
    } catch (error) {
      console.error("Error fetching site data:", error);
      toast.error("Failed to fetch site data");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSiteDocument = async (id: string, name: string) => {
    try {
      const { data: doc } = await supabase.from('site_documents').select('file_url').eq('id', id).single();
      if (doc?.file_url?.includes('supabase.co/storage')) {
        const path = doc.file_url.split('/documents/')[1]?.split('?')[0];
        if (path) await supabase.storage.from('documents').remove([path]);
      }
      await supabase.from('site_documents').delete().eq('id', id);
      toast.success(`${name} deleted`);
      fetchSiteDocuments();
    } catch (error) {
      toast.error("Failed to delete document");
    }
  };

  const handleUpdateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site) return;
    try {
      const { error } = await supabase.from('sites').update({ ...editFormData }).eq('id', site.id);
      if (error) throw error;
      toast.success("Site updated");
      setEditDialogOpen(false);
      fetchSiteData();
    } catch (error) {
      toast.error("Failed to update site");
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadCategoryId || !siteId) return;
    try {
      const category = documentCategories.find(c => c.id === uploadCategoryId);
      const fileName = `${siteId}/${category?.name || 'misc'}/${Date.now()}-${uploadFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      const { data, error } = await supabase.storage.from('documents').upload(fileName, uploadFile);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(data.path);
      await supabase.from('site_documents').insert({
        site_id: siteId, category_id: uploadCategoryId, file_name: uploadFile.name,
        file_url: urlData.publicUrl, category: category?.name || 'Misc'
      });
      toast.success("Uploaded successfully");
      setUploadFile(null);
      setUploadCategoryId(null);
      setUploadDialogOpen(false);
      fetchSiteDocuments();
    } catch (error) {
      toast.error("Upload failed");
    }
  };

  const handleCreateInspection = async () => {
    if (!newInspectionDate || !selectedTemplateId) return toast.error("Select template and date");
    try {
      const template = availableTemplates.find(t => t.id === selectedTemplateId);
      const { data, error } = await supabase.from('inspections').insert({
        site_id: siteId, template_id: selectedTemplateId, title: template?.name || 'Inspection',
        inspection_date: newInspectionDate, status: 'Pending'
      }).select().single();
      if (error) throw error;
      toast.success("Inspection created");
      setIsCreateInspectionOpen(false);
      navigate(`/inspections/${data.id}`);
    } catch (error) {
      toast.error("Failed to create inspection");
    }
  };

  if (loading) return <div className="flex h-[400px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!site) return <div className="text-center py-12"><h3>Site not found</h3><Button onClick={() => navigate(`/clients/${clientId}`)}>Back</Button></div>;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in space-y-8">
      <Breadcrumbs items={[{ label: "Clients", href: "/clients" }, { label: site.clients?.name || "Client", href: `/clients/${clientId}` }, { label: site.name }]} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20"><Building className="h-8 w-8" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{site.name}</h1>
            <div className="flex items-center text-muted-foreground mt-1"><MapPin className="h-4 w-4 mr-1.5" /><span className="text-sm">{site.address}</span></div>
          </div>
        </div>
        <Button onClick={() => {
          setEditFormData({
            name: site.name || '', address: site.address || '', description: '', status: 'Active', location_lat: '', location_lng: '',
          });
          setEditDialogOpen(true);
        }} variant="outline" className="gap-2"><ClipboardCheck className="h-4 w-4" />Edit Site</Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-2">
            <Shield className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Compliance</span>
          </TabsTrigger>
          <TabsTrigger value="images" className="gap-2">
            <Image className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Images</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Documents</span>
          </TabsTrigger>
          <TabsTrigger value="subsections" className="gap-2">
            <Layers className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Subsections</span>
          </TabsTrigger>
          <TabsTrigger value="qr-analytics" className="gap-2">
            <QrCode className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">QR Codes</span>
          </TabsTrigger>
          <TabsTrigger value="fortress-checklist" className="gap-2">
            <ClipboardCheck className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Fortress Checklist</span>
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-2">
            <FileDown className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Export</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          <SiteOverview site={site} stats={stats} />
          <SiteLevelInspections inspections={inspections} siteId={siteId!} onCreateClick={() => setIsCreateInspectionOpen(true)} />
        </TabsContent>

        <TabsContent value="compliance">
          <ComplianceDashboard siteId={siteId!} subsections={subsections} inspections={inspections} />
        </TabsContent>

        <TabsContent value="images">
          <SiteImages
            site={site} siteId={siteId!} imagePreview={imagePreview} setImagePreview={setImagePreview}
            handleImageUpload={async (file, type) => {
              setUploadingImage(type);
              const path = `${siteId}/${type === 'site_image' ? 'site-image' : 'client-logo'}.${file.name.split('.').pop()}`;
              await supabase.storage.from('site-images').upload(path, file, { upsert: true });
              const { data } = supabase.storage.from('site-images').getPublicUrl(path);
              await supabase.from('sites').update({ [type === 'site_image' ? 'site_image_url' : 'client_logo_url']: `${data.publicUrl}?t=${Date.now()}` }).eq('id', siteId);
              setUploadingImage(null);
              fetchSiteData();
            }}
            handleDeleteImage={async type => {
              await supabase.from('sites').update({ [type === 'site_image' ? 'site_image_url' : 'client_logo_url']: null }).eq('id', siteId);
              fetchSiteData();
            }}
            uploadingImage={uploadingImage} fetchSiteData={fetchSiteData}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <SiteDocumentsComponent
            documents={siteDocuments} categories={documentCategories} onDeleteDocument={handleDeleteSiteDocument}
            onPreview={(url, name) => setPreviewDocument({ url, name })} onDownload={downloadFile}
            onUploadClick={id => { setUploadCategoryId(id); setUploadDialogOpen(true); }}
            onCreateCategory={() => setCreateCategoryOpen(true)} onDeleteCategory={handleDeleteCategory}
          />
          <DocumentPreviewDialog
            open={previewDocument !== null}
            onOpenChange={(open) => !open && setPreviewDocument(null)}
            fileUrl={previewDocument?.url || ''}
            fileName={previewDocument?.name || ''}
          />
        </TabsContent>

        <TabsContent value="subsections" className="space-y-6">
          <div className="flex justify-between items-center">
            <div><h3 className="text-lg font-semibold">Subsections</h3><p className="text-sm text-muted-foreground">Manage subsections for {site.name}</p></div>
            <Button onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/new`)} className="gap-2"><Plus className="h-4 w-4" />Add</Button>
          </div>
          <SubsectionList subsections={subsections} clientId={clientId!} siteId={siteId!} onDelete={handleDeleteSubsection} />
        </TabsContent>

        <TabsContent value="qr-analytics">
          <QRAnalytics site={site} subsections={subsections} companyLogo={companyLogo} generatingAll={generatingAll} setGeneratingAll={setGeneratingAll} downloadingAll={downloadingAll} setDownloadingAll={setDownloadingAll} fetchSiteData={fetchSiteData} />
        </TabsContent>

        <TabsContent value="fortress-checklist">
          <FortressMarkingChecklist siteId={siteId!} />
        </TabsContent>

        <TabsContent value="export">
          <SiteExport site={site} />
        </TabsContent>
      </Tabs>

      <SiteEditDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} editFormData={editFormData} setEditFormData={setEditFormData} onSubmit={handleUpdateSite} />

      <DocumentDialogs
        createCategoryOpen={createCategoryOpen} setCreateCategoryOpen={setCreateCategoryOpen}
        newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName} onCreateCategory={handleCreateCategory}
        uploadCategoryId={uploadCategoryId} setUploadCategoryId={setUploadCategoryId}
        uploadFile={uploadFile} setUploadFile={setUploadFile} onUploadDocument={handleUploadDocument}
        deleteCategoryId={deleteCategoryId} setDeleteCategoryId={setDeleteCategoryId}
        onDeleteCategory={handleDeleteCategory} categories={documentCategories}
      />

      <InspectionDialogs
        isCreateInspectionOpen={isCreateInspectionOpen}
        setIsCreateInspectionOpen={setIsCreateInspectionOpen}
        availableTemplates={availableTemplates}
        selectedTemplateId={selectedTemplateId}
        setSelectedTemplateId={setSelectedTemplateId}
        newInspectionDate={newInspectionDate}
        setNewInspectionDate={setNewInspectionDate}
        handleCreateInspection={handleCreateInspection}
      />
    </div>
  );
};

export default SiteDetail;
