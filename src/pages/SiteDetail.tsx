import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/Breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FortressMarkingChecklist } from "@/components/FortressMarkingChecklist";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { FileText, QrCode, Plus, Layers, MapPin, Building, User, Mail, Download, Trash2, Upload, Image, BarChart3, FileDown, LayoutGrid, RefreshCw, AlertCircle, ClipboardCheck, Shield, Search, Filter, X, Eye } from "lucide-react";
import { LabeledQRCode } from "@/components/LabeledQRCode";
import { generateAndUploadQRCode } from "@/lib/qrCodeGenerator";
import { getCategoryIcon, getCategoryColor, getCategoryConfig } from "@/lib/subsectionCategories";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";
import { SiteSummaryReport } from "@/components/SiteSummaryReport";
import { useIsMobile } from "@/hooks/use-mobile";
import { ComplianceDashboard } from "@/components/ComplianceDashboard";
import JSZip from 'jszip';
import { DocumentPreviewDialog } from '@/components/DocumentPreviewDialog';
import { downloadFile } from '@/lib/fileDownload';

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
  site_image_url: string | null;
  client_logo_url: string | null;
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
  qr_code_url: string | null;
}

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

interface SiteStats {
  totalSubsections: number;
  compliantCount: number;
  cocApprovedCount: number;
  cocRequiredCount: number;
  meteringInstalledCount: number;
  openSnags: number;
}

const SiteDetail = () => {
  const { clientId, siteId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [site, setSite] = useState<Site | null>(null);
  const [subsections, setSubsections] = useState<Subsection[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [documents, setDocuments] = useState<SiteDocument[]>([]);
  const [snags, setSnags] = useState<Array<{id: string, subsection_id: string, status: string, title: string}>>([]);
  const [stats, setStats] = useState<SiteStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || "overview");
  const [siteDocuments, setSiteDocuments] = useState<Array<{id: string, file_name: string, file_url: string, category: string, category_id: string}>>([]);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [previewDocument, setPreviewDocument] = useState<{url: string, name: string} | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string>("");
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [deleteImageType, setDeleteImageType] = useState<'site_image' | 'client_logo' | null>(null);
  const [fixingCategories, setFixingCategories] = useState(false);
  const [imagePreview, setImagePreview] = useState<{site_image?: string, client_logo?: string}>({});
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [siteImageFile, setSiteImageFile] = useState<File | null>(null);
  const [siteImagePreview, setSiteImagePreview] = useState<string | null>(null);
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
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState('');
  const [documentCategories, setDocumentCategories] = useState<Array<{id: string, name: string}>>([]);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [isCreateInspectionOpen, setIsCreateInspectionOpen] = useState(false);
  const [availableTemplates, setAvailableTemplates] = useState<Array<{id: string, name: string, category: string}>>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [newInspectionDate, setNewInspectionDate] = useState("");
  const [deleteSubsectionId, setDeleteSubsectionId] = useState<string | null>(null);
  
  // Subsection filter states
  const [subsectionSearch, setSubsectionSearch] = useState("");
  const [complianceFilter, setComplianceFilter] = useState<"all" | "pass" | "fail">("all");
  const [cocFilter, setCocFilter] = useState<"all" | "approved" | "pending" | "expired" | "missing" | "failed">("all");
  const [meteringFilter, setMeteringFilter] = useState<"all" | "installed" | "missing">("all");
  const [snagFilter, setSnagFilter] = useState<"all" | "has_snags" | "no_snags">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

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
        .order('created_at', { ascending: false});
      
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
      
      setSubsections(sortedSubs);
      setInspections(insp);
      setSnags(snagsRes.data || []);
      
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
      
      const cocRequiredCount = subs.filter((s) => s.is_coc_required).length;
      const cocApprovedCount = subs.filter((s) => 
        s.is_coc_required && (s.coc_status === "Approved" || s.coc_status === "Valid" || s.coc_status === "Pass")
      ).length;
      const meteringInstalledCount = subs.filter((s) => 
        s.metering_status === "Installed" || s.meter_serial_number
      ).length;
      
      // Calculate open snags from snags table
      const snagsData = snagsRes.data || [];
      const totalOpenSnags = snagsData.filter(snag => 
        snag.status !== 'rectified' && snag.status !== 'Rectified'
      ).length;

      setStats({
        totalSubsections,
        compliantCount,
        cocApprovedCount,
        cocRequiredCount,
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

  // Calculate compliance
  const calculateCompliance = (subsection: Subsection) => {
    // Rule 1: If COC is required, must have approved COC
    if (subsection.is_coc_required && subsection.coc_status !== 'Approved') {
      return false;
    }
    
    // Rule 2: If COC is required, metering must not be missing (unless meter serial exists)
    if (subsection.is_coc_required && subsection.metering_status === 'Missing' && !subsection.meter_serial_number) {
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
  const cocCompliance = stats && stats.cocRequiredCount > 0 
    ? Math.round((stats.cocApprovedCount / stats.cocRequiredCount) * 100) || 0 
    : 0;
  const meteringPercentage = stats ? Math.round((stats.meteringInstalledCount / stats.totalSubsections) * 100) || 0 : 0;
  
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
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutGrid className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">Overview</span>
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

        <TabsContent value="compliance" className="space-y-6">
          <ComplianceDashboard 
            siteId={siteId!}
            subsections={subsections}
            inspections={inspections}
          />
        </TabsContent>

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
                  {stats?.cocApprovedCount || 0} of {stats?.cocRequiredCount || 0} required COCs are compliant
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

          {/* Site-Level Inspections Card */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Site Inspections</CardTitle>
                <CardDescription>
                  Site-wide inspections (Site Drawings, Progress Reports, etc.)
                </CardDescription>
              </div>
              <Button onClick={() => setIsCreateInspectionOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Inspection
              </Button>
            </CardHeader>
            <CardContent>
              {inspections.filter(i => !i.subsection_id).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No site-level inspections yet</p>
                  <p className="text-sm mt-2">Create a Site Drawing or Progress Report for the entire site</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {inspections
                    .filter(i => !i.subsection_id)
                    .slice(0, 5)
                    .map((inspection) => (
                      <div
                        key={inspection.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/inspections/${inspection.id}`)}
                      >
                        <div>
                          <p className="font-medium">{inspection.json_data?.title || 'Untitled Inspection'}</p>
                          <p className="text-sm text-muted-foreground">
                            {inspection.inspection_date ? format(new Date(inspection.inspection_date), 'PPP') : 'No date'}
                          </p>
                        </div>
                        <Badge>{inspection.json_data?.status || 'Pending'}</Badge>
                      </div>
                    ))}
                  {inspections.filter(i => !i.subsection_id).length > 5 && (
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => navigate(`/inspections?site=${siteId}`)}
                    >
                      View all {inspections.filter(i => !i.subsection_id).length} inspections
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site Images</CardTitle>
              <CardDescription>Manage site logo and main image</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Site Main Image */}
              <div>
                <h3 className="text-sm font-medium mb-3">Site Main Image</h3>
                {imagePreview.site_image ? (
                  <div className="relative group w-fit mb-3">
                  <img
                      src={imagePreview.site_image}
                      alt="Preview"
                      className="w-64 h-48 object-cover rounded border bg-muted"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                        e.currentTarget.alt = 'Image preview unavailable';
                      }}
                    />
                    <Badge variant="secondary" className="absolute top-2 left-2">
                      Preview
                    </Badge>
                  </div>
                ) : site.site_image_url ? (
                  <div className="relative group w-fit">
                    {(site.site_image_url.includes('firebasestorage.googleapis.com') || 
                      site.site_image_url.includes('storage.googleapis.com') ||
                      !site.site_image_url.includes('supabase.co/storage')) ? (
                      <div className="w-64 h-48 border-2 border-dashed border-amber-500 rounded flex flex-col items-center justify-center text-muted-foreground p-4">
                        <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
                        <p className="text-sm text-center mb-3">Legacy image URL detected</p>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={async () => {
                            await supabase
                              .from('sites')
                              .update({ site_image_url: null })
                              .eq('id', siteId);
                            toast.success("Legacy URL removed. Please upload a new image.");
                            window.location.reload();
                          }}
                        >
                          Clear & Upload New
                        </Button>
                      </div>
                    ) : (
                      <>
                        <img
                          key={site.site_image_url}
                          src={site.site_image_url}
                          alt="Site main image"
                          className="w-64 h-48 object-cover rounded border bg-muted"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setDeleteImageType('site_image')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="w-64 h-48 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                    No image
                  </div>
                )}
                <div className="mt-3">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="site-image-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          // Show preview immediately
                          const reader = new FileReader();
                          const previewPromise = new Promise<string>((resolve, reject) => {
                            reader.onload = (event) => resolve(event.target?.result as string);
                            reader.onerror = reject;
                          });
                          reader.readAsDataURL(file);
                          const result = await previewPromise;
                          setImagePreview(prev => ({ ...prev, site_image: result }));
                          
                          // Upload image - handleImageUpload will clear preview on success
                          await handleImageUpload(file, 'site_image');
                        } catch (error) {
                          console.error('Upload error:', error);
                          setImagePreview(prev => {
                            const newPreview = { ...prev };
                            delete newPreview.site_image;
                            return newPreview;
                          });
                        }
                      }
                      // Reset input so same file can be selected again
                      e.target.value = '';
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('site-image-upload')?.click()}
                    disabled={uploadingImage === 'site_image'}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingImage === 'site_image' ? 'Uploading...' : 'Upload New Image'}
                  </Button>
                </div>
              </div>

              {/* Client Logo */}
              <div>
                <h3 className="text-sm font-medium mb-3">Client Logo</h3>
                {imagePreview.client_logo ? (
                  <div className="relative group w-fit mb-3">
                  <img
                      src={imagePreview.client_logo}
                      alt="Preview"
                      className="w-48 h-32 object-contain rounded border p-2 bg-muted"
                      onError={(e) => {
                        e.currentTarget.src = '/placeholder.svg';
                        e.currentTarget.alt = 'Image preview unavailable';
                      }}
                    />
                    <Badge variant="secondary" className="absolute top-2 left-2">
                      Preview
                    </Badge>
                  </div>
                ) : site.client_logo_url ? (
                  <div className="relative group w-fit">
                    {site.client_logo_url.includes('firebasestorage.googleapis.com') ? (
                      <div className="w-48 h-32 border-2 border-dashed border-amber-500 rounded flex flex-col items-center justify-center text-muted-foreground p-4">
                        <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
                        <p className="text-xs font-medium text-center mb-2">Legacy Firebase Logo</p>
                        <p className="text-xs text-center mb-3">No longer accessible</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              await supabase
                                .from('sites')
                                .update({ client_logo_url: null })
                                .eq('id', siteId);
                              toast.success("Legacy URL removed. Please upload a new logo.");
                              fetchSiteData();
                            } catch (error) {
                              toast.error("Failed to clear legacy URL");
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Clear & Upload New
                        </Button>
                      </div>
                    ) : (
                      <>
                        <img
                          key={site.client_logo_url}
                          src={site.client_logo_url}
                          alt="Client logo"
                          className="w-48 h-32 object-contain rounded border p-2 bg-muted"
                          crossOrigin="anonymous"
                          onError={(e) => {
                            e.currentTarget.src = '/placeholder.svg';
                            e.currentTarget.alt = 'Image preview unavailable';
                          }}
                        />
                        {site.client_logo_url.includes('supabase.co/storage') && (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setDeleteImageType('client_logo')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="w-48 h-32 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground">
                    No logo
                  </div>
                )}
                <div className="mt-3">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    id="client-logo-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        try {
                          // Show preview immediately
                          const reader = new FileReader();
                          const previewPromise = new Promise<string>((resolve, reject) => {
                            reader.onload = (event) => resolve(event.target?.result as string);
                            reader.onerror = reject;
                          });
                          reader.readAsDataURL(file);
                          const result = await previewPromise;
                          setImagePreview(prev => ({ ...prev, client_logo: result }));
                          
                          // Upload image - handleImageUpload will clear preview on success
                          await handleImageUpload(file, 'client_logo');
                        } catch (error) {
                          console.error('Logo upload error:', error);
                          setImagePreview(prev => {
                            const newPreview = { ...prev };
                            delete newPreview.client_logo;
                            return newPreview;
                          });
                        }
                      }
                      // Reset input so same file can be selected again
                      e.target.value = '';
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('client-logo-upload')?.click()}
                    disabled={uploadingImage === 'client_logo'}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingImage === 'client_logo' ? 'Uploading...' : 'Upload New Logo'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <AlertDialog open={deleteImageType !== null} onOpenChange={() => setDeleteImageType(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Image</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this {deleteImageType === 'site_image' ? 'site image' : 'client logo'}? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => deleteImageType && handleDeleteImage(deleteImageType)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="documents" className="space-y-4">
          {/* Site Documents */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Site Documents (Supabase)</CardTitle>
                  <CardDescription>Documents uploaded for this site</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={handleFixCategories} 
                    size="sm" 
                    variant="outline"
                    disabled={fixingCategories}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {fixingCategories ? 'Fixing...' : 'Fix Categories'}
                  </Button>
                  <Button onClick={() => setCreateCategoryOpen(true)} size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Category
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {documentCategories.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No document categories yet. Create one to get started.</p>
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {documentCategories.map((category) => {
                    const categoryDocs = siteDocuments.filter(doc => doc.category_id === category.id);
                    
                    return (
                      <AccordionItem key={category.id} value={category.id}>
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center justify-between w-full pr-4">
                            <div className="flex items-center gap-3">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{category.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">{categoryDocs.length}</Badge>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteCategoryId(category.id);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="space-y-2 pl-7 pt-2">
                            <Button 
                              size="sm" 
                              variant="outline" 
                              onClick={() => setUploadCategoryId(category.id)}
                              className="mb-3"
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Upload to {category.name}
                            </Button>
                            {categoryDocs.length === 0 ? (
                              <p className="text-sm text-muted-foreground py-4">No documents in this category yet.</p>
                            ) : (
                              categoryDocs.map((doc) => (
                                <div
                                  key={doc.id}
                                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer"
                                  onClick={() => setPreviewDocument({ url: doc.file_url, name: doc.file_name })}
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                    <div className="flex-1">
                                      <p className="text-sm font-medium">{doc.file_name}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setPreviewDocument({ url: doc.file_url, name: doc.file_name });
                                      }}
                                      title="Preview"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        downloadFile(doc.file_url, doc.file_name);
                                      }}
                                      title="Download"
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteDocumentId(doc.id);
                                      }}
                                      title="Delete"
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </CardContent>
          </Card>

          <AlertDialog open={deleteDocumentId !== null} onOpenChange={() => setDeleteDocumentId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Document</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this document? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={() => {
                    const doc = siteDocuments.find(d => d.id === deleteDocumentId);
                    if (doc) handleDeleteSiteDocument(deleteDocumentId!, doc.file_name);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <DocumentPreviewDialog
            open={previewDocument !== null}
            onOpenChange={(open) => !open && setPreviewDocument(null)}
            fileUrl={previewDocument?.url || ''}
            fileName={previewDocument?.name || ''}
          />
        </TabsContent>

        <TabsContent value="subsections" className="space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:justify-between md:items-center">
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

          {/* Search and Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or tenant..."
                    value={subsectionSearch}
                    onChange={(e) => setSubsectionSearch(e.target.value)}
                    className="pl-9"
                  />
                  {subsectionSearch && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                      onClick={() => setSubsectionSearch("")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                
                {/* Filters */}
                <div className="flex flex-wrap gap-2">
                  <Select value={complianceFilter} onValueChange={(v: "all" | "pass" | "fail") => setComplianceFilter(v)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Compliance" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pass">✅ Passing</SelectItem>
                      <SelectItem value="fail">❌ Failing</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={cocFilter} onValueChange={(v: "all" | "approved" | "pending" | "expired" | "missing" | "failed") => setCocFilter(v)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="CoC Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All CoC</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="missing">Missing</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={meteringFilter} onValueChange={(v: "all" | "installed" | "missing") => setMeteringFilter(v)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Metering" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Metering</SelectItem>
                      <SelectItem value="installed">Installed</SelectItem>
                      <SelectItem value="missing">Missing</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={snagFilter} onValueChange={(v: "all" | "has_snags" | "no_snags") => setSnagFilter(v)}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Snags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Snags</SelectItem>
                      <SelectItem value="has_snags">Has Snags</SelectItem>
                      <SelectItem value="no_snags">No Snags</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {Array.from(new Set(subsections.map(s => s.category || 'Uncategorized'))).map(cat => (
                        <SelectItem key={cat} value={cat}>{getCategoryConfig(cat).label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {(complianceFilter !== "all" || cocFilter !== "all" || meteringFilter !== "all" || snagFilter !== "all" || categoryFilter !== "all" || subsectionSearch) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setComplianceFilter("all");
                        setCocFilter("all");
                        setMeteringFilter("all");
                        setSnagFilter("all");
                        setCategoryFilter("all");
                        setSubsectionSearch("");
                      }}
                      className="text-muted-foreground"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Clear filters
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {subsections.length === 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="text-center py-12">
                  <Layers className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No subsections yet</h3>
                  <p className="text-muted-foreground">Create your first subsection</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            (() => {
              // Filter subsections
              const filteredSubsections = subsections.filter(sub => {
                // Search filter
                if (subsectionSearch) {
                  const searchLower = subsectionSearch.toLowerCase();
                  if (!sub.name.toLowerCase().includes(searchLower) && 
                      !(sub.tenant_name?.toLowerCase().includes(searchLower))) {
                    return false;
                  }
                }
                
                // Compliance filter
                if (complianceFilter !== "all") {
                  const isCompliant = calculateCompliance(sub);
                  if (complianceFilter === "pass" && !isCompliant) return false;
                  if (complianceFilter === "fail" && isCompliant) return false;
                }
                
                // CoC filter
                if (cocFilter !== "all") {
                  const status = sub.coc_status?.toLowerCase();
                  if (cocFilter === "approved" && status !== "approved" && status !== "valid" && status !== "pass") return false;
                  if (cocFilter === "pending" && status !== "pending") return false;
                  if (cocFilter === "expired" && status !== "expired") return false;
                  if (cocFilter === "failed" && status !== "failed" && status !== "fail") return false;
                  if (cocFilter === "missing" && status && status !== "missing" && status !== "") return false;
                }
                
                // Metering filter
                if (meteringFilter !== "all") {
                  const hasMetering = sub.metering_status === "Installed" || sub.meter_serial_number;
                  if (meteringFilter === "installed" && !hasMetering) return false;
                  if (meteringFilter === "missing" && hasMetering) return false;
                }
                
                // Snag filter
                if (snagFilter !== "all") {
                  const openSnags = getOpenSnags(sub.id);
                  if (snagFilter === "has_snags" && openSnags === 0) return false;
                  if (snagFilter === "no_snags" && openSnags > 0) return false;
                }
                
                // Category filter
                if (categoryFilter !== "all") {
                  if ((sub.category || 'Uncategorized') !== categoryFilter) return false;
                }
                
                return true;
              });
              
              // Group filtered subsections by category
              const groupedSubsections = filteredSubsections.reduce((acc, sub) => {
                const category = sub.category || 'Uncategorized';
                const categoryConfig = getCategoryConfig(category);
                const displayCategory = categoryConfig.label;
                
                if (!acc[displayCategory]) {
                  acc[displayCategory] = [];
                }
                acc[displayCategory].push(sub);
                return acc;
              }, {} as Record<string, Subsection[]>);

              if (filteredSubsections.length === 0) {
                return (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Filter className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No matching subsections</h3>
                      <p className="text-muted-foreground">Try adjusting your filters or search term</p>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <>
                  <p className="text-sm text-muted-foreground">
                    Showing {filteredSubsections.length} of {subsections.length} subsections
                  </p>
                  <Accordion type="multiple" defaultValue={Object.keys(groupedSubsections)} className="space-y-4">
                  {Object.entries(groupedSubsections).map(([category, categorySubsections]) => {
                    const CategoryIcon = getCategoryIcon(category);
                    const colors = getCategoryColor(category);
                    
                    return (
                      <AccordionItem key={category} value={category} className="border rounded-lg">
                        <AccordionTrigger className="px-6 py-4 hover:no-underline">
                          <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 flex items-center justify-center ${colors.bg} ${colors.text} rounded-lg`}>
                              <CategoryIcon className="h-5 w-5" />
                            </div>
                            <div className="text-left">
                              <h4 className="font-semibold text-base">{category}</h4>
                              <p className="text-sm text-muted-foreground">
                                {categorySubsections.length} {categorySubsections.length === 1 ? 'subsection' : 'subsections'}
                              </p>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-0 pb-0">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Tenant</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>CoC</TableHead>
                                <TableHead>Metering</TableHead>
                                <TableHead>Last Inspected</TableHead>
                                <TableHead>Open Snags</TableHead>
                                <TableHead className="w-[50px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {categorySubsections.map((sub) => {
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
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
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
                                          </TooltipTrigger>
                                          {!isCompliant && (
                                            <TooltipContent className="max-w-xs">
                                              <p className="font-semibold mb-1">Failing because:</p>
                                              <ul className="text-xs space-y-1">
                                                {sub.is_coc_required && sub.coc_status !== 'Approved' && (
                                                  <li>• CoC status is "{sub.coc_status}" (needs "Approved")</li>
                                                )}
                                                {sub.is_coc_required && sub.metering_status === 'Missing' && !sub.meter_serial_number && (
                                                  <li>• Metering data is missing</li>
                                                )}
                                                {openSnags > 0 && (
                                                  <li>• Has {openSnags} open snag{openSnags > 1 ? 's' : ''}</li>
                                                )}
                                              </ul>
                                            </TooltipContent>
                                          )}
                                        </Tooltip>
                                      </TooltipProvider>
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
                                          sub.metering_status === "Installed" || sub.meter_serial_number
                                            ? "bg-green-500/10 text-green-500"
                                            : sub.is_coc_required
                                            ? "bg-red-500/10 text-red-500"
                                            : "bg-gray-500/10 text-gray-500"
                                        }
                                      >
                                        {sub.is_coc_required 
                                          ? (sub.metering_status === "Installed" || sub.meter_serial_number ? "Installed" : sub.metering_status)
                                          : "N/A"}
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
                                    <TableCell>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeleteSubsectionId(sub.id);
                                        }}
                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
                </>
              );
            })()
          )}
        </TabsContent>

        <TabsContent value="qr-analytics" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>QR Codes for All Subsections</CardTitle>
                  <CardDescription>
                    Generate and download QR codes for all subsections on {site.name}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      setGeneratingAll(true);
                      toast.info("Regenerating QR codes for all subsections...");
                      
                      let successCount = 0;
                      let failCount = 0;
                      
                      for (const subsection of subsections) {
                        try {
                          console.log(`Generating QR code for: ${subsection.name} (${subsection.category || 'No category'})`);
                          const result = await generateAndUploadQRCode({
                            subsectionId: subsection.id,
                            siteName: site.name,
                            subsectionName: subsection.name,
                            logoUrl: companyLogo || undefined
                          });
                          if (result) {
                            console.log(`✓ Generated QR for ${subsection.name}`);
                            successCount++;
                          } else {
                            console.error(`✗ Failed to generate QR for ${subsection.name}: No URL returned`);
                            failCount++;
                          }
                        } catch (error) {
                          console.error(`✗ Failed to generate QR for ${subsection.name}:`, error);
                          failCount++;
                        }
                      }
                      
                      setGeneratingAll(false);
                      
                      if (failCount === 0) {
                        toast.success(`Successfully regenerated ${successCount} QR codes!`);
                      } else {
                        toast.warning(`Regenerated ${successCount} QR codes, ${failCount} failed`);
                      }
                      
                      fetchSiteData(); // Refresh to show new QR codes
                    }}
                    disabled={generatingAll || subsections.length === 0}
                    variant="secondary"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    {generatingAll ? "Generating..." : "Generate All"}
                  </Button>
                  <Button
                    onClick={async () => {
                      setDownloadingAll(true);
                      toast.info("Generating all QR codes and PDF...");
                      
                      // Import dynamically
                      const QRCode = await import('qrcode');
                      const { default: jsPDF } = await import('jspdf');
                      const zip = new JSZip();
                    
                    // Get QR base URL from settings
                    const { data: qrSettings } = await supabase
                      .from('settings')
                      .select('qr_base_url')
                      .single();
                    
                    const baseUrl = (qrSettings?.qr_base_url || window.location.origin).replace(/\/$/, '');
                    
                    // Store canvas data URLs for PDF generation
                    const qrCodeDataUrls: { dataUrl: string; name: string }[] = [];
                    
                    for (const subsection of subsections) {
                      try {
                        // Create a canvas for this QR code
                        const canvas = document.createElement('canvas');
                        const qrSize = 500;
                        const padding = 40;
                        const textHeight = 140;
                        const totalHeight = qrSize + textHeight + (padding * 2);
                        const totalWidth = qrSize + (padding * 2);
                        
                        canvas.width = totalWidth;
                        canvas.height = totalHeight;
                        
                        const ctx = canvas.getContext('2d');
                        if (!ctx) continue;
                        
                        // White background
                        ctx.fillStyle = 'white';
                        ctx.fillRect(0, 0, totalWidth, totalHeight);
                        
                        // Border
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 3;
                        ctx.strokeRect(1.5, 1.5, totalWidth - 3, totalHeight - 3);
                        
                        // Generate QR code
                        const tempCanvas = document.createElement('canvas');
                        await QRCode.default.toCanvas(tempCanvas, `${baseUrl}/public/subsections/${subsection.id}`, {
                          width: qrSize,
                          margin: 1,
                          errorCorrectionLevel: 'H'
                        });
                        
                        // Draw QR code
                        ctx.drawImage(tempCanvas, padding, padding, qrSize, qrSize);
                        
                        // Add logo if available
                        if (companyLogo) {
                          await new Promise<void>((resolve) => {
                            const img = document.createElement('img');
                            img.crossOrigin = 'anonymous';
                            img.onload = () => {
                              const maxLogoSize = qrSize * 0.2;
                              let logoWidth = img.width;
                              let logoHeight = img.height;
                              
                              if (logoWidth > logoHeight) {
                                if (logoWidth > maxLogoSize) {
                                  logoHeight = (logoHeight * maxLogoSize) / logoWidth;
                                  logoWidth = maxLogoSize;
                                }
                              } else {
                                if (logoHeight > maxLogoSize) {
                                  logoWidth = (logoWidth * maxLogoSize) / logoHeight;
                                  logoHeight = maxLogoSize;
                                }
                              }
                              
                              const logoX = padding + (qrSize - logoWidth) / 2;
                              const logoY = padding + (qrSize - logoHeight) / 2;
                              const logoPadding = Math.min(logoWidth, logoHeight) * 0.15;
                              
                              ctx.fillStyle = 'white';
                              ctx.fillRect(logoX - logoPadding, logoY - logoPadding, logoWidth + (logoPadding * 2), logoHeight + (logoPadding * 2));
                              ctx.drawImage(img, logoX, logoY, logoWidth, logoHeight);
                              resolve();
                            };
                            img.onerror = () => resolve();
                            img.src = companyLogo;
                          });
                        }
                        
                        // Add text labels
                        const textStartY = padding + qrSize + 40;
                        ctx.fillStyle = 'black';
                        ctx.font = 'bold 38px Arial, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';
                        ctx.fillText(site.name.toUpperCase(), totalWidth / 2, textStartY);
                        ctx.font = '32px Arial, sans-serif';
                        ctx.fillText(subsection.name, totalWidth / 2, textStartY + 52);
                        
                        // Store data URL for PDF
                        const dataUrl = canvas.toDataURL('image/png');
                        qrCodeDataUrls.push({ dataUrl, name: subsection.name });
                        
                        // Convert to blob and add to zip
                        const blob = await new Promise<Blob>((resolve) => {
                          canvas.toBlob((blob) => resolve(blob!), 'image/png');
                        });
                        
                        const fileName = `${site.name}-${subsection.name}-QR.png`.replace(/[^a-zA-Z0-9.-]/g, '_');
                        zip.file(fileName, blob);
                      } catch (error) {
                        console.error(`Error generating QR for ${subsection.name}:`, error);
                      }
                    }
                    
                    // Generate PDF with QR codes arranged 3 across on continuous page
                    try {
                      const pageWidth = 210; // A4 width in mm
                      const margin = 15;
                      const cols = 3;
                      const colGap = 10; // Gap between columns
                      const qrWidth = (pageWidth - (margin * 2) - (colGap * (cols - 1))) / cols;
                      const qrHeight = qrWidth; // Keep square
                      const rowSpacing = 15; // Space between rows
                      
                      // Calculate total rows needed
                      const totalRows = Math.ceil(qrCodeDataUrls.length / cols);
                      const totalHeight = margin + (totalRows * qrHeight) + ((totalRows - 1) * rowSpacing) + margin;
                      
                      // Create continuous page with custom height
                      const pdf = new jsPDF({
                        orientation: 'portrait',
                        unit: 'mm',
                        format: [pageWidth, totalHeight]
                      });
                      
                      let currentX = margin;
                      let currentY = margin;
                      let col = 0;
                      
                      for (let i = 0; i < qrCodeDataUrls.length; i++) {
                        const { dataUrl } = qrCodeDataUrls[i];
                        
                        // Add QR code image (square)
                        pdf.addImage(dataUrl, 'PNG', currentX, currentY, qrWidth, qrHeight);
                        
                        // Move to next position
                        col++;
                        if (col >= cols) {
                          // Move to next row
                          col = 0;
                          currentX = margin;
                          currentY += qrHeight + rowSpacing;
                        } else {
                          // Move to next column
                          currentX += qrWidth + colGap;
                        }
                      }
                      
                      // Add PDF to zip
                      const pdfBlob = pdf.output('blob');
                      zip.file(`${site.name}-All-QR-Codes.pdf`.replace(/[^a-zA-Z0-9.-]/g, '_'), pdfBlob);
                    } catch (error) {
                      console.error('Error generating PDF:', error);
                      toast.error("Failed to generate PDF, but individual images are ready");
                    }
                    
                    // Generate and download zip
                    const content = await zip.generateAsync({ type: 'blob' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(content);
                    link.download = `${site.name}-All-QR-Codes.zip`.replace(/[^a-zA-Z0-9.-]/g, '_');
                    link.click();
                    
                    toast.success("All QR codes and PDF downloaded!");
                    setDownloadingAll(false);
                  }}
                  disabled={downloadingAll || subsections.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {downloadingAll ? "Generating..." : `Download All (${subsections.length})`}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {subsections.length === 0 ? (
                <div className="text-center py-12">
                  <QrCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">No subsections found. Create a subsection to generate QR codes.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {subsections.map((subsection) => (
                    <Card key={subsection.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center relative">
                          {subsection.qr_code_url ? (
                            <img 
                              src={subsection.qr_code_url} 
                              alt={`QR Code for ${subsection.name}`}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <LabeledQRCode
                              url={`${window.location.origin.replace(/\/$/, '')}/public/subsections/${subsection.id}`}
                              siteName={site.name}
                              subsectionName={subsection.name}
                              logoUrl={companyLogo || undefined}
                            />
                          )}
                        </div>
                        <h3 className="font-semibold text-sm mb-1">{subsection.name}</h3>
                        {subsection.tenant_name && (
                          <p className="text-xs text-muted-foreground mb-2">{subsection.tenant_name}</p>
                        )}
                        {!subsection.qr_code_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full"
                            onClick={async () => {
                              toast.info("Generating QR code...");
                              try {
                                console.log(`Generating QR for ${subsection.name} (${subsection.category || 'No category'})`);
                                const url = await generateAndUploadQRCode({
                                  subsectionId: subsection.id,
                                  siteName: site.name,
                                  subsectionName: subsection.name,
                                  logoUrl: companyLogo || undefined
                                });
                                if (url) {
                                  console.log(`✓ QR generated successfully: ${url}`);
                                  toast.success("QR code generated!");
                                  fetchSiteData(); // Refresh to show the new QR code
                                } else {
                                  console.error(`✗ QR generation returned null for ${subsection.name}`);
                                  toast.error("Failed to generate QR code. Check console for details.");
                                }
                              } catch (error) {
                                console.error(`✗ Error generating QR for ${subsection.name}:`, error);
                                toast.error(`Failed to generate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`);
                              }
                            }}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Generate QR Code
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fortress-checklist" className="space-y-4">
          <FortressMarkingChecklist siteId={siteId!} />
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

      {/* Edit Site Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Site</DialogTitle>
            <DialogDescription>
              Update the site information
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateSite}>
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <h3 className="font-semibold">Basic Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Site Name *</Label>
                  <Input
                    id="edit-name"
                    value={editFormData.name}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    placeholder="e.g., Waterfall Mall"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-address">Physical Address</Label>
                  <Input
                    id="edit-address"
                    value={editFormData.address}
                    onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                    placeholder="e.g., 123 Main Street, City"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-site-type">Site Type</Label>
                  <Input
                    id="edit-site-type"
                    value={editFormData.site_type}
                    onChange={(e) => setEditFormData({ ...editFormData, site_type: e.target.value })}
                    placeholder="e.g., Retail, Office, Industrial"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Electrical Details</h3>
                <div className="space-y-2">
                  <Label htmlFor="edit-supply-authority">Supply Authority</Label>
                  <Input
                    id="edit-supply-authority"
                    value={editFormData.supply_authority}
                    onChange={(e) => setEditFormData({ ...editFormData, supply_authority: e.target.value })}
                    placeholder="e.g., City Power"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-nmd">Nominated Max Demand (NMD)</Label>
                  <Input
                    id="edit-nmd"
                    value={editFormData.nominated_max_demand}
                    onChange={(e) => setEditFormData({ ...editFormData, nominated_max_demand: e.target.value })}
                    placeholder="e.g., 500 kVA"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Consultant Information</h3>
                <div className="space-y-2">
                  <Label htmlFor="edit-consultant-company">Consultant Company</Label>
                  <Input
                    id="edit-consultant-company"
                    value={editFormData.consultant_company}
                    onChange={(e) => setEditFormData({ ...editFormData, consultant_company: e.target.value })}
                    placeholder="e.g., Watson Mattheus Consulting"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-consultant-name">Consultant Name</Label>
                  <Input
                    id="edit-consultant-name"
                    value={editFormData.consultant_name}
                    onChange={(e) => setEditFormData({ ...editFormData, consultant_name: e.target.value })}
                    placeholder="e.g., John Smith"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-consultant-contact">Consultant Contact</Label>
                  <Input
                    id="edit-consultant-contact"
                    value={editFormData.consultant_contact}
                    onChange={(e) => setEditFormData({ ...editFormData, consultant_contact: e.target.value })}
                    placeholder="e.g., john@company.com or +27 123 456 789"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Site Image</h3>
                
                {/* Site Image */}
                <div className="space-y-2">
                  <Label>Site Image</Label>
                  {siteImagePreview ? (
                    <div className="mb-2">
                      <img
                        src={siteImagePreview}
                        alt="Site image preview"
                        className="w-64 h-48 object-cover rounded border"
                      />
                    </div>
                  ) : site.site_image_url && !siteImageFile ? (
                    <div className="relative group w-fit mb-2">
                      {(site.site_image_url.includes('firebasestorage.googleapis.com') || 
                        site.site_image_url.includes('storage.googleapis.com') ||
                        !site.site_image_url.includes('supabase.co/storage')) ? (
                        <div className="w-64 h-48 border-2 border-dashed border-amber-500 rounded flex flex-col items-center justify-center text-muted-foreground p-4">
                          <AlertCircle className="h-8 w-8 text-amber-500 mb-2" />
                          <p className="text-sm text-center mb-3">Legacy image URL detected</p>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={async () => {
                              await supabase
                                .from('sites')
                                .update({ site_image_url: null })
                                .eq('id', siteId);
                              toast.success("Legacy URL removed");
                              window.location.reload();
                            }}
                          >
                            Clear Legacy URL
                          </Button>
                        </div>
                      ) : (
                        <img
                          src={site.site_image_url}
                          alt="Current site image"
                          className="w-64 h-48 object-cover rounded border"
                        />
                      )}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('site-image-upload-edit')?.click()}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {site.site_image_url ? 'Change Image' : 'Upload Image'}
                    </Button>
                    <input
                      id="site-image-upload-edit"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setSiteImageFile(file);
                        if (file) {
                          const preview = URL.createObjectURL(file);
                          setSiteImagePreview(preview);
                        } else {
                          setSiteImagePreview(null);
                        }
                      }}
                    />
                    <span className="text-sm text-muted-foreground">
                      {siteImageFile ? siteImageFile.name : ""}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Category Dialog */}
      <Dialog open={createCategoryOpen} onOpenChange={setCreateCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Document Category</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateCategory}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">Category Name *</Label>
                <Input
                  id="category-name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="e.g., 08 Test Reports"
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateCategoryOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newCategoryName.trim()}>
                Create Category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadCategoryId !== null} onOpenChange={(open) => {
        if (!open) {
          setUploadCategoryId(null);
          setUploadFile(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUploadDocument}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="document-file">Document File *</Label>
                <Input
                  id="document-file"
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  required={!uploadFile}
                />
                {uploadFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {uploadFile.name}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                setUploadCategoryId(null);
                setUploadFile(null);
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={!uploadFile}>
                <Upload className="h-4 w-4 mr-2" />
                Upload
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Inspection Dialog */}
      <Dialog open={isCreateInspectionOpen} onOpenChange={setIsCreateInspectionOpen}>
        <DialogContent className="bg-popover">
          <DialogHeader>
            <DialogTitle>Create Site Inspection</DialogTitle>
            <DialogDescription>
              Create a site-wide inspection like Site Drawing or Progress Report
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="templateSelect">Inspection Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
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

      {/* Delete Category Dialog */}
      <AlertDialog open={deleteCategoryId !== null} onOpenChange={() => setDeleteCategoryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this category? All documents in this category will also be deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                const category = documentCategories.find(c => c.id === deleteCategoryId);
                if (category) handleDeleteCategory(deleteCategoryId!, category.name);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Subsection Dialog */}
      <AlertDialog open={deleteSubsectionId !== null} onOpenChange={() => setDeleteSubsectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subsection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this subsection? This will permanently delete all associated inspections, documents, snags, and QR codes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                const subsection = subsections.find(s => s.id === deleteSubsectionId);
                if (subsection) handleDeleteSubsection(deleteSubsectionId!, subsection.name);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SiteDetail;
