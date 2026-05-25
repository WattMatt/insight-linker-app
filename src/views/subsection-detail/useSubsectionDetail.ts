import { useEffect, useState } from "react";
import { useParams, useNavigate } from "@/lib/navigation";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { generateAndUploadQRCode } from "@/lib/qrCodeGenerator";
import { useOfflineSubsections } from "@/hooks/useOfflineSubsections";
import type {
  SubsectionData,
  SiteData,
  CocDocData,
  SupabaseDocument,
  DocumentCategory,
  EditFormData,
  PendingDocumentForVerification,
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
  const [subsection, setSubsection] = useState<SubsectionData | null>(null);
  const [siteData, setSiteData] = useState<SiteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [cocDataByDocument, setCocDataByDocument] = useState<Record<string, CocDocData>>({});
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
  const [cocValidations, setCocValidations] = useState<Record<string, any>>({});
  const [cocExtractions, setCocExtractions] = useState<Record<string, any>>({});
  const [validatingDocId, setValidatingDocId] = useState<string | null>(null);
  const [reExtractingDocId, setReExtractingDocId] = useState<string | null>(null);
  const [selectedValidationDocId, setSelectedValidationDocId] = useState<string | null>(null);
  const [validationReportOpen, setValidationReportOpen] = useState(false);

  const selectedValidation = selectedValidationDocId ? cocValidations[selectedValidationDocId] : null;
  const [deleteSubsectionDialogOpen, setDeleteSubsectionDialogOpen] = useState(false);
  const [cocPreviewData, setCocPreviewData] = useState<any>(null);
  const [showCocPreview, setShowCocPreview] = useState(false);
  const [pendingDocumentForVerification, setPendingDocumentForVerification] = useState<PendingDocumentForVerification | null>(null);
  const [offlineDocuments, setOfflineDocuments] = useState<any[]>([]);
  const [offlineFloorPlans, setOfflineFloorPlans] = useState<any[]>([]);
  const [cocPreviewDoc, setCocPreviewDoc] = useState<{id: string, file_name: string, file_url: string, uploaded_at: string} | null>(null);
  const [cocPreviewDialogOpen, setCocPreviewDialogOpen] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<{file_name: string, file_url: string} | null>(null);
  const [editingExtractionDoc, setEditingExtractionDoc] = useState<{id: string, url: string, name: string} | null>(null);

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
        .select('id, file_name, file_url, category_id, uploaded_at, coc_number, coc_issue_date, coc_type, coc_status')
        .eq('subsection_id', subsectionId)
        .order('uploaded_at', { ascending: false });

      if (error) throw error;
      setSupabaseDocuments(data || []);

      if (data && data.length > 0) {
        const initialCocData: Record<string, CocDocData> = {};
        data.forEach(doc => {
          if (doc.coc_type || doc.coc_status || doc.coc_number || doc.coc_issue_date) {
            initialCocData[doc.id] = {
              cocType: normalizeCocType(doc.coc_type),
              cocStatus: normalizeCocStatus(doc.coc_status),
              cocNumber: doc.coc_number || '',
              cocIssueDate: doc.coc_issue_date || ''
            };
          }
        });
        if (Object.keys(initialCocData).length > 0) {
          setCocDataByDocument(prev => ({ ...prev, ...initialCocData }));
        }
      }
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

  const fetchCocValidations = async () => {
    if (!subsectionId) return;
    try {
      const { data, error } = await supabase
        .from('coc_validations')
        .select('*')
        .eq('subsection_id', subsectionId);

      if (error) throw error;
      const validationsMap: Record<string, any> = {};
      data?.forEach(validation => {
        validationsMap[validation.document_id] = validation;
      });
      setCocValidations(validationsMap);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching COC validations:", error);
    }
  };

  const fetchCocExtractions = async () => {
    if (!subsectionId) return;
    try {
      const { data, error } = await supabase
        .from('coc_extractions')
        .select('*')
        .eq('subsection_id', subsectionId);

      if (error) throw error;

      const extractionsMap: Record<string, any> = {};
      const cocDataFromExtractions: Record<string, CocDocData> = {};

      data?.forEach(extraction => {
        extractionsMap[extraction.document_id] = extraction;

        if (extraction.extracted_data && typeof extraction.extracted_data === 'object') {
          const extractedData = extraction.extracted_data as Record<string, any>;
          const adminDetails = extractedData.administrativeDetails as Record<string, any> || {};

          const cocNumber = extractedData.cocNumber || adminDetails.cocNumber || '';
          const cocIssueDate = extractedData.cocIssueDate || adminDetails.cocIssueDate || '';
          const cocType = normalizeCocType(extractedData.cocType);
          const cocStatus = extractedData.overallStatus === 'Pass' ? 'Approved' :
                            extractedData.overallStatus === 'Fail' ? 'Failed' :
                            normalizeCocStatus(extractedData.cocStatus);

          if (cocNumber || cocIssueDate || cocType || cocStatus) {
            cocDataFromExtractions[extraction.document_id] = {
              cocNumber,
              cocIssueDate,
              cocType,
              cocStatus
            };
          }
        }
      });

      setCocExtractions(extractionsMap);

      if (Object.keys(cocDataFromExtractions).length > 0) {
        setCocDataByDocument(prev => {
          const merged = { ...prev };
          Object.entries(cocDataFromExtractions).forEach(([docId, extractionCocData]) => {
            const existing = (prev[docId] || {}) as Partial<CocDocData>;
            merged[docId] = {
              cocNumber: existing.cocNumber || extractionCocData.cocNumber || '',
              cocIssueDate: existing.cocIssueDate || extractionCocData.cocIssueDate || '',
              cocType: existing.cocType || extractionCocData.cocType || '',
              cocStatus: existing.cocStatus || extractionCocData.cocStatus || ''
            };
          });
          return merged;
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error fetching COC extractions:", error);
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

      const inspectionsObj: Record<string, any> = {};
      inspectionsData?.forEach(inspection => {
        inspectionsObj[inspection.id] = {
          templateId: inspection.template_id,
          date: inspection.inspection_date,
          status: inspection.status,
          priority: inspection.priority,
          title: inspection.title,
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
        meterSerialNumber: fullSubsection.meter_serial_number,
        meteringStatus: fullSubsection.metering_status,
        ctRatio: fullSubsection.ct_ratio,
        isCocRequired: fullSubsection.is_coc_required ?? true,
        inspections: inspectionsObj
      });

      if (fullSubsection.coc_type || fullSubsection.coc_status) {
        setCocDataByDocument(prev => ({
          ...prev,
          'subsection-default': {
            cocType: fullSubsection.coc_type || '',
            cocStatus: fullSubsection.coc_status || '',
            cocNumber: fullSubsection.coc_number || '',
            cocIssueDate: fullSubsection.coc_issue_date || ''
          }
        }));
      }

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
        await fetchCocExtractions();
        await fetchCocValidations();
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

  const generateQRCode = async () => {
    setQrCodeUrl('generated');
  };

  // ─── Handlers: COC Validation & Extraction ─────────────────────

  const handleManualValidation = async (documentId: string, documentUrl: string) => {
    try {
      setValidatingDocId(documentId);
      toast.info("Starting AI validation...");

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to validate documents');
        setValidatingDocId(null);
        return;
      }

      const { data: validationData, error: validationError } = await supabase.functions.invoke('validate-coc', {
        body: { documentId, documentUrl, subsectionId }
      });

      if (validationError) {
        if (process.env.NODE_ENV === 'development') console.error('Validation error:', validationError);
        toast.error(`Validation failed: ${validationError.message || 'Unknown error'}`);
        return;
      }

      if (validationData?.error) {
        if (process.env.NODE_ENV === 'development') console.error('Function returned error:', validationData.error);
        toast.error(`Validation error: ${validationData.error}`);
        return;
      }

      if (validationData?.success || validationData?.status) {
        const result = validationData.report || validationData;

        let cocNumberExtracted = result.cocNumber || result.administrativeDetails?.cocNumber;
        let cocIssueDateExtracted = result.administrativeDetails?.cocIssueDate || result.cocIssueDate;

        if (!cocIssueDateExtracted) {
          cocIssueDateExtracted = result.administrativeDetails?.registrationDate || result.installationDate || result.testDate || result.evaluationDate;
        }

        const isValidDate = (dateStr: string | null | undefined) => {
          if (!dateStr) return false;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
          const date = new Date(dateStr);
          return date instanceof Date && !isNaN(date.getTime());
        };

        const isValidCocNumber = (cocNum: string | null | undefined) => {
          if (!cocNum) return false;
          if (cocNum.toLowerCase().includes('not provided') ||
              cocNum.toLowerCase().includes('not found') ||
              cocNum.toLowerCase().includes('n/a')) return false;
          return cocNum.trim().length > 0;
        };

        const updateData: any = {};
        if (isValidCocNumber(cocNumberExtracted)) updateData.coc_number = cocNumberExtracted;
        if (isValidDate(cocIssueDateExtracted)) updateData.coc_issue_date = cocIssueDateExtracted;
        if (result.overallStatus === 'Pass' || result.status === 'Pass') updateData.coc_status = 'Approved';
        else if (result.overallStatus === 'Fail' || result.status === 'Fail') updateData.coc_status = 'Failed';

        if (Object.keys(updateData).length > 0) {
          try {
            const { error: updateError } = await supabase
              .from('subsections')
              .update(updateData)
              .eq('id', subsectionId);

            if (updateError) {
              if (process.env.NODE_ENV === 'development') console.error('Error auto-updating COC fields:', updateError);
            } else {
              if (subsection) {
                setSubsection({
                  ...subsection,
                  cocNumber: cocNumberExtracted || subsection.cocNumber,
                  cocIssueDate: cocIssueDateExtracted || subsection.cocIssueDate,
                  cocStatus: updateData.coc_status || subsection.cocStatus
                });
              }
            }
          } catch (error) {
            if (process.env.NODE_ENV === 'development') console.error('Error during auto-population:', error);
          }
        }

        try {
          const cocCategory = documentCategories.find(cat =>
            cat.name.toLowerCase().includes('coc') || cat.name === '01 COC'
          );
          if (cocCategory) {
            const reportContent = JSON.stringify(result, null, 2);
            const reportBlob = new Blob([reportContent], { type: 'application/json' });
            const reportFileName = `Validation_Report_${cocNumberExtracted || 'Unknown'}_${new Date().toISOString().split('T')[0]}.json`;
            const reportPath = `${subsectionId}/${cocCategory.name}/${Date.now()}-${reportFileName}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('documents')
              .upload(reportPath, reportBlob, { contentType: 'application/json', upsert: false });
            if (!uploadError && uploadData) {
              const { data: urlData } = supabase.storage.from('documents').getPublicUrl(reportPath);
              await supabase.from('subsection_documents').insert({
                subsection_id: subsectionId,
                category_id: cocCategory.id,
                file_name: reportFileName,
                file_url: urlData.publicUrl,
                uploaded_by: session.user.id
              });
            }
          }
        } catch (docError) {
          if (process.env.NODE_ENV === 'development') console.error('Error creating validation report document:', docError);
        }

        if (result.overallStatus === 'Pass' || result.status === 'Pass') {
          toast.success('COC validation passed! Report saved to documents.' + (cocNumberExtracted ? ` COC #${cocNumberExtracted} extracted.` : ''));
        } else if (result.overallStatus === 'Fail' || result.status === 'Fail') {
          toast.error(`COC validation failed: ${result.criticalFailures?.length || result.violations?.length || 0} violations found. Report saved to documents.`);
        } else {
          toast.warning(`COC validation incomplete. Report saved to documents.`);
        }

        await Promise.all([
          fetchCocValidations(),
          fetchSubsectionData(),
          fetchSupabaseDocuments()
        ]);
      } else {
        toast.error('No validation result returned');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error during manual validation:', error);
      toast.error(`Failed to validate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setValidatingDocId(null);
    }
  };

  const handleExtractCocData = async (documentId: string, documentUrl: string, fileName: string, forceReextract = false) => {
    try {
      setValidatingDocId(documentId);
      if (forceReextract) setReExtractingDocId(documentId);
      toast.info(forceReextract ? "Re-extracting COC information..." : "Extracting COC information...");

      let signedUrl = documentUrl;
      if (documentUrl.includes('/storage/v1/object/')) {
        const urlParts = documentUrl.split('/documents/');
        if (urlParts.length === 2) {
          const filePath = decodeURIComponent(urlParts[1]);
          const { data: signedData, error: signError } = await supabase.storage
            .from('documents')
            .createSignedUrl(filePath, 3600);
          if (signError) {
            if (process.env.NODE_ENV === 'development') console.error('Error creating signed URL:', signError);
            toast.error('Failed to access document');
            return;
          }
          signedUrl = signedData.signedUrl;
        }
      }

      const { data: { user } } = await supabase.auth.getUser();

      const { data: extractionData, error: extractionError } = await supabase.functions.invoke('extract-coc', {
        body: { documentUrl: signedUrl, fileName, documentId, subsectionId, forceReextract, userId: user?.id }
      });

      if (extractionError) {
        if (process.env.NODE_ENV === 'development') console.error('Extraction error:', extractionError);
        toast.error(`Failed to extract COC data: ${extractionError.message || 'Unknown error'}`);
        return;
      }

      if (extractionData?.error) {
        if (process.env.NODE_ENV === 'development') console.error('Function returned error:', extractionData.error);
        toast.error(`Extraction error: ${extractionData.error}`);
        return;
      }

      if (extractionData?.extractedData) {
        if (extractionData.extractionId) {
          setCocExtractions(prev => ({
            ...prev,
            [documentId]: {
              id: extractionData.extractionId,
              document_id: documentId,
              subsection_id: subsectionId,
              extracted_data: extractionData.extractedData,
              confidence: extractionData.extractedData.confidence || 'medium',
              extraction_method: extractionData.model,
              extracted_at: new Date().toISOString()
            }
          }));
        }

        setCocPreviewData(extractionData.extractedData);
        setShowCocPreview(true);
        setPendingDocumentForVerification({ id: documentId, url: signedUrl, name: fileName });

        if (extractionData.cached) {
          toast.success('Loaded cached extraction. Review and update if needed.');
        } else {
          toast.success('COC information extracted! Please review before verification.');
        }
      } else {
        toast.error('No data could be extracted from the document');
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error during COC extraction:', error);
      toast.error(`Failed to extract: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setValidatingDocId(null);
      setReExtractingDocId(null);
    }
  };

  const handleEditExtraction = async (documentId: string, documentUrl: string, fileName: string) => {
    const existingExtraction = cocExtractions[documentId];

    if (existingExtraction?.extracted_data) {
      const extractedData = existingExtraction.extracted_data;

      const cocNumber = extractedData.cocNumber || extractedData.administrativeDetails?.cocNumber || '';
      const cocIssueDate = extractedData.cocIssueDate || extractedData.administrativeDetails?.cocIssueDate || '';
      const cocType = normalizeCocType(extractedData.cocType);
      const cocStatus = extractedData.overallStatus === 'Pass' ? 'Approved' :
                        extractedData.overallStatus === 'Fail' ? 'Failed' :
                        normalizeCocStatus(extractedData.cocStatus);

      setCocDataByDocument(prev => ({
        ...prev,
        [documentId]: {
          ...prev[documentId],
          cocNumber: cocNumber || prev[documentId]?.cocNumber || '',
          cocIssueDate: cocIssueDate || prev[documentId]?.cocIssueDate || '',
          cocType: cocType || prev[documentId]?.cocType || '',
          cocStatus: cocStatus || prev[documentId]?.cocStatus || ''
        }
      }));

      const docUpdateData: Record<string, string> = {};
      if (cocNumber) docUpdateData.coc_number = cocNumber;
      if (cocIssueDate) docUpdateData.coc_issue_date = cocIssueDate;
      if (cocType) docUpdateData.coc_type = cocType;
      if (cocStatus) docUpdateData.coc_status = cocStatus;

      if (Object.keys(docUpdateData).length > 0) {
        await supabase.from('subsection_documents').update(docUpdateData).eq('id', documentId);
        toast.success('COC fields auto-populated from extraction data');
      }

      setCocPreviewData(extractedData);
      setShowCocPreview(true);

      let signedUrl = documentUrl;
      if (documentUrl.includes('/storage/v1/object/')) {
        const urlParts = documentUrl.split('/documents/');
        if (urlParts.length === 2) {
          const filePath = decodeURIComponent(urlParts[1]);
          const { data: signedData, error: signError } = await supabase.storage
            .from('documents')
            .createSignedUrl(filePath, 3600);
          if (!signError && signedData) signedUrl = signedData.signedUrl;
        }
      }

      setPendingDocumentForVerification({ id: documentId, url: signedUrl, name: fileName });
    } else {
      handleExtractCocData(documentId, documentUrl, fileName, false);
    }
  };

  const handleApproveAndVerify = async (approvedData: any) => {
    if (!pendingDocumentForVerification) {
      toast.error('No document pending verification');
      return;
    }

    const docId = pendingDocumentForVerification.id;

    try {
      setValidatingDocId(docId);
      setShowCocPreview(false);
      toast.info("Starting SANS 10142-1 verification...");

      const normalizedCocType = normalizeCocType(approvedData.cocType);

      const subsectionUpdateData: any = {};
      if (approvedData.cocNumber) subsectionUpdateData.coc_number = approvedData.cocNumber;
      if (normalizedCocType) subsectionUpdateData.coc_type = normalizedCocType;
      if (approvedData.cocIssueDate) subsectionUpdateData.coc_issue_date = approvedData.cocIssueDate;

      if (Object.keys(subsectionUpdateData).length > 0) {
        await supabase.from('subsections').update(subsectionUpdateData).eq('id', subsectionId);
      }

      const docUpdateData: any = {};
      if (approvedData.cocNumber) docUpdateData.coc_number = approvedData.cocNumber;
      if (normalizedCocType) docUpdateData.coc_type = normalizedCocType;
      if (approvedData.cocIssueDate) docUpdateData.coc_issue_date = approvedData.cocIssueDate;

      if (Object.keys(docUpdateData).length > 0) {
        await supabase.from('subsection_documents').update(docUpdateData).eq('id', docId);
      }

      setCocDataByDocument(prev => ({
        ...prev,
        [docId]: {
          cocNumber: approvedData.cocNumber || '',
          cocType: normalizedCocType || '',
          cocIssueDate: approvedData.cocIssueDate || '',
          cocStatus: prev[docId]?.cocStatus || ''
        }
      }));

      const { data: validationData, error: validationError } = await supabase.functions.invoke('validate-coc', {
        body: {
          documentId: docId,
          documentUrl: pendingDocumentForVerification.url,
          subsectionId,
          approvedCocType: normalizedCocType
        }
      });

      if (validationError || validationData?.error) {
        toast.error(`Verification failed: ${validationError?.message || validationData?.error || 'Unknown error'}`);
        return;
      }

      if (validationData?.success || validationData?.status) {
        const result = validationData.report || validationData;
        const status = validationData.status || result.overallStatus;

        let docCocStatus = '';
        if (status === 'Pass') {
          docCocStatus = 'Approved';
          toast.success('COC verification passed!');
        } else if (status === 'Fail') {
          docCocStatus = 'Failed';
          toast.error(`COC verification failed: ${validationData.violations?.length || result.criticalFailures?.length || 0} violations found`);
        } else {
          toast.warning(`COC verification incomplete`);
        }

        const cocNumber = approvedData.cocNumber || result.cocNumber || result.administrativeDetails?.cocNumber || '';
        const cocIssueDate = approvedData.cocIssueDate || result.cocIssueDate || result.administrativeDetails?.cocIssueDate || '';
        const cocType = normalizeCocType(approvedData.cocType);

        const updateData: Record<string, string> = {};
        if (docCocStatus) updateData.coc_status = docCocStatus;
        if (cocNumber) updateData.coc_number = cocNumber;
        if (cocIssueDate) updateData.coc_issue_date = cocIssueDate;
        if (cocType) updateData.coc_type = cocType;

        if (Object.keys(updateData).length > 0) {
          await supabase.from('subsection_documents').update(updateData).eq('id', docId);
          setCocDataByDocument(prev => ({
            ...prev,
            [docId]: {
              ...prev[docId],
              cocNumber: cocNumber || prev[docId]?.cocNumber || '',
              cocIssueDate: cocIssueDate || prev[docId]?.cocIssueDate || '',
              cocType: cocType || prev[docId]?.cocType || '',
              cocStatus: docCocStatus || prev[docId]?.cocStatus || ''
            }
          }));
        }

        await fetchCocValidations();
        await new Promise(resolve => setTimeout(resolve, 200));
        await fetchSupabaseDocuments();
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Error during verification:', error);
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
        supabase.from('coc_validations').delete().eq('subsection_id', subsectionId),
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

  const handleSaveCocDetails = async (documentId: string) => {
    if (!subsection) return;
    const docData = cocDataByDocument[documentId];
    if (!docData) { toast.error("No data to save for this document"); return; }

    try {
      setSaving(true);
      const updateData: any = {
        coc_type: docData.cocType,
        coc_status: docData.cocStatus,
        coc_number: docData.cocNumber || null,
        coc_issue_date: docData.cocIssueDate || null
      };

      const { error: updateError } = await supabase
        .from('subsection_documents')
        .update(updateData)
        .eq('id', documentId);

      if (updateError) {
        if (process.env.NODE_ENV === 'development') console.error("Error updating document COC details:", updateError);
        throw updateError;
      }

      setSubsection({
        ...subsection,
        cocType: docData.cocType,
        cocStatus: docData.cocStatus,
        cocNumber: docData.cocNumber || subsection.cocNumber,
        cocIssueDate: docData.cocIssueDate || subsection.cocIssueDate
      });

      const { error: subsectionError } = await supabase
        .from('subsections')
        .update(updateData)
        .eq('id', subsectionId);

      if (subsectionError) {
        if (process.env.NODE_ENV === 'development') console.error("Error updating subsection COC details:", subsectionError);
      }

      toast.success("COC details saved successfully");
      await fetchSupabaseDocuments();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error("Error saving COC details:", error);
      toast.error("Failed to save COC details");
    } finally {
      setSaving(false);
    }
  };

  const getDocCocData = (docId: string): CocDocData => {
    if (!cocDataByDocument[docId]) {
      const doc = supabaseDocuments.find(d => d.id === docId);
      if (doc && (doc.coc_number || doc.coc_issue_date || doc.coc_type || doc.coc_status)) {
        return {
          cocType: normalizeCocType(doc.coc_type),
          cocStatus: normalizeCocStatus(doc.coc_status),
          cocNumber: doc.coc_number || '',
          cocIssueDate: doc.coc_issue_date || ''
        };
      }
      return {
        cocType: normalizeCocType(subsection?.cocType),
        cocStatus: normalizeCocStatus(subsection?.cocStatus),
        cocNumber: subsection?.cocNumber || '',
        cocIssueDate: subsection?.cocIssueDate || ''
      };
    }
    return cocDataByDocument[docId];
  };

  const updateDocCocData = (docId: string, field: string, value: string) => {
    setCocDataByDocument(prev => ({
      ...prev,
      [docId]: {
        ...getDocCocData(docId),
        [field]: value
      }
    }));
  };

  const getCocDocuments = () => getSupabaseCocDocuments();

  const getSupabaseCocDocuments = () => {
    const cocCategory = documentCategories.find(cat => cat.name.toLowerCase().includes('coc'));
    if (!cocCategory) return [];
    return supabaseDocuments.filter(doc => doc.category_id === cocCategory.id);
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
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
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

    // COC data
    cocDataByDocument,
    cocValidations,
    cocExtractions,
    cocPreviewData,
    showCocPreview,
    setShowCocPreview,
    pendingDocumentForVerification,
    cocPreviewDoc,
    setCocPreviewDoc,
    cocPreviewDialogOpen,
    setCocPreviewDialogOpen,
    validatingDocId,
    reExtractingDocId,
    selectedValidation,
    selectedValidationDocId,
    setSelectedValidationDocId,
    validationReportOpen,
    setValidationReportOpen,
    getDocCocData,
    updateDocCocData,
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
    handleManualValidation,
    handleExtractCocData,
    handleEditExtraction,
    handleApproveAndVerify,
    handleRejectPreview,
    handleOpenEditDialog,
    handleCreateSubsection,
    handleSaveEdit,
    handleDeleteSubsection,
    handleSaveMeteringDetails,
    handleSaveCocDetails,
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
    fetchCocValidations,
  };
}
