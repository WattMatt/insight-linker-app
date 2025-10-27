import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, FileText, AlertCircle, QrCode as QrCodeIcon, Edit, Download, Upload, Trash2, Plus, ExternalLink, RefreshCw, Eye } from "lucide-react";
import { SUBSECTION_CATEGORIES, getCategoryIcon, getCategoryColor } from "@/lib/subsectionCategories";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { format } from "date-fns";
import QRCode from "qrcode";
import { LabeledQRCode } from "@/components/LabeledQRCode";
import { generateAndUploadQRCode } from "@/lib/qrCodeGenerator";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { COCValidationReport } from "@/components/COCValidationReport";
import { ValidationChat } from "@/components/ValidationChat";
import { COCPreviewApproval } from "@/components/COCPreviewApproval";

interface SubsectionData {
  name: string;
  tenantName?: string;
  category: string;
  cocNumber?: string;
  cocType?: string;
  cocStatus?: string;
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

const SubsectionDetail = () => {
  const { clientId, siteId, subsectionId } = useParams();
  const navigate = useNavigate();
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [cocType, setCocType] = useState<string>("");
  const [cocStatus, setCocStatus] = useState<string>("");
  const [cocNumber, setCocNumber] = useState<string>("");
  const [cocIssueDate, setCocIssueDate] = useState<string>("");
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
  const [documentCategories, setDocumentCategories] = useState<Array<{id: string, name: string}>>([]);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [supabaseDocuments, setSupabaseDocuments] = useState<Array<{id: string, file_name: string, file_url: string, category_id: string, uploaded_at: string}>>([]);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadCategoryId, setUploadCategoryId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);
  const [fixingTemplates, setFixingTemplates] = useState(false);
  const [fixingCategories, setFixingCategories] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({
    name: "",
    tenant_name: "",
    category: "",
    is_coc_required: true
  });
  const [snags, setSnags] = useState<any[]>([]);
  const [openSnagsCount, setOpenSnagsCount] = useState(0);
  const [cocValidations, setCocValidations] = useState<Record<string, any>>({});
  const [validatingDocId, setValidatingDocId] = useState<string | null>(null);
  const [selectedValidation, setSelectedValidation] = useState<any>(null);
  const [validationReportOpen, setValidationReportOpen] = useState(false);
  const [deleteSubsectionDialogOpen, setDeleteSubsectionDialogOpen] = useState(false);
  const [cocPreviewData, setCocPreviewData] = useState<any>(null);
  const [showCocPreview, setShowCocPreview] = useState(false);
  const [pendingDocumentForVerification, setPendingDocumentForVerification] = useState<{id: string, url: string, name: string} | null>(null);

  useEffect(() => {
    if (subsectionId && subsectionId !== "new") {
      fetchSubsectionData();
      fetchCompanyLogo();
      fetchTemplates();
      fetchDocumentCategories();
      fetchSupabaseDocuments();
      fetchSnags();
      fetchCocValidations();
    } else if (subsectionId === "new") {
      // For new subsections, just load templates and set loading to false
      setLoading(false);
      fetchTemplates();
    }
  }, [subsectionId]);

  useEffect(() => {
    // Force regenerate QR code when component mounts or logo changes
    if (subsectionId) {
      console.log("Regenerating QR code...");
      setQrCodeUrl(null); // Clear old QR code first
      generateQRCode();
    }
  }, [subsectionId, companyLogo]);

  const fetchDocumentCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('document_categories')
        .select('id, name')
        .eq('subsection_id', subsectionId)
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
      console.error("Error fetching document categories:", error);
    }
  };

  const fetchSupabaseDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('subsection_documents')
        .select('id, file_name, file_url, category_id, uploaded_at')
        .eq('subsection_id', subsectionId)
        .order('uploaded_at', { ascending: false });
      
      if (error) throw error;
      setSupabaseDocuments(data || []);
    } catch (error) {
      console.error("Error fetching Supabase documents:", error);
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
      console.error("Error fetching snags:", error);
    }
  };

  const fetchCocValidations = async () => {
    if (!subsectionId) return;
    
    try {
      const { data, error } = await supabase
        .from('coc_validations')
        .select('*')
        .eq('subsection_id', subsectionId);
      
      if (error) throw error;
      
      // Create a map of document_id -> validation result
      const validationsMap: Record<string, any> = {};
      data?.forEach(validation => {
        validationsMap[validation.document_id] = validation;
      });
      setCocValidations(validationsMap);
    } catch (error) {
      console.error("Error fetching COC validations:", error);
    }
  };

  const handleManualValidation = async (documentId: string, documentUrl: string) => {
    try {
      setValidatingDocId(documentId);
      toast.info("Starting AI validation...");

      // Get the current session to ensure we have valid auth
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('Please log in to validate documents');
        setValidatingDocId(null);
        return;
      }

      console.log('Calling validate-coc function with:', { documentId, subsectionId });

      const { data: validationData, error: validationError } = await supabase.functions.invoke('validate-coc', {
        body: {
          documentId: documentId,
          documentUrl: documentUrl,
          subsectionId: subsectionId
        }
      });

      console.log('Function response:', { data: validationData, error: validationError });

      if (validationError) {
        console.error('Validation error:', validationError);
        toast.error(`Validation failed: ${validationError.message || 'Unknown error'}`);
        return;
      }

      if (validationData?.error) {
        console.error('Function returned error:', validationData.error);
        toast.error(`Validation error: ${validationData.error}`);
        return;
      }

      if (validationData?.validation) {
        const result = validationData.validation;
        
        // Extract COC number and issue date from validation results
        let cocNumberExtracted = result.cocNumber || result.administrativeDetails?.cocNumber;
        let cocIssueDateExtracted = result.administrativeDetails?.cocIssueDate || result.cocIssueDate;
        
        // Try alternative field names for issue date
        if (!cocIssueDateExtracted) {
          cocIssueDateExtracted = result.administrativeDetails?.registrationDate || result.installationDate || result.testDate || result.evaluationDate;
        }

        // Validate that issue date is a valid date string (YYYY-MM-DD format)
        const isValidDate = (dateStr: string | null | undefined) => {
          if (!dateStr) return false;
          // Check if it matches YYYY-MM-DD format
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
          // Check if it's a valid date
          const date = new Date(dateStr);
          return date instanceof Date && !isNaN(date.getTime());
        };

        // Validate that COC number is valid (not null, not a placeholder)
        const isValidCocNumber = (cocNum: string | null | undefined) => {
          if (!cocNum) return false;
          // Reject placeholder values
          if (cocNum.toLowerCase().includes('not provided') || 
              cocNum.toLowerCase().includes('not found') ||
              cocNum.toLowerCase().includes('n/a')) return false;
          return cocNum.trim().length > 0;
        };

        // Auto-populate COC fields if extracted and valid
        const updateData: any = {};
        if (isValidCocNumber(cocNumberExtracted)) {
          updateData.coc_number = cocNumberExtracted;
        }
        if (isValidDate(cocIssueDateExtracted)) {
          updateData.coc_issue_date = cocIssueDateExtracted;
        }

        if (Object.keys(updateData).length > 0) {
          try {
            
            const { error: updateError } = await supabase
              .from('subsections')
              .update(updateData)
              .eq('id', subsectionId);
            
            if (updateError) {
              console.error('Error auto-updating COC fields:', updateError);
            } else {
              console.log('Auto-populated COC fields:', updateData);
              // Update local state
              if (subsection) {
                setSubsection({
                  ...subsection,
                  cocNumber: cocNumberExtracted || subsection.cocNumber,
                  cocIssueDate: cocIssueDateExtracted || subsection.cocIssueDate
                });
              }
            }
          } catch (error) {
            console.error('Error during auto-population:', error);
          }
        }
        
        if (result.overallStatus === 'Pass' || result.status === 'Pass') {
          toast.success('✅ COC validation passed!' + (cocNumberExtracted ? ` COC #${cocNumberExtracted} extracted.` : ''));
        } else if (result.overallStatus === 'Fail' || result.status === 'Fail') {
          toast.error(`❌ COC validation failed: ${result.criticalFailures?.length || result.violations?.length || 0} violations found`);
        } else {
          toast.warning(`⚠️ COC validation incomplete`);
        }
        
        // Refresh validations and subsection data to show updated results
        await Promise.all([
          fetchCocValidations(),
          fetchSubsectionData()
        ]);
      } else {
        toast.error('No validation result returned');
      }
    } catch (error) {
      console.error('Error during manual validation:', error);
      toast.error(`Failed to validate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setValidatingDocId(null);
    }
  };

  // New function to extract COC data for preview
  const handleExtractCocData = async (documentId: string, documentUrl: string, fileName: string) => {
    try {
      setValidatingDocId(documentId);
      toast.info("Extracting COC information...");

      // For public documents, use the URL directly
      const signedUrl = documentUrl;

      const { data: extractionData, error: extractionError } = await supabase.functions.invoke('extract-coc', {
        body: {
          documentUrl: signedUrl,
          fileName: fileName
        }
      });

      if (extractionError) {
        console.error('Extraction error:', extractionError);
        toast.error(`Failed to extract COC data: ${extractionError.message || 'Unknown error'}`);
        return;
      }

      if (extractionData?.error) {
        console.error('Function returned error:', extractionData.error);
        toast.error(`Extraction error: ${extractionData.error}`);
        return;
      }

      if (extractionData?.extractedData) {
        // Show preview with extracted data
        setCocPreviewData(extractionData.extractedData);
        setShowCocPreview(true);
        setPendingDocumentForVerification({ id: documentId, url: signedUrl, name: fileName });
        toast.success('COC information extracted! Please review before verification.');
      } else {
        toast.error('No data could be extracted from the document');
      }
    } catch (error) {
      console.error('Error during COC extraction:', error);
      toast.error(`Failed to extract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setValidatingDocId(null);
    }
  };

  // Handle approval of extracted data and start verification
  const handleApproveAndVerify = async (approvedData: any) => {
    if (!pendingDocumentForVerification) {
      toast.error('No document pending verification');
      return;
    }

    try {
      setValidatingDocId(pendingDocumentForVerification.id);
      setShowCocPreview(false);
      toast.info("Starting SANS 10142-1 verification...");

      // Update subsection with approved data first
      const updateData: any = {};
      if (approvedData.cocNumber) updateData.coc_number = approvedData.cocNumber;
      if (approvedData.cocType) updateData.coc_type = approvedData.cocType;
      if (approvedData.cocIssueDate) updateData.coc_issue_date = approvedData.cocIssueDate;

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from('subsections')
          .update(updateData)
          .eq('id', subsectionId);
      }

      // Now run the validation
      const { data: validationData, error: validationError } = await supabase.functions.invoke('validate-coc', {
        body: {
          documentId: pendingDocumentForVerification.id,
          documentUrl: pendingDocumentForVerification.url,
          subsectionId: subsectionId
        }
      });

      if (validationError || validationData?.error) {
        toast.error(`Verification failed: ${validationError?.message || validationData?.error || 'Unknown error'}`);
        return;
      }

      if (validationData?.validation) {
        const result = validationData.validation;
        
        if (result.overallStatus === 'Pass' || result.status === 'Pass') {
          toast.success('✅ COC verification passed!');
        } else if (result.overallStatus === 'Fail' || result.status === 'Fail') {
          toast.error(`❌ COC verification failed: ${result.criticalFailures?.length || result.violations?.length || 0} violations found`);
        } else {
          toast.warning(`⚠️ COC verification incomplete`);
        }
        
        // Refresh data
        await Promise.all([
          fetchCocValidations(),
          fetchSubsectionData()
        ]);
      }
    } catch (error) {
      console.error('Error during verification:', error);
      toast.error(`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setValidatingDocId(null);
      setPendingDocumentForVerification(null);
      setCocPreviewData(null);
    }
  };

  const handleRejectPreview = () => {
    setShowCocPreview(false);
    setCocPreviewData(null);
    setPendingDocumentForVerification(null);
    toast.info('COC verification cancelled');
  };

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
        toast.error("Subsection not found");
        return;
      }

      const supabaseClientId = supabaseSubsection.sites.clients.id;
      setActualClientId(supabaseClientId);
      
      // Store linked template if available
      if (supabaseSubsection.inspection_templates) {
        setLinkedTemplate(supabaseSubsection.inspection_templates as any);
      }

      // Fetch the full subsection data with details
      const { data: fullSubsection, error: fullError } = await supabase
        .from('subsections')
        .select('*')
        .eq('id', subsectionId)
        .single();

      if (fullError || !fullSubsection) {
        toast.error("Failed to load subsection details");
        return;
      }

      // Fetch inspections from Supabase
      const { data: inspectionsData, error: inspectionsError } = await supabase
        .from('inspections')
        .select('*')
        .eq('subsection_id', subsectionId)
        .order('inspection_date', { ascending: false });

      if (inspectionsError) {
        console.error("Error fetching inspections:", inspectionsError);
      }

      // Convert inspections to object format
      const inspectionsObj: Record<string, any> = {};
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

      // Set subsection data
      setSubsection({
        name: fullSubsection.name,
        tenantName: fullSubsection.tenant_name,
        category: fullSubsection.category || '',
        cocNumber: fullSubsection.coc_number,
        cocIssueDate: fullSubsection.coc_issue_date,
        cocType: fullSubsection.coc_type,
        meterSerialNumber: fullSubsection.meter_serial_number,
        ctRatio: fullSubsection.ct_ratio,
        isCocRequired: fullSubsection.is_coc_required ?? true,
        inspections: inspectionsObj
      });
      setCocType(fullSubsection.coc_type || '');
      setCocStatus(fullSubsection.coc_status || '');
      setCocNumber(fullSubsection.coc_number || '');
      setCocIssueDate(fullSubsection.coc_issue_date || '');
      setMeterSerialNumber(fullSubsection.meter_serial_number || '');
      setCtRatio(fullSubsection.ct_ratio || '');
      
      // Fetch site info for header
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
      console.error("Error fetching subsection data:", error);
      toast.error("Failed to load subsection data");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditDialog = async () => {
    if (!subsection) return;
    
    // Fetch the current subsection data from Supabase
    const { data, error } = await supabase
      .from('subsections')
      .select('*')
      .eq('id', subsectionId)
      .single();
    
    if (error || !data) {
      toast.error("Failed to load subsection details");
      return;
    }
    
    // Populate the form with current values
    setEditFormData({
      name: data.name || "",
      tenant_name: data.tenant_name || "",
      category: data.category || "",
      is_coc_required: data.is_coc_required ?? true
    });
    
    setIsEditDialogOpen(true);
  };

  const handleCreateSubsection = async () => {
    if (!editFormData.name.trim()) {
      toast.error("Subsection name is required");
      return;
    }

    if (!editFormData.category) {
      toast.error("Please select a category");
      return;
    }

    if (!siteId) {
      toast.error("Site ID is required");
      return;
    }

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
      
      // Generate QR code in the background (don't wait for it)
      if (siteData?.siteName) {
        generateAndUploadQRCode({
          subsectionId: newSubsection.id,
          siteName: siteData.siteName,
          subsectionName: newSubsection.name,
          logoUrl: companyLogo || undefined
        }).then(() => {
          console.log('QR code generated for new subsection');
        }).catch((err) => {
          console.error('Failed to generate QR code:', err);
        });
      }
      
      // Navigate to the newly created subsection
      const basePath = clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`;
      navigate(`${basePath}/subsections/${newSubsection.id}`);
    } catch (error) {
      console.error("Error creating subsection:", error);
      toast.error("Failed to create subsection");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editFormData.name.trim()) {
      toast.error("Subsection name is required");
      return;
    }

    if (!editFormData.category) {
      toast.error("Please select a category");
      return;
    }

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
      
      // Refresh the data
      await fetchSubsectionData();
    } catch (error) {
      console.error("Error updating subsection:", error);
      toast.error("Failed to update subsection");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubsection = async () => {
    try {
      toast.info("Deleting subsection...");
      setDeleteSubsectionDialogOpen(false);

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

      toast.success(`${subsection?.name} deleted successfully`);
      
      // Navigate back to site page
      const basePath = (actualClientId || clientId) 
        ? `/clients/${actualClientId || clientId}/sites/${siteId}` 
        : `/sites/${siteId}`;
      navigate(`${basePath}?tab=subsections`);
    } catch (error) {
      console.error("Error deleting subsection:", error);
      toast.error("Failed to delete subsection");
    }
  };

  const handleSaveMeteringDetails = async () => {
    if (!subsection) return;
    
    try {
      setSaving(true);
      
      // Find the subsection in Supabase by id
      const { data: supabaseSubsection, error: findError } = await supabase
        .from('subsections')
        .select('id')
        .eq('id', subsectionId)
        .maybeSingle();
      
      if (findError) {
        console.error("Error finding subsection:", findError);
        toast.error("Database error: " + findError.message);
        return;
      }
      
      if (!supabaseSubsection) {
        toast.error("Subsection not found in database");
        return;
      }
      
      // Update the subsection with new metering details
      const updateData: any = {
        updated_at: new Date().toISOString()
      };
      
      if (meterSerialNumber) {
        updateData.meter_serial_number = meterSerialNumber;
        updateData.metering_status = 'Installed'; // Update status when meter serial is provided
      }
      if (ctRatio) {
        updateData.ct_ratio = ctRatio;
      }
      
      const { error: updateError } = await supabase
        .from('subsections')
        .update(updateData)
        .eq('id', supabaseSubsection.id);
      
      if (updateError) {
        console.error("Error updating subsection:", updateError);
        throw updateError;
      }
      
      // Update local state
      setSubsection({
        ...subsection,
        meterSerialNumber: meterSerialNumber || subsection.meterSerialNumber,
        ctRatio: ctRatio || subsection.ctRatio
      });
      
      toast.success("Metering details saved successfully");
    } catch (error) {
      console.error("Error saving metering details:", error);
      toast.error("Failed to save metering details");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCocDetails = async () => {
    if (!subsection) return;
    
    try {
      setSaving(true);
      
      // Find the subsection in Supabase by id
      const { data: supabaseSubsection, error: findError } = await supabase
        .from('subsections')
        .select('id, firebase_id')
        .eq('id', subsectionId)
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
      const updateData: any = {
        coc_type: cocType,
        coc_status: cocStatus,
        updated_at: new Date().toISOString()
      };
      
      // Only update COC number and issue date if they have values
      if (cocNumber) {
        updateData.coc_number = cocNumber;
      }
      if (cocIssueDate) {
        updateData.coc_issue_date = cocIssueDate;
      }
      
      const { error: updateError } = await supabase
        .from('subsections')
        .update(updateData)
        .eq('id', supabaseSubsection.id);
      
      if (updateError) {
        console.error("Error updating subsection:", updateError);
        throw updateError;
      }
      
      // Update local state
      setSubsection({
        ...subsection,
        cocType,
        cocStatus,
        cocNumber: cocNumber || subsection.cocNumber,
        cocIssueDate: cocIssueDate || subsection.cocIssueDate
      });
      
      toast.success("COC details saved successfully");
    } catch (error) {
      console.error("Error saving COC details:", error);
      toast.error("Failed to save COC details");
    } finally {
      setSaving(false);
    }
  };

  // Helper function to find COC documents
  const getCocDocuments = () => {
    // Only return Supabase COC documents
    return getSupabaseCocDocuments();
  };

  // Helper function to get Supabase COC documents
  const getSupabaseCocDocuments = () => {
    const cocCategory = documentCategories.find(cat => 
      cat.name.toLowerCase().includes('coc')
    );
    if (!cocCategory) return [];
    return supabaseDocuments.filter(doc => doc.category_id === cocCategory.id);
  };

  // Helper function to find metering documents
  const getMeteringDocuments = () => {
    // Only return Supabase metering documents
    return getSupabaseMeteringDocuments();
  };

  // Helper function to get Supabase metering documents
  const getSupabaseMeteringDocuments = () => {
    const meteringCategory = documentCategories.find(cat => 
      cat.name.toLowerCase().includes('meter')
    );
    if (!meteringCategory) return [];
    return supabaseDocuments.filter(doc => doc.category_id === meteringCategory.id);
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim() || !subsectionId) return;
    
    try {
      toast.info("Creating category...");
      
      // Get the current max order_index
      const maxOrder = documentCategories.length > 0 
        ? Math.max(...documentCategories.map(cat => parseInt(cat.name.split(' ')[0]) || 0))
        : 0;
      
      const { data, error } = await supabase
        .from('document_categories')
        .insert({
          subsection_id: subsectionId,
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
        .from('subsection_documents')
        .delete()
        .eq('category_id', categoryId);

      if (docsError) throw docsError;

      // Then delete the category
      const { error: categoryError } = await supabase
        .from('document_categories')
        .delete()
        .eq('id', categoryId);

      if (categoryError) throw categoryError;

      toast.success(`${categoryName} deleted successfully`);
      setDeleteCategoryId(null);
      fetchDocumentCategories();
      fetchSupabaseDocuments();
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    }
  };

  const handleDocumentUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadCategoryId || !subsectionId) return;
    
    try {
      setUploadingFile(true);
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
      const fileName = `${subsectionId}/${category.name}/${timestamp}-${sanitizedFileName}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(fileName, uploadFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(uploadData.path);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Insert document record
      const { error: insertError } = await supabase
        .from('subsection_documents')
        .insert({
          subsection_id: subsectionId,
          category_id: category.id,
          file_name: uploadFile.name,
          file_url: urlData.publicUrl,
          file_size: uploadFile.size,
          uploaded_by: user?.id
        });

      if (insertError) throw insertError;

      toast.success("Document uploaded successfully!");
      setUploadCategoryId(null);
      setUploadFile(null);
      fetchSupabaseDocuments();
    } catch (error) {
      console.error("Error uploading document:", error);
      toast.error("Failed to upload document");
    } finally {
      setUploadingFile(false);
    }
  };

  const handleDeleteDocument = async (documentId: string, fileName: string) => {
    try {
      // Get document details first to delete from storage
      const { data: doc, error: fetchError } = await supabase
        .from('subsection_documents')
        .select('file_url')
        .eq('id', documentId)
        .single();

      if (fetchError) throw fetchError;

      // Extract file path from URL and delete from storage
      if (doc?.file_url) {
        const url = new URL(doc.file_url);
        const pathParts = url.pathname.split('/');
        const filePath = pathParts.slice(pathParts.indexOf('documents') + 1).join('/');
        
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([filePath]);

        if (storageError) {
          console.error("Error deleting file from storage:", storageError);
        }
      }

      // Delete document record
      const { error: deleteError } = await supabase
        .from('subsection_documents')
        .delete()
        .eq('id', documentId);

      if (deleteError) throw deleteError;

      toast.success(`${fileName} deleted successfully`);
      fetchSupabaseDocuments();
      setDeleteDocumentId(null);
    } catch (error) {
      console.error("Error deleting document:", error);
      toast.error("Failed to delete document");
    }
  };

  const handleFixCategories = async () => {
    if (!subsectionId) return;

    try {
      setFixingCategories(true);
      toast.info("Fixing document categories...");

      // Get all subsection documents with null category_id but with a category name
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

      // Get all categories for this subsection
      const { data: categories, error: categoriesError } = await supabase
        .from('document_categories')
        .select('id, name')
        .eq('subsection_id', subsectionId);

      if (categoriesError) throw categoriesError;

      // Try to match documents to categories based on file name patterns
      for (const doc of documentsToFix) {
        // Try to find matching category based on common patterns in file name
        let matchedCategory = null;

        // Check for COC-related documents
        if (doc.file_name.toLowerCase().includes('coc') || 
            doc.file_name.toLowerCase().includes('certificate')) {
          matchedCategory = categories?.find(c => c.name.toLowerCase().includes('coc'));
        }
        // Check for drawing-related documents
        else if (doc.file_name.toLowerCase().includes('drawing') || 
                 doc.file_name.toLowerCase().includes('layout')) {
          matchedCategory = categories?.find(c => 
            c.name.toLowerCase().includes('drawing') || 
            c.name.toLowerCase().includes('layout')
          );
        }
        // Check for manual/warranty documents
        else if (doc.file_name.toLowerCase().includes('manual') || 
                 doc.file_name.toLowerCase().includes('warrant')) {
          matchedCategory = categories?.find(c => 
            c.name.toLowerCase().includes('manual') || 
            c.name.toLowerCase().includes('warrant')
          );
        }

        // If we found a matching category, update the document
        if (matchedCategory) {
          const { error: updateError } = await supabase
            .from('subsection_documents')
            .update({ category_id: matchedCategory.id })
            .eq('id', doc.id);

          if (updateError) {
            console.error(`Error updating document ${doc.id}:`, updateError);
          }
        }
      }

      toast.success(`Fixed categories for ${documentsToFix.length} documents!`);
      await fetchDocumentCategories();
      await fetchSupabaseDocuments();
    } catch (error) {
      console.error("Error fixing categories:", error);
      toast.error("Failed to fix categories");
    } finally {
      setFixingCategories(false);
    }
  };

  const fetchCompanyLogo = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('company_logo_url')
        .maybeSingle();
      
      if (error) {
        console.error("Error fetching company logo:", error);
        throw error;
      }
      
      console.log("Company logo fetched:", data?.company_logo_url);
      
      if (data?.company_logo_url) {
        setCompanyLogo(data.company_logo_url);
      } else {
        console.log("No company logo found in settings");
      }
    } catch (error) {
      console.error("Error fetching company logo:", error);
    }
  };

  const generateQRCode = async () => {
    // This function is now handled by the LabeledQRCode component
    // Keeping for backward compatibility
    setQrCodeUrl('generated');
  };

  const handleDownloadDocument = async (url: string, fileName: string) => {
    console.log('Download clicked:', { url, fileName });
    
    if (!url) {
      toast.error("Document URL not available");
      return;
    }

    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      console.log('Download initiated successfully');
      toast.success(`Downloading ${fileName}`);
    } catch (error) {
      console.error("Error downloading document:", error);
      toast.error("Failed to download document");
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
      // Get template details
      const template = availableTemplates.find(t => t.id === templateToUse) || linkedTemplate;
      
      // Special handling for Site Drawing and Progress inspections
      let inspectionTitle = template?.name || 'New Inspection';
      if (template?.category === 'Site Drawing' || template?.category === 'Progress') {
        // Get site name from siteData or fetch it
        let siteName = siteData?.siteName || subsection?.name || 'Site';
        
        // If we don't have site name, fetch it
        if (!siteData?.siteName && siteId) {
          const { data: siteInfo } = await supabase
            .from('sites')
            .select('name')
            .eq('id', siteId)
            .single();
          if (siteInfo) siteName = siteInfo.name;
        }
        
        // Format: {Site Name} - {Template Type} - {Date}
        const formattedDate = format(new Date(newInspectionDate), 'yyyy-MM-dd');
        inspectionTitle = `${siteName} - ${template.category} - ${formattedDate}`;
      }
      
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
      // If trying to mark as Completed, check if quality_rating is set
      if (newStatus === 'Completed') {
        const { data: inspection, error: fetchError } = await supabase
          .from('inspections')
          .select('quality_rating')
          .eq('firebase_id', inspectionId)
          .single();
        
        if (fetchError) throw fetchError;
        
        if (!inspection?.quality_rating) {
          toast.error("Cannot mark inspection as complete without setting a quality rating (1-5). Please edit the inspection and set the quality rating in the General Info tab.");
          return;
        }
      }
      
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

  const handleFixTemplateLinks = async () => {
    setFixingTemplates(true);
    try {
      // Get all inspections for this subsection that don't have a template_id
      const { data: inspections, error: fetchError } = await supabase
        .from('inspections')
        .select('id, status, title')
        .eq('subsection_id', subsectionId)
        .is('template_id', null);

      if (fetchError) throw fetchError;

      console.log('Inspections without template_id:', inspections);

      if (!inspections || inspections.length === 0) {
        toast.info("No inspections need template linking");
        return;
      }

      let linkedCount = 0;

      // For each inspection without a template_id, try to match it to a template
      for (const inspection of inspections) {
        // Try to match based on status field (which often contains the template name/category)
        const matchingTemplate = availableTemplates.find(template => 
          inspection.status?.toLowerCase().includes(template.name.toLowerCase()) ||
          inspection.status?.toLowerCase().includes(template.category.toLowerCase()) ||
          template.name.toLowerCase().includes(inspection.status?.toLowerCase() || '')
        );

        console.log(`Inspection "${inspection.title}" with status "${inspection.status}" matched to:`, matchingTemplate?.name);

        if (matchingTemplate) {
          const { error: updateError } = await supabase
            .from('inspections')
            .update({ template_id: matchingTemplate.id })
            .eq('id', inspection.id);

          if (!updateError) {
            linkedCount++;
            console.log(`Successfully linked inspection ${inspection.id} to template ${matchingTemplate.name}`);
          } else {
            console.error('Update error:', updateError);
          }
        }
      }

      if (linkedCount > 0) {
        toast.success(`Successfully linked ${linkedCount} inspection${linkedCount > 1 ? 's' : ''} to templates`);
        await fetchSubsectionData();
      } else {
        toast.info("No matching templates found for inspections");
      }
    } catch (error) {
      console.error("Error fixing template links:", error);
      toast.error("Failed to fix template links");
    } finally {
      setFixingTemplates(false);
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

  // Handle "new" subsection creation
  if (subsectionId === "new") {
    return (
      <div className="max-w-2xl mx-auto space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => {
            const basePath = clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`;
            navigate(basePath);
          }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Create New Subsection</h1>
            <p className="text-sm text-muted-foreground">Add a new subsection or tenant to this site</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Subsection Details</CardTitle>
            <CardDescription>Enter the details for the new subsection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Subsection Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Main Board, Tenant A"
                value={editFormData.name}
                onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tenant_name">Tenant/Unit Name</Label>
              <Input
                id="tenant_name"
                placeholder="e.g., Shop 123, Office Floor 2"
                value={editFormData.tenant_name}
                onChange={(e) => setEditFormData({ ...editFormData, tenant_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={editFormData.category}
                onValueChange={(value) => setEditFormData({ ...editFormData, category: value })}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {SUBSECTION_CATEGORIES.map((cat) => {
                    const Icon = getCategoryIcon(cat.value);
                    return (
                      <SelectItem key={cat.value} value={cat.value}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {cat.label}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="is_coc_required"
                checked={editFormData.is_coc_required}
                onChange={(e) => setEditFormData({ ...editFormData, is_coc_required: e.target.checked })}
                className="rounded border-gray-300"
              />
              <Label htmlFor="is_coc_required" className="font-normal cursor-pointer">
                Certificate of Compliance (COC) Required
              </Label>
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleCreateSubsection}
                disabled={saving}
                className="flex-1"
              >
                {saving ? "Creating..." : "Create Subsection"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const basePath = clientId ? `/clients/${clientId}/sites/${siteId}` : `/sites/${siteId}`;
                  navigate(basePath);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!subsection || !siteData) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-muted-foreground">Subsection data not found</p>
          <Button className="mt-4" onClick={() => {
            const basePath = (actualClientId || clientId) ? `/clients/${actualClientId || clientId}/sites/${siteId}` : `/sites/${siteId}`;
            navigate(basePath);
          }}>
            Back to Site
          </Button>
        </div>
      </div>
    );
  }

  const inspections = subsection.inspections || {};
  const inspectionArray = Object.entries(inspections);
  const hasSnags = openSnagsCount > 0;
  const hasIncompleteInspections = inspectionArray.some(([_, insp]) => insp.status !== 'Completed');
  const isNotCompliant = hasSnags || hasIncompleteInspections;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => {
            const basePath = (actualClientId || clientId) ? `/clients/${actualClientId || clientId}/sites/${siteId}` : `/sites/${siteId}`;
            navigate(`${basePath}?tab=subsections`);
          }}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              {subsection.category && (() => {
                const CategoryIcon = getCategoryIcon(subsection.category);
                const colors = getCategoryColor(subsection.category);
                return (
                  <div className={`w-10 h-10 rounded flex items-center justify-center ${colors.bg} ${colors.text}`}>
                    <CategoryIcon className="h-6 w-6" />
                  </div>
                );
              })()}
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
          <Button variant="outline" onClick={handleOpenEditDialog}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setDeleteSubsectionDialogOpen(true)}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
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
                This status is determined by open snags, COC validation, and inspection completion status. The following issues were found:
                <ul className="list-disc list-inside mt-2">
                  {hasSnags && <li>{openSnagsCount} open snag{openSnagsCount !== 1 ? 's' : ''} requiring attention</li>}
                  {hasIncompleteInspections && <li>Not all inspections have been marked as completed.</li>}
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
                      onClick={() => {
                        const basePath = (actualClientId || clientId) 
                          ? `/clients/${actualClientId || clientId}/sites/${siteId}/subsections/${subsectionId}` 
                          : `/sites/${siteId}/subsections/${subsectionId}`;
                        navigate(`${basePath}/inspections/${id}`);
                      }}
                    >
                      <div>
                        <p className="font-medium">
                          {inspection.title || inspection.type || 'Inspection'}
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
                {supabaseDocuments.length} file(s) found for this subsection.
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
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleFixTemplateLinks}
                  disabled={fixingTemplates}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${fixingTemplates ? 'animate-spin' : ''}`} />
                  {fixingTemplates ? 'Fixing...' : 'Fix Template Links'}
                </Button>
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
              </div>
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
                        onClick={() => {
                          const basePath = (actualClientId || clientId) 
                            ? `/clients/${actualClientId || clientId}/sites/${siteId}/subsections/${subsectionId}` 
                            : `/sites/${siteId}/subsections/${subsectionId}`;
                          navigate(`${basePath}/inspections/${id}`);
                        }}
                      >
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">
                            {(() => {
                              // Find template name by templateId (camelCase from merged data)
                              const template = availableTemplates.find(t => t.id === inspection.templateId);
                              return template?.name || inspection.title || inspection.type || 'Inspection';
                            })()}
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
          {/* Documents */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Documents</CardTitle>
                  <CardDescription>Manage documents for this subsection</CardDescription>
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
                    const categoryDocs = supabaseDocuments.filter(doc => doc.category_id === category.id);
                    
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
                                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
                                >
                                  <div className="flex items-center gap-3 flex-1">
                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                    <div className="flex-1">
                                      <p className="text-sm font-medium">{doc.file_name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {new Date(doc.uploaded_at).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleDownloadDocument(doc.file_url, doc.file_name)}
                                    >
                                      <Download className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setDeleteDocumentId(doc.id)}
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
                    const doc = supabaseDocuments.find(d => d.id === deleteDocumentId);
                    if (doc) handleDeleteDocument(deleteDocumentId!, doc.file_name);
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

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
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setCreateCategoryOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!newCategoryName.trim()}>
                    Create Category
                  </Button>
                </div>
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
              <form onSubmit={handleDocumentUpload}>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="document-file">Document File *</Label>
                    <Input
                      id="document-file"
                      type="file"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      required={!uploadFile}
                    />
                    {uploadFile && (
                      <p className="text-sm text-muted-foreground">
                        Selected: {uploadFile.name}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => {
                    setUploadCategoryId(null);
                    setUploadFile(null);
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!uploadFile || uploadingFile}>
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingFile ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </form>
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
                  const supabaseCocDocs = getSupabaseCocDocuments();
                  const hasDocs = cocDocs.length > 0 || supabaseCocDocs.length > 0;
                  
                  return hasDocs ? (
                    <div className="space-y-4">
                      {/* Supabase COC Documents */}
                      {supabaseCocDocs.map((doc) => (
                        <div key={doc.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3 flex-1">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <p className="font-medium">{doc.file_name}</p>
                                  {cocValidations[doc.id] && (
                                    <div className="flex items-center gap-2">
                                      <Badge 
                                        variant={
                                          cocValidations[doc.id].status === 'Pass' ? 'default' : 
                                          cocValidations[doc.id].status === 'Fail' ? 'destructive' : 
                                          'secondary'
                                        }
                                        className="text-xs"
                                      >
                                        {cocValidations[doc.id].status === 'Pass' && '✅ '}
                                        {cocValidations[doc.id].status === 'Fail' && '❌ '}
                                        {cocValidations[doc.id].status}
                                      </Badge>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                          setSelectedValidation(cocValidations[doc.id]);
                                          setValidationReportOpen(true);
                                        }}
                                        title="View full validation report"
                                        className="h-6 w-6 p-0"
                                      >
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(doc.uploaded_at).toLocaleDateString()}
                                </p>
                                {cocValidations[doc.id]?.violations && cocValidations[doc.id].violations.length > 0 && (
                                  <details className="mt-2 text-sm">
                                    <summary className="text-destructive cursor-pointer font-medium">
                                      {cocValidations[doc.id].violations.length} SANS 10142-1 violation(s)
                                    </summary>
                                    <ul className="mt-2 ml-4 space-y-2">
                                      {cocValidations[doc.id].violations.map((v: any, i: number) => (
                                        <li key={i} className="text-muted-foreground border-l-2 border-destructive pl-3">
                                          <strong className="text-foreground">Clause {v.clause}:</strong> {v.description}
                                          {v.evidence && (
                                            <div className="text-xs mt-1 italic">Evidence: {v.evidence}</div>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleExtractCocData(doc.id, doc.file_url, doc.file_name)}
                                disabled={validatingDocId === doc.id}
                                title="Extract and verify COC against SANS 10142-1"
                              >
                                {validatingDocId === doc.id ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  'Verify COC'
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownloadDocument(doc.file_url, doc.file_name)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteDocumentId(doc.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <Label>COC Number</Label>
                              <Input
                                value={cocNumber || subsection.cocNumber || ''}
                                onChange={(e) => setCocNumber(e.target.value)}
                                placeholder="ECA 642760"
                                className="mt-1"
                              />
                            </div>
                            <div>
                              <Label>Issue Date</Label>
                              <Input
                                type="date"
                                value={cocIssueDate || (subsection.cocIssueDate ? format(new Date(subsection.cocIssueDate), 'yyyy-MM-dd') : '')}
                                onChange={(e) => setCocIssueDate(e.target.value)}
                                className="mt-1"
                              />
                            </div>
                          </div>

                          <div className="mt-4">
                            <Label>COC Type</Label>
                            <div className="flex gap-4 mt-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocType-${doc.id}`}
                                  value="Initial"
                                  checked={cocType === 'Initial'}
                                  onChange={(e) => setCocType(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Initial</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocType-${doc.id}`}
                                  value="Temporary"
                                  checked={cocType === 'Temporary'}
                                  onChange={(e) => setCocType(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Temporary</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocType-${doc.id}`}
                                  value="Supplementary"
                                  checked={cocType === 'Supplementary'}
                                  onChange={(e) => setCocType(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Supplementary</span>
                              </label>
                            </div>
                          </div>

                          <div className="mt-4">
                            <Label>COC Status</Label>
                            <div className="flex gap-4 mt-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocStatus-${doc.id}`}
                                  value="Pass"
                                  checked={cocStatus === 'Pass'}
                                  onChange={(e) => setCocStatus(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Pass</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocStatus-${doc.id}`}
                                  value="Fail"
                                  checked={cocStatus === 'Fail'}
                                  onChange={(e) => setCocStatus(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Fail</span>
                              </label>
                            </div>
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
                      
                      {/* Firebase COC Documents (Legacy) */}
                      {cocDocs.map((doc, idx) => (
                        <div key={idx} className="border rounded-lg p-4 bg-muted/30">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{doc.file_name}</p>
                                <Badge variant="secondary" className="text-xs">Supabase</Badge>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDownloadDocument(doc.file_url, doc.file_name)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : subsection.cocNumber ? (
                    <div className="space-y-4">
                      {cocDocs.map((doc, idx) => (
                        <div key={idx} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <div>
                                <p className="font-medium">{doc.file_name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {new Date(doc.uploaded_at).toLocaleDateString()}
                                </p>
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
                            value={cocNumber || subsection.cocNumber || ''}
                            onChange={(e) => setCocNumber(e.target.value)}
                            placeholder="ECA 642760"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Issue Date</Label>
                          <Input
                            type="date"
                            value={cocIssueDate || (subsection.cocIssueDate ? format(new Date(subsection.cocIssueDate), 'yyyy-MM-dd') : '')}
                            onChange={(e) => setCocIssueDate(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>

                          <div className="mt-4">
                            <Label>COC Type</Label>
                            <div className="flex gap-4 mt-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocType-${idx}`}
                                  value="Initial"
                                  checked={cocType === 'Initial'}
                                  onChange={(e) => setCocType(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Initial</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocType-${idx}`}
                                  value="Temporary"
                                  checked={cocType === 'Temporary'}
                                  onChange={(e) => setCocType(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Temporary</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocType-${idx}`}
                                  value="Supplementary"
                                  checked={cocType === 'Supplementary'}
                                  onChange={(e) => setCocType(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Supplementary</span>
                              </label>
                            </div>
                          </div>

                          <div className="mt-4">
                            <Label>COC Status</Label>
                            <div className="flex gap-4 mt-2">
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocStatus-${idx}`}
                                  value="Pass"
                                  checked={cocStatus === 'Pass'}
                                  onChange={(e) => setCocStatus(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Pass</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`cocStatus-${idx}`}
                                  value="Fail"
                                  checked={cocStatus === 'Fail'}
                                  onChange={(e) => setCocStatus(e.target.value)}
                                  className="w-4 h-4 text-primary cursor-pointer"
                                />
                                <span className="text-sm">Fail</span>
                              </label>
                            </div>
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
                            value={cocNumber || subsection.cocNumber || ''}
                            onChange={(e) => setCocNumber(e.target.value)}
                            placeholder="ECA 642760"
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label>Issue Date</Label>
                          <Input
                            type="date"
                            value={cocIssueDate || (subsection.cocIssueDate ? format(new Date(subsection.cocIssueDate), 'yyyy-MM-dd') : '')}
                            onChange={(e) => setCocIssueDate(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <Label>COC Type</Label>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="cocType"
                              value="Initial"
                              checked={cocType === 'Initial'}
                              onChange={(e) => setCocType(e.target.value)}
                              className="w-4 h-4 text-primary cursor-pointer"
                            />
                            <span className="text-sm">Initial</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="cocType"
                              value="Temporary"
                              checked={cocType === 'Temporary'}
                              onChange={(e) => setCocType(e.target.value)}
                              className="w-4 h-4 text-primary cursor-pointer"
                            />
                            <span className="text-sm">Temporary</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="cocType"
                              value="Supplementary"
                              checked={cocType === 'Supplementary'}
                              onChange={(e) => setCocType(e.target.value)}
                              className="w-4 h-4 text-primary cursor-pointer"
                            />
                            <span className="text-sm">Supplementary</span>
                          </label>
                        </div>
                      </div>

                      <div className="mt-4">
                        <Label>COC Status</Label>
                        <div className="flex gap-4 mt-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="cocStatus"
                              value="Pass"
                              checked={cocStatus === 'Pass'}
                              onChange={(e) => setCocStatus(e.target.value)}
                              className="w-4 h-4 text-primary cursor-pointer"
                            />
                            <span className="text-sm">Pass</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="radio"
                              name="cocStatus"
                              value="Fail"
                              checked={cocStatus === 'Fail'}
                              onChange={(e) => setCocStatus(e.target.value)}
                              className="w-4 h-4 text-primary cursor-pointer"
                            />
                            <span className="text-sm">Fail</span>
                          </label>
                        </div>
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
                  <label className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer block">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {uploadingFile ? "Uploading..." : "Click to select or drag & drop files"}
                    </p>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      disabled={uploadingFile}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const cocCategory = documentCategories.find(cat => cat.name === '01 COC');
                          if (cocCategory) {
                            setUploadCategoryId(cocCategory.id);
                            setUploadFile(file);
                            
                            // Auto-trigger upload
                            try {
                              setUploadingFile(true);
                              toast.info("Uploading COC document...");

                              const timestamp = Date.now();
                              const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                              const fileName = `${subsectionId}/${cocCategory.name}/${timestamp}-${sanitizedFileName}`;
                              
                              const { data: uploadData, error: uploadError } = await supabase.storage
                                .from('documents')
                                .upload(fileName, file);

                              if (uploadError) throw uploadError;

                              const { data: urlData } = supabase.storage
                                .from('documents')
                                .getPublicUrl(uploadData.path);

                              const { data: { user } } = await supabase.auth.getUser();

                              const { error: insertError, data: newDoc } = await supabase
                                .from('subsection_documents')
                                .insert({
                                  subsection_id: subsectionId,
                                  category_id: cocCategory.id,
                                  file_name: file.name,
                                  file_url: urlData.publicUrl,
                                  file_size: file.size,
                                  uploaded_by: user?.id
                                })
                                .select('id')
                                .single();

                              if (insertError) throw insertError;

                              toast.success("COC document uploaded successfully!");
                              
                              // Show preview immediately without extraction
                              if (newDoc && urlData.publicUrl) {
                                // Generate a signed URL for preview
                                const { data: signedData } = await supabase.storage
                                  .from('documents')
                                  .createSignedUrl(uploadData.path, 3600);
                                
                                const previewUrl = signedData?.signedUrl || urlData.publicUrl;
                                
                                // Show preview dialog with empty fields
                                setCocPreviewData(null); // No extracted data yet
                                setShowCocPreview(true);
                                setPendingDocumentForVerification({ 
                                  id: newDoc.id, 
                                  url: previewUrl, 
                                  name: sanitizedFileName 
                                });
                              }

                              setUploadCategoryId(null);
                              setUploadFile(null);
                              fetchSupabaseDocuments();
                              e.target.value = ''; // Reset input
                            } catch (error) {
                              console.error("Error uploading COC document:", error);
                              toast.error("Failed to upload COC document");
                            } finally {
                              setUploadingFile(false);
                            }
                          }
                        }
                      }}
                    />
                  </label>
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
                      value={meterSerialNumber || subsection.meterSerialNumber || ''}
                      onChange={(e) => setMeterSerialNumber(e.target.value)}
                      placeholder="Enter meter serial number"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>CT Ratio</Label>
                    <Input
                      value={ctRatio || subsection.ctRatio || ''}
                      onChange={(e) => setCtRatio(e.target.value)}
                      placeholder="Enter CT ratio"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label>Metering Documents</Label>
                  {(() => {
                    const meteringDocs = getMeteringDocuments();
                    const supabaseMeteringDocs = getSupabaseMeteringDocuments();
                    const hasDocs = meteringDocs.length > 0 || supabaseMeteringDocs.length > 0;
                    
                    return hasDocs ? (
                      <div className="mt-2 space-y-2">
                        {/* Supabase Metering Documents */}
                        {supabaseMeteringDocs.map((doc) => (
                          <div
                            key={doc.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <span className="text-sm font-medium">{doc.file_name}</span>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(doc.uploaded_at).toLocaleDateString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDownloadDocument(doc.file_url, doc.file_name)}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteDocumentId(doc.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </div>
                        ))}
                        
                        {/* Firebase Metering Documents (Legacy) */}
                        {meteringDocs.map((doc, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors bg-muted/30"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium">{doc.file_name}</span>
                              <Badge variant="secondary" className="text-xs">Supabase</Badge>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDownloadDocument(doc.file_url, doc.file_name)}
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
                  <label className="border-2 border-dashed rounded-lg p-8 text-center bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer block">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {uploadingFile ? "Uploading..." : "Click to select or drag & drop files"}
                    </p>
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      disabled={uploadingFile}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const meteringCategory = documentCategories.find(cat => cat.name === '04 Metering');
                          if (meteringCategory) {
                            setUploadCategoryId(meteringCategory.id);
                            setUploadFile(file);
                            
                            // Auto-trigger upload
                            try {
                              setUploadingFile(true);
                              toast.info("Uploading metering document...");

                              const timestamp = Date.now();
                              const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                              const fileName = `${subsectionId}/${meteringCategory.name}/${timestamp}-${sanitizedFileName}`;
                              
                              const { data: uploadData, error: uploadError } = await supabase.storage
                                .from('documents')
                                .upload(fileName, file);

                              if (uploadError) throw uploadError;

                              const { data: urlData } = supabase.storage
                                .from('documents')
                                .getPublicUrl(uploadData.path);

                              const { data: { user } } = await supabase.auth.getUser();

                              const { error: insertError } = await supabase
                                .from('subsection_documents')
                                .insert({
                                  subsection_id: subsectionId,
                                  category_id: meteringCategory.id,
                                  file_name: file.name,
                                  file_url: urlData.publicUrl,
                                  file_size: file.size,
                                  uploaded_by: user?.id
                                });

                              if (insertError) throw insertError;

                              toast.success("Metering document uploaded successfully!");
                              setUploadCategoryId(null);
                              setUploadFile(null);
                              fetchSupabaseDocuments();
                              e.target.value = ''; // Reset input
                            } catch (error) {
                              console.error("Error uploading metering document:", error);
                              toast.error("Failed to upload metering document");
                            } finally {
                              setUploadingFile(false);
                            }
                          }
                        }
                      }}
                    />
                  </label>
                </div>

                <Button 
                  onClick={handleSaveMeteringDetails}
                  disabled={saving}
                  className="w-full md:w-auto bg-blue-500 hover:bg-blue-600"
                >
                  {saving ? "Saving..." : "Save Metering Details"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Subsection Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Edit Subsection</DialogTitle>
            <p className="text-sm text-muted-foreground">
              A subsection can be a tenant, a piece of equipment, or a specific area on site.
            </p>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Subsection Category */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Subsection Category *</Label>
              <div className="grid grid-cols-2 gap-3">
                {SUBSECTION_CATEGORIES.map((category) => {
                  const CategoryIcon = category.icon;
                  const isSelected = editFormData.category === category.value;
                  
                  return (
                    <button
                      key={category.value}
                      type="button"
                      onClick={() => setEditFormData({...editFormData, category: category.value})}
                      className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                        isSelected
                          ? `${category.color.border} ${category.color.bg}`
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className={`h-8 w-8 flex items-center justify-center ${category.color.bg} ${category.color.text} rounded`}>
                        <CategoryIcon className="h-5 w-5" />
                      </div>
                      <span className="font-medium text-sm">{category.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subsection Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-base font-medium">
                Subsection Name *
              </Label>
              <Input
                id="edit-name"
                value={editFormData.name}
                onChange={(e) => setEditFormData({...editFormData, name: e.target.value})}
                placeholder="e.g., Shop 101, Main LV Board"
                className="h-11"
              />
            </div>

            {/* Tenant Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-tenant" className="text-base font-medium">
                Tenant Name (Optional)
              </Label>
              <Input
                id="edit-tenant"
                value={editFormData.tenant_name}
                onChange={(e) => setEditFormData({...editFormData, tenant_name: e.target.value})}
                placeholder="e.g., ABC Retailers"
                className="h-11"
              />
            </div>

            {/* COC Required */}
            <div className="space-y-3">
              <Label className="text-base font-medium">
                Is a Certificate of Compliance (COC) required for this subsection?
              </Label>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setEditFormData({...editFormData, is_coc_required: true})}
                  className={`flex items-center gap-2 ${
                    editFormData.is_coc_required ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                    editFormData.is_coc_required ? "border-primary" : "border-muted-foreground"
                  }`}>
                    {editFormData.is_coc_required && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span>Yes</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditFormData({...editFormData, is_coc_required: false})}
                  className={`flex items-center gap-2 ${
                    !editFormData.is_coc_required ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                    !editFormData.is_coc_required ? "border-primary" : "border-muted-foreground"
                  }`}>
                    {!editFormData.is_coc_required && (
                      <div className="h-2 w-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <span>No</span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => setIsEditDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={saving || !editFormData.name || !editFormData.category}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* COC Preview and Approval Dialog */}
      <Dialog open={showCocPreview} onOpenChange={setShowCocPreview}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-y-auto">
          {pendingDocumentForVerification && (
            <COCPreviewApproval
              extractedData={cocPreviewData}
              documentName={pendingDocumentForVerification.name}
              documentUrl={pendingDocumentForVerification.url}
              onApprove={handleApproveAndVerify}
              onReject={handleRejectPreview}
              isProcessing={validatingDocId === pendingDocumentForVerification.id}
              onExtract={() => {
                if (pendingDocumentForVerification) {
                  handleExtractCocData(
                    pendingDocumentForVerification.id,
                    pendingDocumentForVerification.url,
                    pendingDocumentForVerification.name
                  );
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Validation Report Dialog */}
      <Dialog open={validationReportOpen} onOpenChange={setValidationReportOpen}>
        <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>COC Validation Report & Discussion</DialogTitle>
          </DialogHeader>
          {selectedValidation && (
            <div className="flex-1 overflow-y-auto">
              <Tabs defaultValue="report" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="report">Validation Report</TabsTrigger>
                  <TabsTrigger value="chat">Ask Questions</TabsTrigger>
                </TabsList>
                <TabsContent value="report" className="mt-4">
                  <COCValidationReport 
                    validation={{
                      ...selectedValidation,
                      subsection_id: subsectionId || ''
                    }} 
                    subsectionName={subsection?.name}
                  />
                </TabsContent>
                <TabsContent value="chat" className="mt-4">
                  <ValidationChat
                    validationId={selectedValidation.id}
                    subsectionId={subsectionId || ''}
                    documentId={selectedValidation.document_id}
                    validationData={selectedValidation.report_data}
                  />
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Subsection Confirmation Dialog */}
      <AlertDialog open={deleteSubsectionDialogOpen} onOpenChange={setDeleteSubsectionDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Subsection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{subsection?.name}"? This will permanently delete all associated inspections, documents, snags, and QR codes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteSubsection}
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

export default SubsectionDetail;
