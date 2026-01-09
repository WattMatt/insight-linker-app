import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { FileText, QrCode, Layers, MapPin, Building, Image, BarChart3, FileDown, LayoutGrid, ClipboardCheck, Shield, Plus, Upload, Trash2, Eye, RefreshCw, Download } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
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
import { Card, CardContent, CardTitle, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ComplianceDashboard } from "@/components/site/ComplianceDashboard";
import { FortressMarkingChecklist } from "@/components/site/FortressMarkingChecklist";
import JSZip from "jszip";
import { generateAndUploadQRCode } from "@/lib/qr-generator";

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
  const [site, setSite] = useState<Site | null>(null);
  const [subsections, setSubsections] = useState<Subsection[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || "overview");
  const [siteDocuments, setSiteDocuments] = useState<Array<{ id: string, file_name: string, file_url: string, category: string, category_id: string }>>([]);
  const [previewDocument, setPreviewDocument] = useState<{ url: string, name: string } | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string>("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<{ site_image?: string, client_logo?: string }>({});
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: '',
    address: '',
    site_type: '',
    supply_authority: '',
    nominated_max_demand: '',
    consultant_name: '',
    consultant_company: '',
    consultant_contact: '',
  });
  const [documentCategories, setDocumentCategories] = useState<Array<{ id: string, name: string }>>([]);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [isCreateInspectionOpen, setIsCreateInspectionOpen] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<Array<{ id: string, name: string, category: string }>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [newInspectionDate, setNewInspectionDate] = useState("");
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [deleteSubsectionId, setDeleteSubsectionId] = useState<string | null>(null);
  const [deleteImageType, setDeleteImageType] = useState<'site_image' | 'client_logo' | null>(null);
  const [fixingCategories, setFixingCategories] = useState(false);
  const [siteImageFile, setSiteImageFile] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
  const [snags, setSnags] = useState<any[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);

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
      setDeleteSubsectionId(null);
      fetchSiteData(); // Refresh all data
    } catch (error) {
      console.error("Error deleting subsection:", error);
      toast.error("Failed to delete subsection");
    }
  };

  const fetchSiteData = async () => {
    try {
      const [siteRes, subsectionsRes, inspectionsRes, docsRes, snagsRes] = await Promise.all([
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
          .select("category, id, file_url")
          .eq("site_id", siteId),
        supabase
          .from("snags")
          .select("id, subsection_id, status, title")
          .in("subsection_id", (await supabase.from("subsections").select("id").eq("site_id", siteId)).data?.map(s => s.id) || []),
      ]);

      if (siteRes.error) throw siteRes.error;
      if (subsectionsRes.error) throw subsectionsRes.error;
      if (inspectionsRes.error) throw inspectionsRes.error;

      // Generate signed URL for site image if it exists (site-images bucket is private)
      let siteData = siteRes.data;
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
      const subs = subsectionsRes.data || [];
      const insp = inspectionsRes.data || [];

      // Sort subsections numerically (handles "Shop 1", "Shop 2", "Shop 10" correctly)
      const sortedSubs = subs.sort((a, b) => {
        // Extract numbers from names using regex
        const extractNumber = (str: string) => {
          const match = str.match(/(\d+)/);
          return match ? parseInt(match[1], 10) : 0;
        };

        const numA = extractNumber(a.name);
        const numB = extractNumber(b.name);

        // If both have numbers, compare numerically
        if (numA !== 0 && numB !== 0) {
          return numA - numB;
        }

        // Fallback to alphabetical if no numbers found
        return a.name.localeCompare(b.name);
      });

      setInspections(insp);
      setSnags(snagsRes.data || []);

      // Calculate stats from inspection data
      const totalSubsections = subs.length;

      // Calculate compliant count using Firebase rules
      let compliantCount = 0;
      console.log('=== CALCULATING SITE HEALTH ===');
      console.log('Total subsections:', totalSubsections);

      subs.forEach(sub => {
        console.log(`\nChecking subsection: ${sub.name}`);
        console.log(`- COC Required: ${sub.is_coc_required}`);
        console.log(`- COC Status: ${sub.coc_status}`);
        console.log(`- Metering Status: ${sub.metering_status}`);

        // Rule 1: If COC required, must be approved/valid/pass
        if (sub.is_coc_required && sub.coc_status !== 'Approved' && sub.coc_status !== 'Valid' && sub.coc_status !== 'Pass') {
          console.log(`  ❌ Failed Rule 1: COC not approved/valid/pass (status: ${sub.coc_status})`);
          return; // Not compliant
        }

        // Rule 2: If COC required, metering must not be missing (unless meter serial exists)
        if (sub.is_coc_required && sub.metering_status === 'Missing' && !sub.meter_serial_number) {
          console.log(`  ❌ Failed Rule 2: Metering missing`);
          return; // Not compliant
        }

        // Rule 3: Check for open snags from snags table
        const snagsData = snagsRes.data || [];
        const subsectionSnags = snagsData.filter(snag =>
          snag.subsection_id === sub.id &&
          snag.status !== 'rectified' &&
          snag.status !== 'Rectified'
        );

        if (subsectionSnags.length > 0) {
          console.log(`  ❌ Failed Rule 3: Has ${subsectionSnags.length} open snags`);
          return; // Not compliant
        }

        // All checks passed
        console.log(`  ✅ COMPLIANT`);
        compliantCount++;
      });

      console.log(`\nFinal compliant count: ${compliantCount} / ${totalSubsections}`);

      setStats({
        totalSubsections,
        compliantCount,
      });
    } catch (error) {
      console.error("Error fetching site data:", error);
      toast.error("Failed to fetch site data");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSiteDocument = async (documentId: string, fileName: string) => {
    try {
      // Get document details first to delete from storage
      const { data: doc, error: fetchError } = await supabase
        .from('site_documents')
        .select('file_url')
        .eq('id', documentId)
        .single();

      if (fetchError) throw fetchError;

      // Extract file path from URL and delete from storage if it's in Supabase storage
      if (doc?.file_url && doc.file_url.includes('supabase.co/storage')) {
        const url = new URL(doc.file_url);
        const pathParts = url.pathname.split('/');
        const bucketIndex = pathParts.indexOf('documents');
        if (bucketIndex !== -1) {
          const filePath = pathParts.slice(bucketIndex + 1).join('/');

          const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([filePath]);

          if (storageError) {
            console.error("Error deleting file from storage:", storageError);
          }
        }
      }

      // Delete document record
      const { error: deleteError } = await supabase
        .from('site_documents')
        .delete()
        .eq('id', documentId);

      if (deleteError) throw deleteError;

      toast.success(`${fileName} deleted successfully`);
      fetchSiteDocuments();
      setDeleteDocumentId(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete document");
    }
  };

  const handleFixCategories = async () => {
    if (!site) return;

    try {
      setFixingCategories(true);
      toast.info("Fixing document categories...");

      // Get all site documents with null category_id but with a category name
      const { data: documentsToFix, error: fetchError } = await supabase
        .from('site_documents')
        .select('id, category, category_id')
        .eq('site_id', site.id)
        .is('category_id', null)
        .not('category', 'is', null);

      if (fetchError) throw fetchError;

      if (!documentsToFix || documentsToFix.length === 0) {
        toast.success("All documents already have correct categories!");
        return;
      }

      // Group by unique category names
      const uniqueCategories = [...new Set(documentsToFix.map(doc => doc.category))];
      let fixedCount = 0;

      for (const categoryName of uniqueCategories) {
        let categoryId: string | null = null;

        // Try to find existing category
        const { data: existingCategory } = await supabase
          .from('site_document_categories')
          .select('id')
          .eq('site_id', site.id)
          .eq('name', categoryName)
          .maybeSingle();

        if (existingCategory) {
          categoryId = existingCategory.id;
        } else {
          // Create new category
          const { data: newCategory, error: categoryError } = await supabase
            .from('site_document_categories')
            .insert({
              site_id: site.id,
              name: categoryName,
              order_index: documentCategories.length + fixedCount + 1
            })
            .select('id')
            .single();

          if (categoryError) throw categoryError;
          categoryId = newCategory.id;
          fixedCount++;
        }

        // Update all documents with this category name
        const docsToUpdate = documentsToFix
          .filter(doc => doc.category === categoryName)
          .map(doc => doc.id);

        const { error: updateError } = await supabase
          .from('site_documents')
          .update({ category_id: categoryId })
          .in('id', docsToUpdate);

        if (updateError) throw updateError;
      }

      toast.success(`Fixed categories for ${documentsToFix.length} documents!`);
      await fetchDocumentCategories();
      await fetchSiteDocuments();
    } catch (error) {
      console.error("Error fixing categories:", error);
      toast.error("Failed to fix categories");
    } finally {
      setFixingCategories(false);
    }
  };

  const handleImageUpload = async (file: File, imageType: 'site_image' | 'client_logo') => {
    if (!file || !siteId) return;

    try {
      setUploadingImage(imageType);
      toast.info("Uploading image...");

      // Upload file to Supabase storage with organized naming
      const fileExt = file.name.split('.').pop();
      const fileName = `${siteId}/${imageType === 'site_image' ? 'site-image' : 'client-logo'}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('site-images')
        .upload(fileName, file, {
          upsert: true
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('site-images')
        .getPublicUrl(uploadData.path);

      // Update site record with cache-busting
      const updateColumn = imageType === 'site_image' ? 'site_image_url' : 'client_logo_url';
      const { error: updateError } = await supabase
        .from('sites')
        .update({ [updateColumn]: `${urlData.publicUrl}?t=${Date.now()}` })
        .eq('id', siteId);

      if (updateError) throw updateError;

      // Clear preview so the actual uploaded image is shown
      setImagePreview(prev => {
        const newPreview = { ...prev };
        if (imageType === 'site_image') {
          delete newPreview.site_image;
        } else {
          delete newPreview.client_logo;
        }
        return newPreview;
      });

      toast.success("Image uploaded successfully!");
      await fetchSiteData();
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error("Failed to upload image");
      // Clear preview on error too
      setImagePreview(prev => {
        const newPreview = { ...prev };
        if (imageType === 'site_image') {
          delete newPreview.site_image;
        } else {
          delete newPreview.client_logo;
        }
        return newPreview;
      });
    } finally {
      setUploadingImage(null);
    }
  };

  const handleEditSite = () => {
    if (!site) return;
    setEditFormData({
      name: site.name || '',
      address: site.address || '',
      site_type: site.site_type || '',
      supply_authority: site.supply_authority || '',
      nominated_max_demand: site.nominated_max_demand || '',
      consultant_name: site.consultant_name || '',
      consultant_company: site.consultant_company || '',
      consultant_contact: site.consultant_contact || '',
    });
    setSiteImageFile(null);
    setSiteImagePreview(null);
    setEditDialogOpen(true);
  };

  const handleUpdateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!site) return;

    try {
      let site_image_url = site.site_image_url;

      // Upload new site image if provided
      if (siteImageFile) {
        const fileExt = siteImageFile.name.split('.').pop();
        const fileName = `${site.id}/site-image.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('site-images')
          .upload(fileName, siteImageFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('site-images')
          .getPublicUrl(uploadData.path);

        site_image_url = `${urlData.publicUrl}?t=${Date.now()}`;
      }

      const { error } = await supabase
        .from('sites')
        .update({
          ...editFormData,
          site_image_url,
        })
        .eq('id', site.id);

      if (error) throw error;

      toast.success("Site updated successfully");
      setEditDialogOpen(false);
      setSiteImageFile(null);
      setSiteImagePreview(null);
      fetchSiteData();
    } catch (error) {
      console.error("Error updating site:", error);
      toast.error("Failed to update site");
    }
  };

  const handleDeleteSiteImage = async () => {
    if (!site?.site_image_url) return;

    try {
      const url = new URL(site.site_image_url);
      const pathParts = url.pathname.split('/');
      const bucketIndex = pathParts.indexOf('site-images');
      if (bucketIndex !== -1) {
        const filePath = pathParts.slice(bucketIndex + 1).join('/');
        await supabase.storage.from('site-images').remove([filePath]);
      }

      const { error } = await supabase
        .from('sites')
        .update({ site_image_url: null })
        .eq('id', site.id);

      if (error) throw error;

      toast.success("Site image deleted successfully");
      fetchSiteData();
    } catch (error) {
      console.error("Error deleting site image:", error);
      toast.error("Failed to delete site image");
    }
  };


  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadCategoryId || !siteId) return;

    try {
      toast.info("Uploading document...");

      // Find the category
      const category = documentCategories.find(cat => cat.id === uploadCategoryId);
      if (!category) {
        toast.error("Document category not found");
        return;
      }

      // Upload file to Supabase storage with organized naming
      const timestamp = Date.now();
      const sanitizedFileName = uploadFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${siteId}/${category.name}/${timestamp}-${sanitizedFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, uploadFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(uploadData.path);

      // Insert document record
      const { error: insertError } = await supabase
        .from('site_documents')
        .insert({
          site_id: siteId,
          category_id: uploadCategoryId,
          file_name: uploadFile.name,
          file_url: urlData.publicUrl,
          category: category.name,
        });

      if (insertError) throw insertError;

      toast.success("Document uploaded successfully!");
      setUploadCategoryId(null);
      setUploadFile(null);
      fetchSiteDocuments();
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Failed to upload document");
    }
  };

  const handleCreateInspection = async () => {
    if (!newInspectionDate) {
      toast.error("Please select an inspection date");
      return;
    }

    if (!selectedTemplateId) {
      toast.error("Please select an inspection template");
      return;
    }

    try {
      // Get template details
      const template = availableTemplates.find(t => t.id === selectedTemplateId);

      // Special handling for Site Drawing and Progress inspections
      let inspectionTitle = template?.name || 'New Inspection';
      if (template?.category === 'Site Drawing' || template?.category === 'Progress') {
        // Format: {Site Name} - {Template Type} - {Date}
        const formattedDate = format(new Date(newInspectionDate), 'yyyy-MM-dd');
        inspectionTitle = `${site?.name || 'Site'} - ${template.category} - ${formattedDate}`;
      }

      // Create inspection in Supabase - site level (no subsection_id)
      const { data: newInspection, error } = await supabase
        .from('inspections')
        .insert({
          site_id: siteId,
          subsection_id: null, // Site-level inspection
          template_id: selectedTemplateId,
          title: inspectionTitle,
          inspection_date: newInspectionDate,
          status: 'Pending',
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Inspection created successfully");
      setIsCreateInspectionOpen(false);
      setSelectedTemplateId("");
      setNewInspectionDate("");

      // Navigate to the new inspection
      navigate(`/inspections/${newInspection.id}`);
    } catch (error) {
      console.error("Error creating inspection:", error);
      toast.error("Failed to create inspection");
    }
  };

  const handleDeleteImage = async (imageType: 'site_image' | 'client_logo') => {
    if (!site) return;

    const imageUrl = imageType === 'site_image' ? site.site_image_url : site.client_logo_url;

    if (!imageUrl) {
      toast.error("No image to delete");
      return;
    }

    // Only allow deletion of Supabase images
    if (!imageUrl.includes('supabase.co/storage')) {
      toast.error("Firebase images cannot be deleted. Please upload a new image to Supabase first.");
      return;
    }

    try {
      // Extract file path from URL and delete from storage
      const url = new URL(imageUrl);
      const pathParts = url.pathname.split('/');
      const bucketIndex = pathParts.indexOf('site-images');
      if (bucketIndex !== -1) {
        const filePath = pathParts.slice(bucketIndex + 1).join('/');

        const { error: storageError } = await supabase.storage
          .from('site-images')
          .remove([filePath]);

        if (storageError) {
          console.error("Error deleting image from storage:", storageError);
        }
      }

      // Update site record to remove URL
      const updateColumn = imageType === 'site_image' ? 'site_image_url' : 'client_logo_url';
      const { error: updateError } = await supabase
        .from('sites')
        .update({ [updateColumn]: null })
        .eq('id', site.id);

      if (updateError) throw updateError;

      toast.success("Image deleted successfully");
      fetchSiteData();
      setDeleteImageType(null);
    } catch (error) {
      console.error("Error deleting image:", error);
      toast.error("Failed to delete image");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
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

  // Helper functions
  const getLastInspectionDate = (subsectionId: string) => {
    const inspection = inspections.find(i => i.subsection_id === subsectionId);
    return inspection?.inspection_date || null;
  };

  const getOpenSnags = (subsectionId: string) => {
    return snags.filter(snag =>
      snag.subsection_id === subsectionId &&
      snag.status !== 'rectified' &&
      snag.status !== 'Rectified'
    ).length;
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Clients", href: "/clients" },
          { label: site.clients.name, href: `/clients/${site.client_id}` },
          { label: site.name },
        ]}
      />

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{site.name}</h1>
          <p className="text-muted-foreground mt-1">{site.address}</p>
        </div>
        <Button variant="outline" onClick={handleEditSite}>
          Edit Site
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-2">
            <Shield className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Compliance</span>
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

        <TabsContent value="compliance" className="space-y-6">
          <ComplianceDashboard
            siteId={siteId!}
            subsections={subsections}
            inspections={inspections}
          />
        </TabsContent>

        <TabsContent value="overview" className="space-y-6">
          <SiteOverview site={site} stats={stats} />
          <SiteLevelInspections
            inspections={inspections}
            siteId={siteId!}
            onCreateClick={() => setIsCreateInspectionOpen(true)}
          />
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <SiteImages
            site={site}
            siteId={siteId!}
            imagePreview={imagePreview}
            setImagePreview={setImagePreview}
            handleImageUpload={handleImageUpload}
            handleDeleteImage={handleDeleteImage}
            uploadingImage={uploadingImage}
            fetchSiteData={fetchSiteData}
          />
        </TabsContent>

        <TabsContent value="documents" className="space-y-6">
          <SiteDocumentsComponent
            documents={siteDocuments}
            categories={documentCategories}
            onDeleteDocument={handleDeleteSiteDocument}
            onPreview={(url, name) => setPreviewDocument({ url, name })}
            onDownload={downloadFile}
            onUploadClick={(categoryId) => {
              setUploadCategoryId(categoryId);
              setUploadDialogOpen(true);
            }}
            onCreateCategory={() => setCreateCategoryOpen(true)}
            onDeleteCategory={(id, name) => setDeleteCategoryId(id)}
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
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold">Subsections</h3>
              <p className="text-sm text-muted-foreground">Manage and monitor all subsections for this site</p>
            </div>
            <Button onClick={() => navigate(`/clients/${clientId}/sites/${siteId}/subsections/new`)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Subsection
            </Button>
          </div>

          <SubsectionList
            subsections={subsections}
            clientId={clientId!}
            siteId={siteId!}
            onDelete={(id, name) => setDeleteSubsectionId(id)}
          />
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
        isCreateInspectionOpen={isCreateInspectionOpen} setIsCreateInspectionOpen={setIsCreateInspectionOpen}
        availableTemplates={availableTemplates} selectedTemplateId={selectedTemplateId} setSelectedTemplateId={setSelectedTemplateId}
        newInspectionDate={newInspectionDate} setNewInspectionDate={setNewInspectionDate} handleCreateInspection={handleCreateInspection}
      />
    </div >
  );
};

export default SiteDetail;
