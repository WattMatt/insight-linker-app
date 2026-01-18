/**
 * Inspection Report Generator
 * Generates comprehensive inspection reports as PDF
 * 
 * TEMPLATE GATEWAY INTEGRATION:
 * This generator uses fetchPDFTemplate to get its configuration from the database.
 * All styling, sections, and branding are controlled by the PDF Template Manager.
 */

import { supabase } from "@/integrations/supabase/client";
import { 
  generatePdfBlob, 
  createCoverPage, 
  createDataTable, 
  createSectionHeader,
  COLORS,
  DEFAULT_STYLES,
} from "@/lib/pdfMakeUtils";
import { fetchPDFTemplate } from "@/hooks/usePDFTemplateGateway";

type Content = any;
type TDocumentDefinitions = any;

// Helper to load image as data URL
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

interface GenerateAndSaveReportOptions {
  inspectionId: string;
  subsectionId: string;
  siteName: string;
  subsectionName: string;
  clientName?: string;
  templateId?: string | null;
  siteLogoUrl?: string | null;
}

interface GenerateReportResult {
  success: boolean;
  documentId?: string;
  fileName?: string;
  fileUrl?: string;
  error?: string;
}

interface SignatureData {
  id: string;
  signer_type: string;
  signer_name: string;
  signer_email: string | null;
  signature_data: string;
  signed_at: string;
}

/**
 * Generates a comprehensive inspection report PDF using pdfmake and saves it to the documents folder
 * Uses PDF Template Gateway for configuration
 */
export async function generateAndSaveInspectionReport(
  options: GenerateAndSaveReportOptions
): Promise<GenerateReportResult> {
  const { inspectionId, subsectionId, siteName, subsectionName, clientName, templateId, siteLogoUrl } = options;

  try {
    // ===== FETCH TEMPLATE CONFIGURATION =====
    const { customization, sections, accentColors } = await fetchPDFTemplate('inspection');
    
    console.log('[InspectionReport] Template Config Applied:', {
      coverTitle: customization.coverTitle,
      accentColor: customization.accentColor,
      enabledSections: sections.filter(s => s.enabled).map(s => s.id),
    });

    // Helper to check if section is enabled
    const isSectionEnabled = (sectionId: string): boolean => {
      const section = sections.find(s => s.id === sectionId);
      return section?.enabled ?? true;
    };

    const PDF_COLORS = {
      ...COLORS,
      primary: accentColors.primary,
    };

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: "User not authenticated" };
    }

    // Fetch inspection data
    const { data: inspection, error: inspectionError } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', inspectionId)
      .single();

    if (inspectionError || !inspection) {
      return { success: false, error: "Failed to fetch inspection data" };
    }

    // Fetch template if available
    const effectiveTemplateId = templateId || inspection.template_id;
    let template: any = null;
    if (effectiveTemplateId) {
      const { data: templateData } = await supabase
        .from('inspection_templates')
        .select('*')
        .eq('id', effectiveTemplateId)
        .maybeSingle();
      template = templateData;
    }

    if (!template) {
      return { success: false, error: "Cannot generate report without a template" };
    }

    // Get jsonData from inspection
    const jsonData: Record<string, any> = (inspection.json_data as Record<string, any>) || {};
    const generalInfo = jsonData.generalInfo || {};

    // Fetch snags for this subsection
    const { data: snagsData } = await supabase
      .from('snags')
      .select('*')
      .eq('subsection_id', subsectionId);
    const snags = snagsData || [];

    // Fetch signatures
    const { data: signaturesData } = await supabase
      .from('inspection_signatures')
      .select('*')
      .eq('inspection_id', inspectionId);
    const signatures = (signaturesData || []) as SignatureData[];

    // Fetch company logo
    let companyLogoDataUrl: string | null = null;
    try {
      const { data: settingsData } = await supabase
        .from('settings')
        .select('company_logo_url')
        .limit(1)
        .maybeSingle();
      
      if (settingsData?.company_logo_url) {
        companyLogoDataUrl = await loadImageAsDataUrl(settingsData.company_logo_url);
      }
    } catch (error) {
      console.error('Error fetching company logo:', error);
    }

    // Generate QR code
    let qrCodeDataUrl: string | null = null;
    try {
      const qrCodeUrl = `https://oltzgidkjxwsukvkomof.supabase.co/functions/v1/qr-redirect/${subsectionId}`;
      const QRCode = (await import('qrcode')).default;
      qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl, { width: 150, margin: 1 });
    } catch (error) {
      console.error('Error generating QR code:', error);
    }

    const date = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const getValue = (obj: any, key: string) => {
      if (!obj) return 'N/A';
      const val = obj[key];
      if (typeof val === 'object' && val?.value) return val.value;
      return val || 'N/A';
    };

    const inspector = getValue(generalInfo, 'inspectorName') || inspection.inspector_name || 'N/A';
    const project = getValue(generalInfo, 'projectName') || inspection.project_name || siteName;
    const location = getValue(generalInfo, 'location') || inspection.location || siteName;

    // Build document content
    const content: Content[] = [];

    // Cover page with template customization
    const coverPage = createCoverPage({
      title: customization.coverTitle || 'INSPECTION REPORT',
      subtitle: customization.coverSubtitle || `${siteName} - ${subsectionName}`,
      siteName,
      reportDate: customization.includeDate ? new Date() : undefined,
      organizationName: template?.cover_page?.company || 'Watson Mattheus',
      logoDataUrl: companyLogoDataUrl || undefined,
    });
    content.push(coverPage);

    // General Information page (inspection-details section)
    if (isSectionEnabled('inspection-details')) {
      content.push({ text: '', pageBreak: 'after' } as Content);
      content.push(createSectionHeader('General Information', 'primary'));
      
      const generalInfoTable = createDataTable(
        [],
        [
          ['PROJECT NAME:', getValue(generalInfo, 'projectName') || inspection.project_name || siteName],
          ['INSPECTOR NAME:', getValue(generalInfo, 'inspectorName') || inspection.inspector_name || 'N/A'],
          ['INSPECTION DATE:', getValue(generalInfo, 'date') || inspection.inspection_date || date],
          ['CLIENT REPRESENTATIVE:', getValue(generalInfo, 'clientRep') || inspection.client_rep || 'N/A'],
          ['CONSULTANT NAME:', getValue(generalInfo, 'consultant') || inspection.consultant || 'N/A'],
          ['CONTRACTOR NAME:', getValue(generalInfo, 'contractor') || inspection.contractor || 'N/A'],
          ['LOCATION:', getValue(generalInfo, 'location') || inspection.location || siteName],
        ]
      );
      content.push(generalInfoTable);
    }

    // Template-based sections (findings section)
    if (isSectionEnabled('findings') && template && template.sections) {
      const templateSections = Array.isArray(template.sections) ? template.sections : Object.values(template.sections);

      for (const section of templateSections) {
        const sectionData = section as any;
        const sectionId = String(sectionData.id ?? '');
        const items = Array.isArray(sectionData.items) ? sectionData.items : Object.values(sectionData.items || {});

        if (items.length === 0) continue;

        content.push({ text: '', pageBreak: 'before' } as Content);
        content.push(createSectionHeader((sectionData.name || sectionId).toUpperCase(), 'primary'));

        let itemNumber = 1;
        for (let i = 0; i < items.length; i++) {
          const itemInfo = items[i] as any;
          const itemId = String(itemInfo.id ?? i);
          const itemData = jsonData[sectionId]?.[itemId] || {};
          const photos = itemData.photos || [];
          const images = itemData.images || {};

          // Combine photos array and images object
          const allImages: string[] = [...photos];
          if (typeof images === 'object') {
            for (const img of Object.values(images)) {
              const imgObj = img as any;
              if (imgObj && (imgObj.url || imgObj.path)) {
                allImages.push(imgObj.url || imgObj.path);
              }
            }
          }

          const status = itemData.status || 'N/A';
          const statusColor = status === 'Pass' ? PDF_COLORS.success : 
                             status === 'Fail' ? PDF_COLORS.error : 
                             PDF_COLORS.textMuted;

          // Item card
          const itemContent: Content = {
            stack: [
              {
                columns: [
                  { text: `${itemNumber}. ${itemInfo.name || itemId}`, style: 'subheading', width: '*' },
                  { text: status, color: statusColor, bold: true, alignment: 'right', width: 'auto' }
                ],
                margin: [0, 10, 0, 5]
              } as Content
            ],
            margin: [0, 5, 0, 5]
          };

          // Add notes if present
          if (itemData.notes) {
            (itemContent.stack as Content[]).push({
              text: [{ text: 'Notes: ', bold: true }, itemData.notes],
              fontSize: 9,
              color: PDF_COLORS.textSecondary,
              margin: [0, 0, 0, 5]
            } as Content);
          }

          // Add images (photos section)
          if (isSectionEnabled('photos') && allImages.length > 0) {
            const imageColumns: Content[] = [];
            for (const imgUrl of allImages.slice(0, 4)) {
              try {
                const dataUrl = await loadImageAsDataUrl(imgUrl);
                if (dataUrl) {
                  imageColumns.push({
                    image: dataUrl,
                    width: 80,
                    height: 60,
                    margin: [0, 0, 5, 0]
                  } as Content);
                }
              } catch (error) {
                console.error('Error embedding image:', error);
              }
            }
            if (imageColumns.length > 0) {
              (itemContent.stack as Content[]).push({
                columns: imageColumns,
                margin: [0, 5, 0, 0]
              } as Content);
            }
          }

          content.push(itemContent);
          itemNumber++;
        }
      }
    }

    // Snags section
    if (snags && snags.length > 0) {
      content.push({ text: '', pageBreak: 'before' } as Content);
      content.push(createSectionHeader('SNAGS / ISSUES', 'secondary'));

      let snagNumber = 1;
      for (const snag of snags) {
        const statusColor = snag.status === 'Open' ? PDF_COLORS.error : PDF_COLORS.success;
        
        content.push({
          stack: [
            {
              columns: [
                { text: `${snagNumber}. ${snag.title}`, style: 'subheading', width: '*' },
                { 
                  text: snag.status, 
                  color: '#FFFFFF',
                  background: statusColor,
                  bold: true, 
                  alignment: 'center',
                  width: 60,
                  margin: [5, 2, 5, 2]
                }
              ],
              margin: [0, 10, 0, 5]
            } as Content,
            snag.risk_level ? { text: `Risk Level: ${snag.risk_level}`, fontSize: 9, margin: [0, 0, 0, 3] } as Content : null,
            snag.description ? { text: snag.description, fontSize: 9, color: PDF_COLORS.textSecondary } as Content : null,
          ].filter(Boolean) as Content[],
          margin: [0, 5, 0, 10]
        } as Content);
        
        snagNumber++;
      }
    }

    // Signatures section
    if (isSectionEnabled('signatures') && signatures.length > 0) {
      content.push({ text: '', pageBreak: 'before' } as Content);
      content.push(createSectionHeader('SIGN-OFF SIGNATURES', 'primary'));

      const signerTypeLabels: Record<string, string> = {
        'inspector': 'Inspector',
        'contractor': 'Contractor',
        'client': 'Client Representative',
        'witness': 'Witness'
      };

      const signatureColumns: Content[] = [];
      for (const sig of signatures) {
        const signedDate = new Date(sig.signed_at).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });

        signatureColumns.push({
          stack: [
            { text: signerTypeLabels[sig.signer_type] || sig.signer_type, bold: true, fontSize: 10 },
            sig.signature_data ? { image: sig.signature_data, width: 100, height: 40, margin: [0, 5, 0, 5] } as Content : { text: '[Signature]', italics: true, color: PDF_COLORS.textMuted } as Content,
            { text: sig.signer_name, fontSize: 9 },
            { text: `Signed: ${signedDate}`, fontSize: 8, color: PDF_COLORS.textMuted }
          ],
          width: '50%',
          margin: [0, 0, 10, 15]
        } as Content);
      }

      // Arrange signatures in 2-column layout
      for (let i = 0; i < signatureColumns.length; i += 2) {
        content.push({
          columns: signatureColumns.slice(i, i + 2),
          margin: [0, 10, 0, 0]
        } as Content);
      }
    }

    // Build document definition with template accent color
    const docDefinition: TDocumentDefinitions = {
      content,
      styles: {
        ...DEFAULT_STYLES,
        // Override with template accent color
        sectionHeader: {
          ...DEFAULT_STYLES.sectionHeader,
          color: accentColors.primary,
        },
      },
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 10,
      },
      pageMargins: [40, 40, 40, 60],
      footer: customization.includePageNumbers ? (currentPage: number, pageCount: number) => {
        if (currentPage === 1) return null;
        return {
          columns: [
            { text: 'Confidential', fontSize: 8, color: PDF_COLORS.textMuted, margin: [40, 0, 0, 0] },
            { text: `Page ${currentPage - 1} of ${pageCount - 1}`, fontSize: 8, alignment: 'center', color: PDF_COLORS.textMuted },
            { text: date, fontSize: 8, alignment: 'right', color: PDF_COLORS.textMuted, margin: [0, 0, 40, 0] }
          ],
          margin: [0, 20, 0, 0]
        };
      } : undefined
    };

    // Generate PDF blob
    const pdfBlob = await generatePdfBlob(docDefinition);

    // Create filename
    const sanitizedSite = siteName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const sanitizedSubsection = subsectionName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `${sanitizedSite}_${sanitizedSubsection}_Inspection_${dateStr}.pdf`;

    // Find or create "Inspection Reports" category
    const { data: categories } = await supabase
      .from("document_categories")
      .select("id, name")
      .eq("subsection_id", subsectionId);

    let categoryId = categories?.find(c => c.name === "Inspection Reports")?.id;

    if (!categoryId) {
      const { data: newCategory, error: categoryError } = await supabase
        .from("document_categories")
        .insert({
          name: "Inspection Reports",
          subsection_id: subsectionId,
          order_index: (categories?.length || 0) + 1
        })
        .select()
        .single();

      if (categoryError) {
        return { success: false, error: "Failed to create document category" };
      }
      categoryId = newCategory.id;
    }

    // Upload to storage
    const storagePath = `${subsectionId}/Inspection Reports/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      return { success: false, error: `Failed to upload report: ${uploadError.message}` };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(storagePath);

    // Check for existing document
    const { data: existingDoc } = await supabase
      .from('subsection_documents')
      .select('id')
      .eq('subsection_id', subsectionId)
      .eq('file_name', fileName)
      .maybeSingle();

    let docId: string;
    if (existingDoc) {
      await supabase
        .from('subsection_documents')
        .update({
          file_url: urlData.publicUrl,
          file_size: pdfBlob.size,
          uploaded_at: new Date().toISOString()
        })
        .eq('id', existingDoc.id);
      docId = existingDoc.id;
    } else {
      const { data: docData, error: docError } = await supabase
        .from('subsection_documents')
        .insert({
          subsection_id: subsectionId,
          category_id: categoryId,
          file_name: fileName,
          file_url: urlData.publicUrl,
          file_size: pdfBlob.size,
          uploaded_by: user.id
        })
        .select()
        .single();

      if (docError) {
        return { success: false, error: "Failed to save document record" };
      }
      docId = docData.id;
    }

    return {
      success: true,
      documentId: docId,
      fileName,
      fileUrl: urlData.publicUrl
    };

  } catch (error) {
    console.error("Error generating and saving report:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error occurred"
    };
  }
}
