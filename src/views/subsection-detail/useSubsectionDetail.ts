import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateAndUploadQRCode } from "@/lib/qrCodeGenerator";
import { useOfflineSubsections } from "@/hooks/useOfflineSubsections";
import type {
  SubsectionData,
  SiteData,
  SupabaseDocument,
  DocumentCategory,
  EditFormData,
} from "./types";

// Normalize COC type to proper casing
export const normalizeCocType = (type: string | null | undefined): string => {
  if (!type) return '';
  const lower = type.toLowerCase();
  if (lower === 'initial') return 'Initial';
  if (lower === 'temporary') return 'Temporary';
  if (lower === 'supplementary') return 'Supplementary';
  if (lower === 'not marked' || lower === 'notmarked' || lower === 'not_marked') return 'Not Marked';
  return type;
};

// Normalize COC status to proper values
export const normalizeCocStatus = (status: string | null | undefined): string => {
  if (!status) return '';
  const lower = status.toLowerCase();
  if (lower === 'approved' || lower === 'pass' || lower === 'passed') return 'Approved';
  if (lower === 'failed' || lower === 'fail' || lower === 'rejected') return 'Failed';
  return status;
};

export function useSubsectionDetail() {
  const { clientId, siteId, subsectionId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [meterSerialNumber, setMeterSerialNumber] = useState<string>("");
  const [ctRatio, setCtRatio] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [isCreateInspectionOpen, setIsCreateInspectionOpen] = useState(false);
  const [newInspectionDate, setNewInspectionDate] = useState("");
  const [deleteInspectionId, setDeleteInspectionId] = useState<string | null>(null);
  const [actualClientId, setActualClientId] = useState<string | null>(null);
  const [linkedTemplate, setLinkedTemplate] = useState<{id: string, name: string, category: string} | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<Array<{id: string, name: string, category: string}>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateNameMap, setTemplateNameMap] = useState<Record<string, string>>({});
  const [uploadingFile, setUploadingFile] = useState(false);
  const [documentCategories, setDocumentCategories] = useState<DocumentCategory[]>([]);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [supabaseDocuments, setSupabaseDocuments] = useState<SupabaseDocument[]>([]);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [fixingTemplates, setFixingTemplates] = useState(false);
  const [fixingCategories, setFixingCategories] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: "",
    tenant_name: "",
    category: "",
    is_coc_required: true
  });
  const [snags, setSnags] = useState<any[]>([]);
  const [openSnagsCount, setOpenSnagsCount] = useState(0);
  const [deleteSubsectionDialogOpen, setDeleteSubsectionDialogOpen] = useState(false);
  const [offlineDocuments, setOfflineDocuments] = useState<any[]>([]);
  const [offlineFloorPlans, setOfflineFloorPlans] = useState<any[]>([]);
  const [previewDocument, setPreviewDocument] = useState<{file_name: string, file_url: string} | null>(null);

  // Offline capabilities
  const { updateSubsection, uploadDocument, uploadFloorPlan, getOfflineData, isOnline } = useOfflineSubsections();

  // ─── Data Fetching ─────────────────────────────────────────────

  const loadOfflineData = async () => {
    if (!subsectionId) return;
    try {
      const offlineData = await getOfflineData(subsectionId);
      if (offlineData.documents.length > 0) {
        setOfflineDocuments(offlineData.documents);
        toast.info(`${offlineData.documents.length} offline document(s) available`);
      }
      if (offlineData.floorPlans.length > 0) {
        setOfflineFloorPlans(offlineData.floorPlans);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error loading offline data:', error);
    }
  };

  const fetchDocumentCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('document_categories')
        .select('id, name')
        .eq('subsection_id', subsectionId)
        .order('order_index');

      if (error) throw error;

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
          .from('document_categories')
          .insert(
            defaultCategories.map(cat => ({
              subsection_id: subsectionId,
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
      if (process.env.NODE_ENV === 'development') console.error("Error fetching document categories:", error);
    }
  };

  const fetchSupabaseDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('subsection_documents')
        .select('id, file_name, file_url, category_id, uploaded_at, coc_number, coc_issue_date, coc_expiry_date, coc_type, coc_status')
        .eq('subsection_id', subsectionId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setSupabaseDocuments(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching Supabase documents:", error);
    }
  };

  const fetchSnags = async () => {
    if (!subsectionId) return;
    try {
      const { data, error } = await supabase
        .from('snags')
        .select('*')
        .eq('subsection_id', subsectionId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      const allSnags = data || [];
      setSnags(allSnags);
      setOpenSnagsCount(allSnags.filter(s => s.status === 'Open').length);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching snags:", error);
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

      const nameMap: Record<string, string> = {};
      data?.forEach(template => {
        if (template.category) {
          nameMap[template.category.toLowerCase()] = template.name;
        }
        nameMap[template.name.toLowerCase()] = template.name;
      });
      setTemplateNameMap(nameMap);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching templates:", error);
    }
  };

  const fetchSubsectionData = async () => {
    try {
      setLoading(true);

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
        if (process.env.NODE_ENV === 'development') console.error("Error fetching subsection from Supabase:", subsectionError);
        toast.error("Subsection not found");
        return;
      }

      const supabaseClientId = supabaseSubsection.sites.clients.id;
      setActualClientId(supabaseClientId);

      if (supabaseSubsection.inspection_templates) {
        setLinkedTemplate(supabaseSubsection.inspection_templates as any);
      }

      const { data: fullSubsection, error: fullError } = await supabase
        .from('subsections')
        .select('*')
        .eq('id', subsectionId)
        .single();

      if (fullError || !fullSubsection) {
        toast.error("Failed to load subsection details");
        return;
      }

      const { data: inspectionsData, error: inspectionsError } = await supabase
        .from('inspections')
        .select('*')
        .eq('subsection_id', subsectionId)
        .order('inspection_date', { ascending: false });

      if (inspectionsError) {
        if (process.env.NODE_ENV === 'development') console.error("Error fetching inspections:", inspectionsError);
      }

      // Fallback: also pull orphan inspections for the same site whose
      // json_data shop number matches this subsection's name (handles records
      // synced from the mobile app without a resolved subsection_id).
      const normalize = (v?: string | null) =>
        (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const normalizedSubName = normalize(fullSubsection.name);
      let orphanInspections: any[] = [];
      if (normalizedSubName) {
        const { data: orphans } = await supabase
          .from('inspections')
          .select('*')
          .eq('site_id', fullSubsection.site_id)
          .is('subsection_id', null);
        orphanInspections = (orphans || []).filter((insp: any) => {
          const shop = insp?.json_data?.generalInfo?.shopNumber
            || insp?.json_data?.generalInfo?.shopName
            || insp?.shop_number
            || insp?.shop_name;
          return normalize(shop) === normalizedSubName;
        });
      }

      const inspectionsObj: Record<string, any> = {};
      [...(inspectionsData || []), ...orphanInspections].forEach(inspection => {
        inspectionsObj[inspection.id] = {
          templateId: inspection.template_id,
          date: inspection.inspection_date,
          status: inspection.status,
          priority: inspection.priority,
          title: inspection.title,
          needsRelink: inspection.subsection_id == null,
        };
      });

      setSubsection({
        name: fullSubsection.name,
        tenantName: fullSubsection.tenant_name,
        category: fullSubsection.category || '',
        cocNumber: fullSubsection.coc_number,
        cocIssueDate: fullSubsection.coc_issue_date,
        cocType: fullSubsection.coc_type,
        cocStatus: fullSubsection.coc_status,
        cocExpiryDate: (fullSubsection as any).coc_expiry_date,
        cocFailureReasons: (fullSubsection as any).coc_failure_reasons,
        meterSerialNumber: fullSubsection.meter_serial_number,
        meteringStatus: fullSubsection.metering_status,
        ctRatio: fullSubsection.ct_ratio,
        isCocRequired: fullSubsection.is_coc_required ?? true,
        inspections: inspectionsObj
      });

      setMeterSerialNumber(fullSubsection.meter_serial_number || '');
      setCtRatio(fullSubsection.ct_ratio || '');

      const { data: siteInfo } = await supabase
        .from('sites')
        .select('name, address, clients(name)')
        .eq('id', supabaseSubsection.site_id)
        .single();

      if (siteInfo) {
        setSiteData({
          siteName: siteInfo.name,
          clientInfo: siteInfo.clients?.name || ''
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching subsection data:", error);
      toast.error("Failed to load subsection data");
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanyLogo = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('company_logo_url')
        .maybeSingle();

      if (error) {
        if (process.env.NODE_ENV === 'development') console.error("Error fetching company logo:", error);
        throw error;
      }

      if (data?.company_logo_url) {
        setCompanyLogo(data.company_logo_url);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching company logo:", error);
    }
  };

  // ─── Effects ───────────────────────────────────────────────────

  useEffect(() => {
    if (subsectionId && subsectionId !== "new") {
      const loadAllData = async () => {
        await fetchSubsectionData();
        await fetchCompanyLogo();
        await fetchTemplates();
        await fetchDocumentCategories();
        await fetchSupabaseDocuments();
        await fetchSnags();
      };
      loadAllData();

      if (!isOnline) {
        loadOfflineData();
      }

      const snagsChannel = supabase
        .channel(`snags-${subsectionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'snags', filter: `subsection_id=eq.${subsectionId}` },
          () => { fetchSnags(); }
        )
        .subscribe();

      const inspectionsChannel = supabase
        .channel(`inspections-${subsectionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inspections', filter: `subsection_id=eq.${subsectionId}` },
          () => { fetchSubsectionData(); }
        )
        .subscribe();

      const documentsChannel = supabase
        .channel(`documents-${subsectionId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'subsection_documents', filter: `subsection_id=eq.${subsectionId}` },
          () => { fetchSupabaseDocuments(); }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(snagsChannel);
        supabase.removeChannel(inspectionsChannel);
        supabase.removeChannel(documentsChannel);
      };
    } else if (subsectionId === "new") {
      setLoading(false);
      fetchTemplates();
    }
  }, [subsectionId, isOnline]);

  useEffect(() => {
    if (subsectionId) {
      setQrCodeUrl(null as any);
      generateQRCode();
    }
  }, [subsectionId, companyLogo]);

  useEffect(() => {
    if (searchParams.get("create") === "1") setIsCreateInspectionOpen(true);
  }, [searchParams]);

  const generateQRCode = async () => {
    setQrCodeUrl('generated');
  };

  // ─── Handlers: Subsection CRUD ─────────────────────────────────

  const handleOpenEditDialog = async () => {
    if (!subsection) return;
    const { data, error } = await supabase
      .from('subsections')
      .select('*')
      .eq('id', subsectionId)
      .single();

    if (error || !data) {
      toast.error("Failed to load subsection details");
      return;
    }

    setEditFormData({
      name: data.name || "",
      tenant_name: data.tenant_name || "",
      category: data.category || "",
      is_coc_required: data.is_coc_required ?? true
    });
    setIsEditDialogOpen(true);
  };

  const handleCreateSubsection = async () => {
    if (!editFormData.name.trim()) { toast.error("Subsection name is required"); return; }
    if (!editFormData.category) { toast.error("Please select a category"); return; }
    if (!siteId) { toast.error("Site ID is required"); return; }

    try {
      setSaving(true);
      const { data: newSubsection, error } = await supabase
        .from('subsections')
        .insert({
          site_id: siteId,
          name: editFormData.name,
          tenant_name: editFormData.tenant_name,
          category: editFormData.category,
          is_coc_required: editFormData.is_coc_required,
          coc_status: 'Missing',
          metering_status: 'Missing'
        })
        .select()
        .single();

      if (error) throw error;
      toast.success("Subsection created successfully");

      if (siteData?.siteName) {
        generateAndUploadQRCode({
          subsectionId: newSubsection.id,
          siteName: siteData.siteName,
          subsectionName: newSubsection.name,
          logoUrl: companyLogo || undefined
        }).catch((err) => {
          if (process.env.NODE_ENV === 'development') console.error('Failed to generate QR code:', err);
        });
      }

      const basePath = clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`;
      navigate(`${basePath}/subsections/${newSubsection.id}`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error creating subsection:", error);
      toast.error("Failed to create subsection");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editFormData.name.trim()) { toast.error("Subsection name is required"); return; }
    if (!editFormData.category) { toast.error("Please select a category"); return; }

    try {
      setSaving(true);
      const { error } = await supabase
        .from('subsections')
        .update({
          name: editFormData.name,
          tenant_name: editFormData.tenant_name,
          category: editFormData.category,
          is_coc_required: editFormData.is_coc_required
        })
        .eq('id', subsectionId);

      if (error) throw error;
      toast.success("Subsection updated successfully");
      setIsEditDialogOpen(false);
      await fetchSubsectionData();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error updating subsection:", error);
      toast.error("Failed to update subsection");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubsection = async () => {
    try {
      toast.info("Deleting subsection...");
      setDeleteSubsectionDialogOpen(false);

      const deletions = [
        supabase.from('subsection_documents').delete().eq('subsection_id', subsectionId),
        supabase.from('inspection_items').delete().eq('subsection_id', subsectionId),
        supabase.from('snags').delete().eq('subsection_id', subsectionId),
        supabase.from('inspections').delete().eq('subsection_id', subsectionId),
        supabase.from('qr_scans').delete().eq('subsection_id', subsectionId),
        supabase.from('document_categories').delete().eq('subsection_id', subsectionId),
      ];
      await Promise.all(deletions);

      const { error: subsectionError } = await supabase
        .from('subsections')
        .delete()
        .eq('id', subsectionId);

      if (subsectionError) throw subsectionError;

      toast.success(`${subsection?.name} deleted successfully`);
      const basePath = (actualClientId || clientId)
        ? `/clients/${actualClientId || clientId}/sites/${siteId}`
        : `/sites/${siteId}`;
      navigate(`${basePath}?tab=subsections`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error deleting subsection:", error);
      toast.error("Failed to delete subsection");
    }
  };

  // ─── Handlers: Metering & COC Details ──────────────────────────

  const handleSaveMeteringDetails = async () => {
    if (!subsection) return;
    try {
      setSaving(true);
      const { data: supabaseSubsection, error: findError } = await supabase
        .from('subsections')
        .select('id')
        .eq('id', subsectionId)
        .maybeSingle();

      if (findError) {
        if (process.env.NODE_ENV === 'development') console.error("Error finding subsection:", findError);
        toast.error("Database error: " + findError.message);
        return;
      }
      if (!supabaseSubsection) { toast.error("Subsection not found in database"); return; }

      const updateData: any = { updated_at: new Date().toISOString() };
      if (meterSerialNumber) {
        updateData.meter_serial_number = meterSerialNumber;
        updateData.metering_status = 'Installed';
      }
      if (ctRatio) updateData.ct_ratio = ctRatio;

      const { error: updateError } = await supabase
        .from('subsections')
        .update(updateData)
        .eq('id', supabaseSubsection.id);

      if (updateError) {
        if (process.env.NODE_ENV === 'development') console.error("Error updating subsection:", updateError);
        throw updateError;
      }

      setSubsection({
        ...subsection,
        meterSerialNumber: meterSerialNumber || subsection.meterSerialNumber,
        ctRatio: ctRatio || subsection.ctRatio
      });
      toast.success("Metering details saved successfully");
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error saving metering details:", error);
      toast.error("Failed to save metering details");
    } finally {
      setSaving(false);
    }
  };

  const getCocDocuments = () => getSupabaseCocDocuments();

  const getSupabaseCocDocuments = () => {
    // COC certificate categories only — exclude "COC Validation Reports" (old engine output).
    const cocCatIds = documentCategories
      .filter(cat => {
        const n = cat.name.toLowerCase();
        return n.includes('coc') && !n.includes('validation') && !n.includes('report');
      })
      .map(cat => cat.id);
    if (cocCatIds.length === 0) return [];
    return supabaseDocuments.filter(doc => cocCatIds.includes(doc.category_id));
  };

  const getMeteringDocuments = () => getSupabaseMeteringDocuments();

  const getSupabaseMeteringDocuments = () => {
    const meteringCategory = documentCategories.find(cat => cat.name.toLowerCase().includes('meter'));
    if (!meteringCategory) return [];
    return supabaseDocuments.filter(doc => doc.category_id === meteringCategory.id);
  };

  // ─── Handlers: Document Categories ─────────────────────────────

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !subsectionId) return;
    try {
      toast.info("Creating category...");
      const maxOrder = documentCategories.length > 0
        ? Math.max(...documentCategories.map(cat => parseInt(cat.name.split(' ')[0]) || 0))
        : 0;

      const { data, error } = await supabase
        .from('document_categories')
        .insert({ subsection_id: subsectionId, name: newCategoryName.trim(), order_index: maxOrder + 1 })
        .select('id, name')
        .single();

      if (error) throw error;
      toast.success("Category created successfully!");
      setCreateCategoryOpen(false);
      setNewCategoryName("");
      fetchDocumentCategories();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error creating category:", error);
      toast.error("Failed to create category");
    }
  };

  const handleDeleteCategory = async (categoryId: string, categoryName: string) => {
    try {
      const { error: docsError } = await supabase.from('subsection_documents').delete().eq('category_id', categoryId);
      if (docsError) throw docsError;
      const { error: categoryError } = await supabase.from('document_categories').delete().eq('id', categoryId);
      if (categoryError) throw categoryError;

      toast.success(`${categoryName} deleted successfully`);
      setDeleteCategoryId(null);
      fetchDocumentCategories();
      fetchSupabaseDocuments();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    }
  };

  // ─── Handlers: Documents ───────────────────────────────────────

  const handleDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadCategoryId || !subsectionId) return;

    try {
      if (!uploadFile) { toast.error("No file selected"); return; }
      const maxSize = 50 * 1024 * 1024;
      if (uploadFile.size > maxSize) {
        toast.error(`File size exceeds maximum limit of 50MB. Selected file is ${(uploadFile.size / (1024 * 1024)).toFixed(2)}MB`);
        return;
      }

      setUploadingFile(true);
      toast.info("Uploading document...");

      const category = documentCategories.find(cat => cat.id === uploadCategoryId);
      if (!category) { toast.error("Document category not found"); return; }

      const timestamp = Date.now();
      const sanitizedFileName = uploadFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${subsectionId}/${category.name}/${timestamp}-${sanitizedFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, uploadFile);

      if (uploadError) {
        if (process.env.NODE_ENV === 'development') console.error("Storage upload error:", uploadError);
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      if (!uploadData?.path) throw new Error("Upload succeeded but no path returned");

      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(uploadData.path);
      if (!urlData?.publicUrl) throw new Error("Failed to generate public URL for uploaded file");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { error: insertError } = await supabase
        .from('subsection_documents')
        .insert({
          subsection_id: subsectionId,
          category_id: category.id,
          file_name: uploadFile.name,
          file_url: urlData.publicUrl,
          file_size: uploadFile.size,
          uploaded_by: user.id
        });

      if (insertError) {
        if (process.env.NODE_ENV === 'development') console.error("Database insert error:", insertError);
        throw new Error(`Failed to save document record: ${insertError.message}`);
      }

      toast.success("Document uploaded successfully!");
      setUploadCategoryId(null);
      setUploadFile(null);
      fetchSupabaseDocuments();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error("Error uploading document:", error);
      let errorMessage = "Failed to upload document";
      if (error?.message) errorMessage = error.message;
      else if (typeof error === 'string') errorMessage = error;
      else if (error?.error_description) errorMessage = error.error_description;
      toast.error(errorMessage, { duration: 5000 });
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteDocument = async (documentId: string, fileName: string) => {
    setDeletingDocumentId(documentId);
    try {
      const { data: doc, error: fetchError } = await supabase
        .from('subsection_documents')
        .select('file_url')
        .eq('id', documentId)
        .single();

      if (fetchError) {
        if (process.env.NODE_ENV === 'development') console.error("Error fetching document:", fetchError);
        throw fetchError;
      }

      if (doc?.file_url) {
        const url = new URL(doc.file_url);
        const pathParts = url.pathname.split('/');
        const filePath = pathParts.slice(pathParts.indexOf('documents') + 1).join('/');
        const { error: storageError } = await supabase.storage.from('documents').remove([filePath]);
        if (storageError) {
          if (process.env.NODE_ENV === 'development') console.error("Error deleting file from storage:", storageError);
        }
      }

      const { error: deleteError } = await supabase
        .from('subsection_documents')
        .delete()
        .eq('id', documentId);

      if (deleteError) {
        if (process.env.NODE_ENV === 'development') console.error("Database deletion error:", deleteError);
        throw deleteError;
      }

      setSupabaseDocuments(prev => prev.filter(d => d.id !== documentId));
      setDeleteDocumentId(null);
      toast.success(`${fileName} deleted successfully`);

      setTimeout(() => {
        fetchDocumentCategories();
        fetchSupabaseDocuments();
      }, 500);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error("Error in handleDeleteDocument:", error);
      toast.error(`Failed to delete document: ${error.message || 'Unknown error'}`);
      fetchSupabaseDocuments();
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const handleDownloadDocument = async (url: string, fileName: string) => {
    if (!url) { toast.error("Document URL not available"); return; }
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      // Open in new tab — anchor download is blocked in iframe sandboxes
      window.open(blobUrl, '_blank');

      // Revoke after delay so the new tab can load
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
      toast.success(`Downloading ${fileName}`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error downloading document:", error);
      toast.error("Failed to download document");
    }
  };

  const handleFixCategories = async () => {
    if (!subsectionId) return;
    try {
      setFixingCategories(true);
      toast.info("Fixing document categories...");

      const { data: documentsToFix, error: fetchError } = await supabase
        .from('subsection_documents')
        .select('id, category_id, file_name')
        .eq('subsection_id', subsectionId)
        .is('category_id', null);

      if (fetchError) throw fetchError;
      if (!documentsToFix || documentsToFix.length === 0) {
        toast.info("No documents need category fixing");
        return;
      }

      const { data: categories, error: categoriesError } = await supabase
        .from('document_categories')
        .select('id, name')
        .eq('subsection_id', subsectionId);

      if (categoriesError) throw categoriesError;

      for (const doc of documentsToFix) {
        let matchedCategory = null;
        if (doc.file_name.toLowerCase().includes('coc') || doc.file_name.toLowerCase().includes('certificate')) {
          matchedCategory = categories?.find(c => c.name.toLowerCase().includes('coc'));
        } else if (doc.file_name.toLowerCase().includes('drawing') || doc.file_name.toLowerCase().includes('layout')) {
          matchedCategory = categories?.find(c => c.name.toLowerCase().includes('drawing') || c.name.toLowerCase().includes('layout'));
        } else if (doc.file_name.toLowerCase().includes('manual') || doc.file_name.toLowerCase().includes('warrant')) {
          matchedCategory = categories?.find(c => c.name.toLowerCase().includes('manual') || c.name.toLowerCase().includes('warrant'));
        }

        if (matchedCategory) {
          const { error: updateError } = await supabase
            .from('subsection_documents')
            .update({ category_id: matchedCategory.id })
            .eq('id', doc.id);
          if (updateError) {
            if (process.env.NODE_ENV === 'development') console.error(`Error updating document ${doc.id}:`, updateError);
          }
        }
      }

      toast.success(`Fixed categories for ${documentsToFix.length} documents!`);
      await fetchDocumentCategories();
      await fetchSupabaseDocuments();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fixing categories:", error);
      toast.error("Failed to fix categories");
    } finally {
      setFixingCategories(false);
    }
  };

  // ─── Handlers: Inspections ─────────────────────────────────────

  const handleCreateInspection = async () => {
    if (!newInspectionDate) { toast.error("Please select an inspection date"); return; }
    const templateToUse = selectedTemplateId || linkedTemplate?.id;
    if (!templateToUse) { toast.error("Please select an inspection template"); return; }

    try {
      const template = availableTemplates.find(t => t.id === templateToUse) || linkedTemplate;
      let inspectionTitle = template?.name || 'New Inspection';
      if (template?.category === 'Site Drawing' || template?.category === 'Progress') {
        let siteName = siteData?.siteName || subsection?.name || 'Site';
        if (!siteData?.siteName && siteId) {
          const { data: siteInfo } = await supabase.from('sites').select('name').eq('id', siteId).single();
          if (siteInfo) siteName = siteInfo.name;
        }
        const formattedDate = format(new Date(newInspectionDate), 'yyyy-MM-dd');
        inspectionTitle = `${siteName} - ${template.category} - ${formattedDate}`;
      }

      const firebaseId = `-${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;

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
          json_data: {}
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
      if (process.env.NODE_ENV === 'development') console.error("Error creating inspection:", error);
      toast.error("Failed to create inspection");
    }
  };

  const handleUpdateInspectionStatus = async (inspectionId: string, newStatus: string) => {
    try {
      if (newStatus === 'Completed') {
        const { data: inspection, error: fetchError } = await supabase
          .from('inspections')
          .select('quality_rating, template_id')
          .eq('id', inspectionId)
          .single();

        if (fetchError) throw fetchError;
        if (!inspection?.quality_rating) {
          toast.error("Cannot mark inspection as complete without setting a quality rating (1-5). Please edit the inspection and set the quality rating in the General Info tab.");
          return;
        }
        toast.success("Inspection marked as complete. Use the 'Generate Report' button to create a PDF report.");
      }

      const { error } = await supabase
        .from('inspections')
        .update({ status: newStatus })
        .eq('id', inspectionId);

      if (error) throw error;
      toast.success("Inspection status updated");
      fetchSubsectionData();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error updating inspection:", error);
      toast.error("Failed to update inspection status");
    }
  };

  const handleDeleteInspection = async () => {
    if (!deleteInspectionId) return;
    try {
      const { error } = await supabase
        .from('inspections')
        .delete()
        .eq('id', deleteInspectionId);

      if (error) throw error;
      toast.success("Inspection deleted successfully");
      setDeleteInspectionId(null);
      fetchSubsectionData();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error deleting inspection:", error);
      toast.error("Failed to delete inspection");
    }
  };

  const handleFixTemplateLinks = async () => {
    setFixingTemplates(true);
    try {
      const { data: inspections, error: fetchError } = await supabase
        .from('inspections')
        .select('id, status, title')
        .eq('subsection_id', subsectionId)
        .is('template_id', null);

      if (fetchError) throw fetchError;
      if (!inspections || inspections.length === 0) {
        toast.info("No inspections need template linking");
        return;
      }

      let linkedCount = 0;
      for (const inspection of inspections) {
        const matchingTemplate = availableTemplates.find(template =>
          inspection.status?.toLowerCase().includes(template.name.toLowerCase()) ||
          inspection.status?.toLowerCase().includes(template.category.toLowerCase()) ||
          template.name.toLowerCase().includes(inspection.status?.toLowerCase() || '')
        );

        if (matchingTemplate) {
          const { error: updateError } = await supabase
            .from('inspections')
            .update({ template_id: matchingTemplate.id })
            .eq('id', inspection.id);
          if (!updateError) linkedCount++;
          else if (process.env.NODE_ENV === 'development') console.error('Update error:', updateError);
        }
      }

      if (linkedCount > 0) {
        toast.success(`Successfully linked ${linkedCount} inspection${linkedCount > 1 ? 's' : ''} to templates`);
        await fetchSubsectionData();
      } else {
        toast.info("No matching templates found for inspections");
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fixing template links:", error);
      toast.error("Failed to fix template links");
    } finally {
      setFixingTemplates(false);
    }
  };

  // ─── Computed values ───────────────────────────────────────────

  const inspections = subsection?.inspections || {};
  const inspectionArray = Object.entries(inspections);
  const hasSnags = openSnagsCount > 0;
  const hasIncompleteInspections = inspectionArray.length > 0 && inspectionArray.some(([_, insp]) => {
    const status = insp?.status;
    return !status || status !== 'Completed';
  });
  const isNotCompliant = hasSnags || hasIncompleteInspections;

  return {
    // Route params
    clientId,
    siteId,
    subsectionId,
    navigate,

    // Core data
    subsection,
    setSubsection,
    siteData,
    loading,
    activeTab,
    setActiveTab,
    actualClientId,
    isOnline,

    // COC / document getters
    getCocDocuments,
    getSupabaseCocDocuments,
    getMeteringDocuments,
    getSupabaseMeteringDocuments,

    // Metering
    meterSerialNumber,
    setMeterSerialNumber,
    ctRatio,
    setCtRatio,

    // Documents
    supabaseDocuments,
    documentCategories,
    uploadingFile,
    setUploadingFile,
    uploadCategoryId,
    setUploadCategoryId,
    uploadFile,
    setUploadFile,
    deleteDocumentId,
    setDeleteDocumentId,
    deletingDocumentId,
    createCategoryOpen,
    setCreateCategoryOpen,
    newCategoryName,
    setNewCategoryName,
    deleteCategoryId,
    setDeleteCategoryId,
    fixingCategories,
    previewDocument,
    setPreviewDocument,

    // Inspections
    inspectionArray,
    isCreateInspectionOpen,
    setIsCreateInspectionOpen,
    newInspectionDate,
    setNewInspectionDate,
    deleteInspectionId,
    setDeleteInspectionId,
    linkedTemplate,
    availableTemplates,
    selectedTemplateId,
    setSelectedTemplateId,
    fixingTemplates,

    // Edit dialog
    isEditDialogOpen,
    setIsEditDialogOpen,
    editFormData,
    setEditFormData,
    saving,

    // Delete subsection
    deleteSubsectionDialogOpen,
    setDeleteSubsectionDialogOpen,

    // Snags
    snags,
    openSnagsCount,

    // Computed
    hasSnags,
    hasIncompleteInspections,
    isNotCompliant,

    // Company
    companyLogo,

    // Handlers
    handleOpenEditDialog,
    handleCreateSubsection,
    handleSaveEdit,
    handleDeleteSubsection,
    handleSaveMeteringDetails,
    handleCreateCategory,
    handleDeleteCategory,
    handleDocumentUpload,
    handleDeleteDocument,
    handleDownloadDocument,
    handleFixCategories,
    handleCreateInspection,
    handleUpdateInspectionStatus,
    handleDeleteInspection,
    handleFixTemplateLinks,
    fetchSupabaseDocuments,
    fetchSubsectionData,
  };
}
