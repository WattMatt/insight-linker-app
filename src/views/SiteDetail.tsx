import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";

import { FileText, QrCode, Layers, MapPin, Building, FileBarChart, LayoutGrid, ClipboardCheck, Shield, Plus, ShieldCheck, Workflow } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ComplianceDashboard } from "@/components/ComplianceDashboard";
import { DocumentPreviewDialog } from '@/components/DocumentPreviewDialog';
import { downloadFile } from '@/lib/fileDownload';
import { Site, Subsection, SiteStats } from "@/types/site";
import { SiteComplianceChecklist } from "@/components/site/SiteComplianceChecklist";
import { SubsectionList } from "@/components/site/SubsectionList";
import { SiteDocuments as SiteDocumentsComponent } from "@/components/site/SiteDocuments";
import { QRCodeManager } from "@/components/site/QRCodeManager";
import { QRScanActivity } from "@/components/site/QRScanActivity";
import { SiteReports } from "@/components/site/SiteReports";
import { SiteEditDialog } from "@/components/site/SiteEditDialog";
import { DocumentDialogs } from "@/components/site/DocumentDialogs";
import { InspectionDialogs } from "@/components/site/InspectionDialogs";
import { Card, CardTitle, CardHeader, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { FortressMarkingChecklist } from "@/components/FortressMarkingChecklist";
import { AssetVerification } from "@/components/site/AssetVerification";

import { SchematicDiagram } from "@/components/site/SchematicDiagram";
import { SiteCocTab } from "@/views/site-coc/SiteCocTab";
import { calculateCocComplianceStats } from "@/lib/complianceCalculations";
import { computeSiteDeliverables, categoryMatches, THERMAL_CATEGORY_PATTERNS } from "@/lib/siteDeliverables";
import { buildSiteKpiBlock } from "@/lib/siteCoc/reportKpis";
import { useUserRole } from "@/hooks/useUserRole";
import { renameDocument, moveDocuments, deleteDocuments, type DocRef } from "@/lib/documents/documentMutations";
import { storagePathFromUrl } from "@/lib/documents/paths";
import { validateUploadFile } from "@/lib/documents/uploadConstraints";
import { MoveDocumentsDialog, type MoveDoc } from "@/components/site/MoveDocumentsDialog";
import { DocumentHistoryDialog } from "@/components/site/DocumentHistoryDialog";

interface SiteDocument {
  category: string;
  file_count: number;
}

interface Inspection {
  id: string;
  subsection_id: string | null;
  inspection_date: string;
  json_data: any;
  status?: string | null;
}

const SiteDetail = () => {
  const { clientId, siteId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: userRole } = useUserRole();
  const canManageDocuments = userRole === "Admin";

  // States
  const [site, setSite] = useState<Site | null>(null);
  const [subsections, setSubsections] = useState<Subsection[]>([]);
  const [snags, setSnags] = useState<{ id: string; subsection_id: string; status: string; title: string; risk_level: string | null }[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  // The 'compliance' tab was merged into the overview ('Dashboard') tab — redirect stale links.
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab');
    return !t || t === 'compliance' ? 'overview' : t;
  });
  const [siteDocuments, setSiteDocuments] = useState<any[]>([]);
  const [subsectionDocuments, setSubsectionDocuments] = useState<any[]>([]);
  const [previewDocument, setPreviewDocument] = useState<{ url: string, name: string } | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string>("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [hasSchematic, setHasSchematic] = useState(false);
  const [assetCount, setAssetCount] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '', address: '', site_type: '', managing_agency_id: '',
  });
  const [documentCategories, setDocumentCategories] = useState<any[]>([]);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [moveDialogDocs, setMoveDialogDocs] = useState<MoveDoc[] | null>(null);
  const [historyDoc, setHistoryDoc] = useState<{ id: string; name: string } | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isCreateInspectionOpen, setIsCreateInspectionOpen] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [newInspectionDate, setNewInspectionDate] = useState("");

  useEffect(() => {
    fetchSiteData();
    fetchSiteDocuments();
    fetchSubsectionDocuments();
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
      if (process.env.NODE_ENV === 'development') console.error('Error fetching company logo:', error);
    }
  };

  const fetchSiteDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('site_documents')
        .select('id, file_name, file_url, category, category_id, file_size, uploaded_by, created_at')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSiteDocuments(data || []);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching site documents:", error);
    }
  };

  const fetchSubsectionDocuments = async () => {
    if (!siteId) return;
    try {
      // First get all subsection IDs for this site
      const { data: subs, error: subsError } = await supabase
        .from('subsections')
        .select('id')
        .eq('site_id', siteId);

      if (subsError) throw subsError;
      if (!subs || subs.length === 0) {
        setSubsectionDocuments([]);
        return;
      }

      const subsectionIds = subs.map(s => s.id);

      // Fetch documents with category names
      const { data: docs, error: docsError } = await supabase
        .from('subsection_documents')
        .select(`
          id,
          file_name,
          file_url,
          subsection_id,
          category_id,
          file_size,
          uploaded_at,
          uploaded_by,
          coc_number,
          document_categories(name)
        `)
        .in('subsection_id', subsectionIds)
        .order('uploaded_at', { ascending: false });

      if (docsError) throw docsError;

      const enrichedDocs = (docs || []).map((doc: any) => ({
        id: doc.id,
        file_name: doc.file_name,
        file_url: doc.file_url,
        subsection_id: doc.subsection_id,
        category_id: doc.category_id ?? null,
        file_size: doc.file_size ?? null,
        uploaded_at: doc.uploaded_at ?? null,
        uploaded_by: doc.uploaded_by ?? null,
        coc_number: doc.coc_number ?? null,
        category_name: doc.document_categories?.name || null
      }));

      setSubsectionDocuments(enrichedDocs);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching subsection documents:", error);
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
      if (process.env.NODE_ENV === 'development') console.error("Error fetching templates:", error);
    }
  };

  const fetchDocumentCategories = async () => {
    if (!siteId) return;

    try {
      const { data, error } = await supabase
        .from('site_document_categories')
        .select('id, name, order_index, is_system')
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
          .select('id, name, order_index, is_system');

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
      if (process.env.NODE_ENV === 'development') console.error("Error creating category:", error);
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
      if (process.env.NODE_ENV === 'development') console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    }
  };

  const handleBulkDeleteCategories = async () => {
    if (!siteId || documentCategories.length === 0) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete ALL ${documentCategories.length} categories and their documents? This action cannot be undone.`
    );
    
    if (!confirmed) return;

    try {
      toast.info("Deleting all categories...");

      // First delete all documents for this site
      const { error: docsError } = await supabase
        .from('site_documents')
        .delete()
        .eq('site_id', siteId);

      if (docsError) throw docsError;

      // Then delete all categories for this site
      const { error: categoriesError } = await supabase
        .from('site_document_categories')
        .delete()
        .eq('site_id', siteId);

      if (categoriesError) throw categoriesError;

      toast.success("All categories deleted successfully");
      fetchDocumentCategories();
      fetchSiteDocuments();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error bulk deleting categories:", error);
      toast.error("Failed to delete categories");
    }
  };

  const handleBulkDeleteDocumentsInCategory = async (categoryId: string, categoryName: string) => {
    const docsInCategory = siteDocuments.filter(d => d.category_id === categoryId);
    if (docsInCategory.length === 0) {
      toast.info("No documents to delete in this category");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ALL ${docsInCategory.length} files in "${categoryName}"? This action cannot be undone.`
    );
    
    if (!confirmed) return;

    try {
      toast.info(`Deleting ${docsInCategory.length} files...`);

      const { error } = await supabase
        .from('site_documents')
        .delete()
        .eq('category_id', categoryId);

      if (error) throw error;

      toast.success(`All files in ${categoryName} deleted successfully`);
      fetchSiteDocuments();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error bulk deleting documents:", error);
      toast.error("Failed to delete files");
    }
  };

  const handleDeleteSubsection = async (subsectionId: string, subsectionName: string) => {
    try {
      toast.info("Deleting subsection...");

      // Delete related records first
      const deletions = await Promise.all([
        supabase.from('subsection_documents').delete().eq('subsection_id', subsectionId),
        supabase.from('inspection_items').delete().eq('subsection_id', subsectionId),
        supabase.from('snags').delete().eq('subsection_id', subsectionId),
        supabase.from('inspections').delete().eq('subsection_id', subsectionId),
        supabase.from('qr_scans').delete().eq('subsection_id', subsectionId),
        supabase.from('document_categories').delete().eq('subsection_id', subsectionId),
      ]);
      const firstDeleteError = deletions.find(d => d.error)?.error;
      if (firstDeleteError) throw firstDeleteError;

      // Finally delete the subsection itself
      const { error: subsectionError } = await supabase
        .from('subsections')
        .delete()
        .eq('id', subsectionId);

      if (subsectionError) throw subsectionError;

      toast.success(`${subsectionName} deleted successfully`);
      fetchSiteData(); // Refresh all data
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error deleting subsection:", error);
      toast.error("Failed to delete subsection");
    }
  };

  const fetchSiteData = async () => {
    try {
      const { data: siteRes, error: siteError } = await supabase
        .from("sites")
        .select("*, clients(id, name), managing_agencies(id, name)")
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
        .select("id, subsection_id, inspection_date, json_data, status")
        .eq("site_id", siteId)
        .order("inspection_date", { ascending: false });

      if (inspError) throw inspError;

      const subsectionIds = subsectionsRes?.map(s => s.id) || [];
      
      const { data: snagsRes, error: snagsError } = await supabase
        .from("snags")
        .select("id, subsection_id, status, title, risk_level, created_at, rectified_at")
        .in("subsection_id", subsectionIds);

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
          if (process.env.NODE_ENV === 'development') console.error('Error generating signed URL for site image:', error);
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
      setSnags(snagsRes || []);
      setInspections(inspectionsRes || []);

      const [schematicRes, assetCountRes] = await Promise.all([
        supabase.from("site_schematics").select("id").eq("site_id", siteId).maybeSingle(),
        supabase.from("site_assets").select("id", { count: "exact", head: true }).eq("site_id", siteId),
      ]);
      if (schematicRes.error) throw schematicRes.error;
      if (assetCountRes.error) throw assetCountRes.error;
      setHasSchematic(!!schematicRes.data);
      setAssetCount(assetCountRes.count || 0);

      // Calculate Stats using shared compliance utility for consistency
      const totalSubsections = subs.length;
      
      // Use shared utility for COC compliance calculation
      const complianceStats = calculateCocComplianceStats(subs);
      
      setStats({
        totalSubsections,
        cocRequiredCount: complianceStats.cocRequiredCount,
        cocApprovedCount: complianceStats.cocApprovedCount,
        meteringInstalledCount: complianceStats.meteringInstalledCount,
        openSnags: (snagsRes || []).filter(snag => !['Rectified', 'Closed'].includes(snag.status || '')).length,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching site data:", error);
      toast.error("Failed to fetch site data");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSiteDocument = async (id: string, name: string, source: 'site' | 'subsection' = 'site') => {
    try {
      // The site Documents tab unifies site_documents + subsection_documents, so route the delete
      // to the table the row actually lives in. Otherwise a subsection-sourced doc matches no
      // site_documents row and silently "deletes" nothing while still toasting success.
      const table = source === 'subsection' ? 'subsection_documents' : 'site_documents';
      const { data: doc } = await supabase.from(table).select('file_url').eq('id', id).single();
      // storagePathFromUrl handles both legacy full URLs and bare-path rows.
      const path = doc?.file_url ? storagePathFromUrl(doc.file_url) : null;
      if (path) await supabase.storage.from('documents').remove([path]);
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      toast.success(`${name} deleted`);
      if (source === 'subsection') fetchSubsectionDocuments(); else fetchSiteDocuments();
    } catch (error) {
      toast.error("Failed to delete document");
    }
  };

  const handleUpdateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site) return;
    try {
      // Explicit column list: the form's fields map 1:1 onto sites columns
      // (an earlier version spread non-existent columns and every save failed).
      const { error } = await supabase.from('sites').update({
        name: editFormData.name,
        address: editFormData.address || null,
        site_type: editFormData.site_type || null,
        managing_agency_id: editFormData.managing_agency_id || null,
      }).eq('id', site.id);
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
    if (uploadFiles.length === 0 || !uploadCategoryId || !siteId) return;
    const category = documentCategories.find(c => c.id === uploadCategoryId);
    const { data: { user } } = await supabase.auth.getUser();
    let ok = 0, failed = 0;
    for (const file of uploadFiles) {
      const v = validateUploadFile(file);
      if (!v.ok) { toast.error(v.reason); failed++; continue; }
      try {
        const path = `${siteId}/${category?.name || 'misc'}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        const { data, error } = await supabase.storage.from('documents').upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(data.path);
        const { error: insErr } = await supabase.from('site_documents').insert({
          site_id: siteId, category_id: uploadCategoryId, file_name: file.name, file_url: urlData.publicUrl,
          category: category?.name || 'Misc', file_size: file.size, mime_type: file.type || null, uploaded_by: user?.id ?? null,
        });
        if (insErr) throw insErr;
        ok++;
      } catch { failed++; }
    }
    if (ok) toast.success(`${ok} file${ok === 1 ? '' : 's'} uploaded`);
    if (failed) toast.error(`${failed} file${failed === 1 ? '' : 's'} failed`);
    setUploadFiles([]); setUploadCategoryId(null); setUploadDialogOpen(false);
    fetchSiteDocuments();
  };

  const toDocRef = (d: any): DocRef => ({
    id: d.id, source: d.source, file_name: d.file_name, file_url: d.file_url,
    site_id: d.site_id ?? siteId ?? null, subsection_id: d.subsection_id ?? null,
    category_id: d.category_id ?? null, coc_number: d.coc_number ?? null,
  });
  const refetchDocs = () => { fetchSiteDocuments(); fetchSubsectionDocuments(); };

  const handleRenameDocument = async (doc: any, newName: string) => {
    const r = await renameDocument(toDocRef(doc), newName);
    r.ok ? toast.success("Renamed") : toast.error(r.error || "Rename failed");
    refetchDocs();
  };
  const handleDeleteDocuments = async (docs: any[]) => {
    if (!window.confirm(`Delete ${docs.length} document(s)? This cannot be undone.`)) return;
    const results = await deleteDocuments(docs.map(toDocRef));
    const okCount = results.filter(r => r.ok).length;
    toast.success(`${okCount} deleted${okCount < results.length ? `, ${results.length - okCount} failed` : ""}`);
    refetchDocs();
  };
  const handleConfirmMove = async (targetId: string, targetName: string) => {
    if (!moveDialogDocs) return;
    const results = await moveDocuments(moveDialogDocs.map(toDocRef), { id: targetId, name: targetName });
    const okCount = results.filter(r => r.ok).length;
    toast.success(`${okCount} moved${okCount < results.length ? `, ${results.length - okCount} failed` : ""}`);
    setMoveDialogDocs(null);
    refetchDocs();
  };
  const handleRenameCategory = async (categoryId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const oldName = documentCategories.find(c => c.id === categoryId)?.name ?? "";
    if (/coc/i.test(oldName) && !/coc/i.test(trimmed) &&
        !window.confirm('This category auto-tags new uploads as COC. Renaming away from "COC" stops that for future uploads. Continue?')) {
      return;
    }
    const { error } = await supabase.from('site_document_categories').update({ name: trimmed }).eq('id', categoryId);
    error ? toast.error("Rename failed") : toast.success("Category renamed");
    fetchDocumentCategories();
  };
  const handleReorderCategory = async (categoryId: string, direction: "up" | "down") => {
    const sorted = [...documentCategories].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const i = sorted.findIndex(c => c.id === categoryId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= sorted.length) return;
    const a = sorted[i], b = sorted[j];
    await supabase.from('site_document_categories').update({ order_index: b.order_index ?? 0 }).eq('id', a.id);
    await supabase.from('site_document_categories').update({ order_index: a.order_index ?? 0 }).eq('id', b.id);
    fetchDocumentCategories();
  };

  const handleCreateInspection = async () => {
    if (!newInspectionDate || !selectedTemplateId) return toast.error("Select template and date");
    try {
      const template = availableTemplates.find(t => t.id === selectedTemplateId);
      const siteLevelName = `Site-wide: ${template?.name || 'Inspection'}`;
      const { data, error } = await supabase.from('inspections').insert({
        site_id: siteId, template_id: selectedTemplateId, title: template?.name || 'Inspection',
        shop_name: siteLevelName,
        inspection_date: newInspectionDate, status: 'Pending'
      }).select().single();
      if (error) throw error;
      toast.success("Inspection created");
      setIsCreateInspectionOpen(false);
      // Site-level inspections: stay on site page with inspections tab
      const basePath = clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`;
      navigate(`${basePath}?tab=inspections`);
    } catch (error) {
      toast.error("Failed to create inspection");
    }
  };

  // Deep-link params — MUST be unconditional (above the early returns) to satisfy the rules of hooks.
  // Follow ?tab= so same-page checklist actions switch tabs; open the thermal upload dialog once.
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  const thermalDeepLinkHandled = useRef(false);
  useEffect(() => {
    if (thermalDeepLinkHandled.current) return;
    if (searchParams.get('upload') === 'thermal' && documentCategories.length > 0) {
      thermalDeepLinkHandled.current = true; // handle once, even if no match (no unbounded retries)
      const thermalCat = documentCategories.find((c: any) => categoryMatches([c?.name], THERMAL_CATEGORY_PATTERNS));
      if (thermalCat) {
        setUploadCategoryId(thermalCat.id);
        setUploadDialogOpen(true);
      } else {
        toast.error("No infrared/thermal document category is configured for this site.");
      }
    }
  }, [searchParams, documentCategories]);

  // The overview + compliance tabs render derived "completed / outstanding" markers from
  // subsections + site_documents. Deletions land in other tabs (Reports, Documents) and via the
  // server-side COC roll-up trigger (deleting a certificate flips subsections.coc_status to
  // 'Missing'), so re-read those inputs on entry to reflect changes without a full page reload.
  // fetchSiteData/fetchSiteDocuments do not toggle the page `loading` flag, so this is silent.
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === 'overview') {
      fetchSiteData();
      fetchSiteDocuments();
    }
  };

  if (loading) return <div className="flex h-[400px] items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  if (!site) return <div className="text-center py-12"><h3>Site not found</h3><Button onClick={() => navigate(`/clients/${clientId}`)}>Back</Button></div>;

  const deliverablesSummary = computeSiteDeliverables({
    siteId: siteId!,
    siteName: site?.name || "",
    subsections,
    snags,
    inspections,
    hasSchematic,
    assetCount,
    documentCategories: siteDocuments.map((d: any) => d.category),
    thermalDocSubsectionIds: subsectionDocuments
      .filter((d: any) => categoryMatches([d.category_name], THERMAL_CATEGORY_PATTERNS))
      .map((d: any) => d.subsection_id),
  });

  const siteKpis = buildSiteKpiBlock({
    deliverablesSummary,
    snags,
    subsections,
    inspections,
    today: new Date().toISOString().slice(0, 10),
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl animate-fade-in space-y-8">
      <Breadcrumbs items={[{ label: "Clients", href: "/clients", icon: "client" }, { label: site.clients?.name || "Client", href: `/clients/${clientId}`, icon: "client" }, { label: site.name, icon: "site" }]} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary border border-primary/20"><Building className="h-8 w-8" /></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{site.name}</h1>
            <div className="flex items-center text-muted-foreground mt-1"><MapPin className="h-4 w-4 mr-1.5" /><span className="text-sm">{site.address}</span></div>
            {(site.site_type || site.managing_agencies?.name) && (
              <div className="flex items-center gap-2 mt-2">
                {site.site_type && <Badge variant="secondary">{site.site_type}</Badge>}
                {site.managing_agencies?.name && (
                  <Badge variant="outline">Managed by {site.managing_agencies.name}</Badge>
                )}
              </div>
            )}
          </div>
        </div>
        <Button onClick={() => {
          setEditFormData({
            name: site.name || '', address: site.address || '',
            site_type: site.site_type || '', managing_agency_id: site.managing_agency_id || '',
          });
          setEditDialogOpen(true);
        }} variant="outline" className="gap-2"><ClipboardCheck className="h-4 w-4" />Edit Site</Button>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap w-full h-auto gap-1 p-1 overflow-visible">
          <TabsTrigger value="overview" className="gap-2 shrink-0">
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="schematic" className="gap-2 shrink-0">
            <Workflow className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Schematic Overview</span>
          </TabsTrigger>
          <TabsTrigger value="asset-verification" className="gap-2 shrink-0">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Asset Verification</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-2 shrink-0">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Documents</span>
          </TabsTrigger>
          <TabsTrigger value="subsections" className="gap-2 shrink-0">
            <Layers className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Subsections</span>
          </TabsTrigger>
          <TabsTrigger value="site-coc" className="gap-2 shrink-0">
            <Shield className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Site COC</span>
          </TabsTrigger>
          <TabsTrigger value="qr-analytics" className="gap-2 shrink-0">
            <QrCode className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">QR Codes</span>
          </TabsTrigger>
          <TabsTrigger value="fortress-checklist" className="gap-2 shrink-0">
            <ClipboardCheck className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Fortress Checklist</span>
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-2 shrink-0">
            <FileBarChart className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Reports</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Site Dashboard: KPI health metrics + the get-compliant checklist, as inner tabs */}
          <Tabs defaultValue="kpi" className="space-y-6">
            <TabsList>
              <TabsTrigger value="kpi" className="gap-2">
                <Shield className="h-4 w-4" />
                KPIs
              </TabsTrigger>
              <TabsTrigger value="checklist" className="gap-2">
                <ClipboardCheck className="h-4 w-4" />
                Checklist
              </TabsTrigger>
            </TabsList>
            <TabsContent value="kpi" className="space-y-6 mt-0">
              <ComplianceDashboard siteId={siteId!} clientId={clientId!} subsections={subsections} inspections={inspections} deliverablesSummary={deliverablesSummary} />
            </TabsContent>
            <TabsContent value="checklist" className="space-y-6 mt-0">
              <SiteComplianceChecklist summary={deliverablesSummary} clientId={clientId!} siteId={siteId!} />
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="schematic" className="space-y-6 mt-6">
          <SchematicDiagram siteId={siteId!} siteName={site.name} />
        </TabsContent>

        <TabsContent value="asset-verification" className="space-y-6 mt-6">
          <AssetVerification siteId={siteId!} siteName={site.name} />
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <SiteDocumentsComponent
            documents={siteDocuments} 
            categories={documentCategories} 
            subsectionDocuments={subsectionDocuments}
            subsections={subsections.map(s => ({ id: s.id, name: s.name }))}
            onDeleteDocument={handleDeleteSiteDocument}
            onPreview={(url, name) => setPreviewDocument({ url, name })} 
            onDownload={downloadFile}
            onUploadClick={id => { setUploadCategoryId(id); setUploadDialogOpen(true); }}
            onCreateCategory={() => setCreateCategoryOpen(true)} 
            onDeleteCategory={handleDeleteCategory}
            onBulkDeleteCategories={handleBulkDeleteCategories}
            onBulkDeleteDocumentsInCategory={handleBulkDeleteDocumentsInCategory}
            canManage={canManageDocuments}
            onRenameDocument={handleRenameDocument}
            onMoveDocuments={(docs) => setMoveDialogDocs(docs as unknown as MoveDoc[])}
            onDeleteDocuments={handleDeleteDocuments}
            onViewHistory={(doc) => setHistoryDoc({ id: doc.id, name: doc.file_name })}
            onRenameCategory={handleRenameCategory}
            onReorderCategory={handleReorderCategory}
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
          <SubsectionList subsections={subsections} clientId={clientId!} siteId={siteId!} onDelete={handleDeleteSubsection} snags={snags} />
        </TabsContent>

        <TabsContent value="site-coc" className="space-y-6">
          <SiteCocTab siteId={siteId} siteName={site.name} clientName={site.clients?.name ?? null} siteAddress={site.address ?? null} siteKpis={siteKpis} companyLogo={companyLogo} />
        </TabsContent>

        <TabsContent value="qr-analytics" className="space-y-6">
          <QRScanActivity subsections={subsections} />
          <QRCodeManager site={site} subsections={subsections} companyLogo={companyLogo} generatingAll={generatingAll} setGeneratingAll={setGeneratingAll} downloadingAll={downloadingAll} setDownloadingAll={setDownloadingAll} fetchSiteData={fetchSiteData} />
        </TabsContent>

        <TabsContent value="fortress-checklist">
          <FortressMarkingChecklist siteId={siteId!} />
        </TabsContent>

        <TabsContent value="reports">
          <SiteReports site={site} autoOpenGenerate={searchParams.get('generate') === '1'} />
        </TabsContent>
      </Tabs>

      <SiteEditDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} editFormData={editFormData} setEditFormData={setEditFormData} onSubmit={handleUpdateSite} site={site} siteId={siteId} onImageChange={fetchSiteData} />

      <DocumentDialogs
        createCategoryOpen={createCategoryOpen} setCreateCategoryOpen={setCreateCategoryOpen}
        newCategoryName={newCategoryName} setNewCategoryName={setNewCategoryName} onCreateCategory={handleCreateCategory}
        uploadCategoryId={uploadCategoryId} setUploadCategoryId={setUploadCategoryId}
        uploadFiles={uploadFiles} setUploadFiles={setUploadFiles} onUploadDocument={handleUploadDocument}
        deleteCategoryId={deleteCategoryId} setDeleteCategoryId={setDeleteCategoryId}
        onDeleteCategory={handleDeleteCategory} categories={documentCategories}
      />
      <MoveDocumentsDialog
        open={moveDialogDocs !== null}
        onOpenChange={(o) => { if (!o) setMoveDialogDocs(null); }}
        docs={moveDialogDocs ?? []}
        siteCategories={documentCategories}
        onConfirm={handleConfirmMove}
      />
      <DocumentHistoryDialog
        open={historyDoc !== null}
        onOpenChange={(o) => { if (!o) setHistoryDoc(null); }}
        documentId={historyDoc?.id ?? null}
        documentName={historyDoc?.name ?? ""}
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
