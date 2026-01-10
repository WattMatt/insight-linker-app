import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eye, Loader2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCategoryAbbreviation } from "@/lib/subsectionCategories";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";

interface SiteSummaryReportProps {
  siteId: string;
  siteName: string;
  clientName: string;
}

export const SiteSummaryReport = ({ siteId, siteName, clientName }: SiteSummaryReportProps) => {
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewData, setPreviewData] = useState<{ url: string; blob: Blob; filename: string } | null>(null);

  const drawHealthCard = (
    doc: jsPDF,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    percentage: number,
    subtitle: string,
    colorR: number,
    colorG: number,
    colorB: number
  ) => {
    // Card background with subtle shadow
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(x + 0.5, y + 0.5, width, height, 3, 3, 'F');
    
    // Card border
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, width, height, 3, 3, 'S');
    
    // White card background
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, width, height, 3, 3, 'F');
    
    // Title
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.setFont(undefined, 'bold');
    doc.text(title, x + width / 2, y + 12, { align: 'center', maxWidth: width - 6 });
    
    // Progress ring
    const centerX = x + width / 2;
    const centerY = y + 33;
    const outerRadius = 14;
    const innerRadius = 11;
    
    // Background ring (light gray)
    doc.setFillColor(240, 240, 240);
    drawRing(doc, centerX, centerY, outerRadius, innerRadius, 0, 360);
    
    // Progress ring (colored)
    const progressAngle = (percentage / 100) * 360;
    doc.setFillColor(colorR, colorG, colorB);
    drawRing(doc, centerX, centerY, outerRadius, innerRadius, 0, progressAngle);
    
    // Center circle background
    doc.setFillColor(255, 255, 255);
    doc.circle(centerX, centerY, innerRadius - 1, 'F');
    
    // Percentage text
    doc.setFontSize(16);
    doc.setTextColor(colorR, colorG, colorB);
    doc.setFont(undefined, 'bold');
    doc.text(`${percentage}`, centerX, centerY + 2, { align: 'center' });
    
    // Percent symbol
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.setFont(undefined, 'normal');
    doc.text('%', centerX, centerY + 7, { align: 'center' });
    
    // Subtitle
    if (subtitle) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.setFont(undefined, 'normal');
      const lines = doc.splitTextToSize(subtitle, width - 6);
      doc.text(lines, x + width / 2, y + height - 8, { align: 'center' });
    }
  };

  const drawRing = (
    doc: jsPDF,
    x: number,
    y: number,
    outerRadius: number,
    innerRadius: number,
    startAngle: number,
    endAngle: number
  ) => {
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);
    const steps = Math.max(30, Math.ceil(Math.abs(endAngle - startAngle) / 3));
    
    for (let i = 0; i < steps; i++) {
      const angle1 = startRad + (endRad - startRad) * (i / steps);
      const angle2 = startRad + (endRad - startRad) * ((i + 1) / steps);
      
      const x1Out = x + outerRadius * Math.cos(angle1);
      const y1Out = y + outerRadius * Math.sin(angle1);
      const x2Out = x + outerRadius * Math.cos(angle2);
      const y2Out = y + outerRadius * Math.sin(angle2);
      
      const x1In = x + innerRadius * Math.cos(angle1);
      const y1In = y + innerRadius * Math.sin(angle1);
      const x2In = x + innerRadius * Math.cos(angle2);
      const y2In = y + innerRadius * Math.sin(angle2);
      
      doc.triangle(x1Out, y1Out, x2Out, y2Out, x1In, y1In, 'F');
      doc.triangle(x2Out, y2Out, x2In, y2In, x1In, y1In, 'F');
    }
  };

  // Helper functions for subsection compliance (simplified versions)
  const extractSnags = (jsonData: any): any[] => {
    if (!jsonData) return [];
    const snags: any[] = [];
    
    // Check for sections with snag items
    if (jsonData.sections) {
      jsonData.sections.forEach((section: any) => {
        if (section.items) {
          section.items.forEach((item: any) => {
            if (item.status === 'snag' || item.isSnag) {
              snags.push(item);
            }
          });
        }
      });
    }
    
    // Check for dedicated snags array
    if (jsonData.snags) {
      snags.push(...jsonData.snags);
    }
    
    return snags;
  };

  const calculateSubsectionCompliance = (
    subsection: any, 
    inspections: any[], 
    documents: any[]
  ): boolean => {
    // Has valid COC
    const hasCoc = subsection.coc_status === 'Approved' || 
                   subsection.coc_status === 'Valid' || 
                   subsection.coc_status === 'Pass';
    
    // Has at least one document
    const hasDocuments = documents.some(d => d.subsection_id === subsection.id);
    
    return hasCoc || hasDocuments || subsection.is_compliant;
  };

  const renderSubsectionCard = (
    doc: jsPDF,
    subsection: any,
    startY: number,
    inspections: any[],
    documents: any[],
    isCompliant: boolean
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const cardWidth = pageWidth - 30;
    const cardHeight = 110;
    
    // Card background
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(15, startY, cardWidth, cardHeight, 3, 3, 'F');
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.3);
    doc.roundedRect(15, startY, cardWidth, cardHeight, 3, 3, 'S');
    
    // Header bar
    const statusColor = isCompliant ? [46, 125, 50] : [244, 67, 54];
    doc.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    doc.roundedRect(15, startY, cardWidth, 12, 3, 3, 'F');
    doc.rect(15, startY + 6, cardWidth, 6, 'F');
    
    // Title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(subsection.name, 20, startY + 8);
    
    // Category badge
    if (subsection.category) {
      const abbrev = getCategoryAbbreviation(subsection.category);
      doc.setFontSize(8);
      doc.text(abbrev, pageWidth - 20, startY + 8, { align: 'right' });
    }
    
    // Content
    let yPos = startY + 22;
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    
    // COC Status
    doc.text('COC Status:', 20, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(subsection.coc_status || 'Not Set', 55, yPos);
    
    // Metering Status
    yPos += 8;
    doc.setFont(undefined, 'normal');
    doc.text('Metering:', 20, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(subsection.metering_status || 'Unknown', 55, yPos);
    
    // Meter Serial
    if (subsection.meter_serial_number) {
      yPos += 8;
      doc.setFont(undefined, 'normal');
      doc.text('Meter S/N:', 20, yPos);
      doc.setFont(undefined, 'bold');
      doc.text(subsection.meter_serial_number, 55, yPos);
    }
    
    // Tenant
    if (subsection.tenant_name) {
      yPos += 8;
      doc.setFont(undefined, 'normal');
      doc.text('Tenant:', 20, yPos);
      doc.setFont(undefined, 'bold');
      doc.text(subsection.tenant_name, 55, yPos);
    }
    
    // Document count
    const docCount = documents.filter(d => d.subsection_id === subsection.id).length;
    yPos += 8;
    doc.setFont(undefined, 'normal');
    doc.text('Documents:', 20, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(`${docCount} file${docCount !== 1 ? 's' : ''}`, 55, yPos);
    
    // Inspection count
    const inspCount = inspections.filter(i => i.subsection_id === subsection.id).length;
    yPos += 8;
    doc.setFont(undefined, 'normal');
    doc.text('Inspections:', 20, yPos);
    doc.setFont(undefined, 'bold');
    doc.text(`${inspCount} record${inspCount !== 1 ? 's' : ''}`, 55, yPos);
  };

  const generatePdfBlob = async (): Promise<{ blob: Blob; filename: string }> => {
    // Fetch all necessary data including COC validations
    const [siteRes, subsectionsRes, inspectionsRes, docsRes, subsectionDocsRes] = await Promise.all([
      supabase.from("sites").select("*, clients(name)").eq("id", siteId).single(),
      supabase.from("subsections").select("*").eq("site_id", siteId).order("category", { ascending: true }),
      supabase.from("inspections").select("*").eq("site_id", siteId),
      supabase.from("site_documents").select("*").eq("site_id", siteId),
      supabase.from("subsection_documents").select("subsection_id, file_name, category_id")
    ]);

    if (siteRes.error) throw siteRes.error;
    
    const site = siteRes.data;
    const subsections = subsectionsRes.data || [];
    const allInspections = inspectionsRes.data || [];
    const siteDocuments = docsRes.data || [];
    const subsectionDocuments = subsectionDocsRes.data || [];
    
    // Get COC validations for subsections on this site
    const subsectionIds = subsections.map(s => s.id);
    const cocValidationsQuery = await supabase
      .from("coc_validations")
      .select("*")
      .in("subsection_id", subsectionIds)
      .order("validated_at", { ascending: false });
    
    const cocValidations = cocValidationsQuery.data || [];

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // ===== TITLE PAGE =====
    // Dark header bar
    doc.setFillColor(44, 62, 80); // Dark blue-gray
    doc.rect(0, 0, pageWidth, 30, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text(clientName.toUpperCase(), pageWidth / 2, 20, { align: 'center' });
    
    // White background for rest
    doc.setFillColor(245, 245, 245);
    doc.rect(0, 30, pageWidth, pageHeight - 30, 'F');
    
    doc.setTextColor(33, 33, 33);
    doc.setFontSize(48);
    doc.setFont(undefined, 'bold');
    doc.text(siteName, pageWidth / 2, 120, { align: 'center' });
    
    doc.setFontSize(20);
    doc.setTextColor(128, 128, 128);
    doc.setFont(undefined, 'normal');
    doc.text("Site Summary Report", pageWidth / 2, 140, { align: 'center' });
    
    // Horizontal line
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(60, 160, pageWidth - 60, 160);
    
    // Info table
    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text("Date of Report", 70, 180);
    doc.setTextColor(33, 33, 33);
    const reportDate = new Date().toLocaleDateString('en-ZA').replace(/\//g, '/');
    doc.text(reportDate, pageWidth - 70, 180, { align: 'right' });
    
    doc.setTextColor(100, 100, 100);
    doc.text("Total Subsections", 70, 195);
    doc.setTextColor(33, 33, 33);
    doc.text(subsections.length.toString(), pageWidth - 70, 195, { align: 'right' });
    
    // Footer
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(`${siteName} - Site Summary Report`, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // ===== HEALTH OVERVIEW PAGE =====
    doc.addPage();
    doc.setFillColor(245, 245, 245);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    
    // Title with blue underline
    doc.setTextColor(63, 81, 181); // Blue
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text("Site Health Overview", 20, 25);
    doc.setDrawColor(63, 81, 181);
    doc.setLineWidth(1);
    doc.line(20, 28, pageWidth - 20, 28);
    
    // Calculate health metrics
    const cocRequired = subsections.filter(s => s.is_coc_required).length;
    const cocCompliant = subsections.filter(s => s.coc_status === 'Approved' || s.coc_status === 'Valid' || s.coc_status === 'Pass').length;
    const meteringInstalled = subsections.filter(s => s.metering_status === 'Installed' || s.meter_serial_number).length;
    const compliantCount = subsections.filter(s => calculateSubsectionCompliance(s, allInspections, subsectionDocuments)).length;
    
    // Extract all snags
    let totalSnags = 0;
    const subsectionsWithSnags = new Set<string>();
    allInspections.forEach(insp => {
      const snags = extractSnags(insp.json_data);
      if (snags.length > 0 && insp.subsection_id) {
        subsectionsWithSnags.add(insp.subsection_id);
        totalSnags += snags.length;
      }
    });
    
    const overallHealth = Math.round((compliantCount / subsections.length) * 100) || 0;
    const cocCompliance = cocRequired > 0 ? Math.round((cocCompliant / cocRequired) * 100) : 0;
    const meteringData = Math.round((meteringInstalled / subsections.length) * 100) || 0;
    const snagsPercentage = Math.round((subsectionsWithSnags.size / subsections.length) * 100) || 0;
    
    // Draw 4 health metric cards with improved styling
    const cardWidth = 46;
    const cardHeight = 58;
    const cardSpacing = 4;
    const startX = 12;
    let cardY = 45;
    
    // Use professional color scheme
    drawHealthCard(doc, startX, cardY, cardWidth, cardHeight, "OVERALL HEALTH", overallHealth, "", 46, 125, 50); // Green
    drawHealthCard(doc, startX + cardWidth + cardSpacing, cardY, cardWidth, cardHeight, "COC COMPLIANCE", cocCompliance, `${cocCompliant} of ${cocRequired} required`, 255, 152, 0); // Orange
    drawHealthCard(doc, startX + (cardWidth + cardSpacing) * 2, cardY, cardWidth, cardHeight, "METERING DATA", meteringData, `${meteringInstalled} of ${subsections.length} installed`, 33, 150, 243); // Blue
    drawHealthCard(doc, startX + (cardWidth + cardSpacing) * 3, cardY, cardWidth, cardHeight, "OPEN SNAGS", 100 - snagsPercentage, `${totalSnags} total snags`, 244, 67, 54); // Red
    
    // Health by Category section
    cardY = 118;
    doc.setTextColor(63, 81, 181);
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text("Health by Category", 20, cardY);
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.5);
    doc.line(20, cardY + 3, pageWidth - 20, cardY + 3);
    
    cardY = 133;
    
    // Group by category
    const categoryGroups = subsections.reduce((acc, sub) => {
      const cat = sub.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = { total: 0, compliant: 0 };
      acc[cat].total++;
      if (sub.is_compliant) acc[cat].compliant++;
      return acc;
    }, {} as Record<string, { total: number; compliant: number }>);
    
    // Abbreviate category names using our utility
    const categories = Object.keys(categoryGroups).slice(0, 4);
    categories.forEach((cat, idx) => {
      const data = categoryGroups[cat];
      const percentage = Math.round((data.compliant / data.total) * 100) || 0;
      const xPos = startX + (cardWidth + cardSpacing) * idx;
      const abbrev = getCategoryAbbreviation(cat);
      const color = percentage >= 80 ? [46, 125, 50] : percentage >= 60 ? [255, 152, 0] : [244, 67, 54];
      drawHealthCard(doc, xPos, cardY, cardWidth, cardHeight, abbrev, percentage, `${data.compliant}/${data.total} compliant`, color[0], color[1], color[2]);
    });
    
    // Footer
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("Page 1", pageWidth / 2, pageHeight - 10, { align: 'center' });

    // ===== SUBSECTION DETAIL PAGES =====
    let pageNumber = 2;
    
    for (let i = 0; i < subsections.length; i += 2) {
      doc.addPage();
      doc.setFillColor(245, 245, 245);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      // Calculate compliance for first subsection
      const isFirstCompliant = calculateSubsectionCompliance(subsections[i], allInspections, subsectionDocuments);
      renderSubsectionCard(doc, subsections[i], 15, allInspections, subsectionDocuments, isFirstCompliant);
      
      // Second subsection on page (if exists)
      if (i + 1 < subsections.length) {
        const isSecondCompliant = calculateSubsectionCompliance(subsections[i + 1], allInspections, subsectionDocuments);
        renderSubsectionCard(doc, subsections[i + 1], 140, allInspections, subsectionDocuments, isSecondCompliant);
      }
      
      // Footer
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      pageNumber++;
    }

    // ===== ANNEXES: COC VERIFICATION REPORTS =====
    if (cocValidations.length > 0) {
      // Add annexes divider page
      doc.addPage();
      doc.setFillColor(44, 62, 80);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(32);
      doc.setFont(undefined, 'bold');
      doc.text('ANNEXES', pageWidth / 2, pageHeight / 2 - 10, { align: 'center' });
      
      doc.setFontSize(16);
      doc.setFont(undefined, 'normal');
      doc.text('COC Verification Reports', pageWidth / 2, pageHeight / 2 + 10, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text(`${cocValidations.length} Report${cocValidations.length !== 1 ? 's' : ''}`, pageWidth / 2, pageHeight / 2 + 25, { align: 'center' });

      // Add each COC validation report as an annex (simplified for brevity)
      cocValidations.forEach((validation, annexIndex) => {
        const report = (validation.report_data || {}) as any;
        const status = report.overallStatus || report.status || validation.status;
        const annexNumber = annexIndex + 1;
        
        // Annex Cover Page
        doc.addPage();
        doc.setFillColor(63, 81, 181);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont(undefined, 'bold');
        doc.text(`ANNEX ${annexNumber}`, pageWidth / 2, 60, { align: 'center' });
        
        doc.setFontSize(20);
        doc.setFont(undefined, 'normal');
        doc.text('COC Verification Report', pageWidth / 2, 85, { align: 'center' });
        
        if (report.cocNumber) {
          doc.setFontSize(14);
          doc.text(`COC #${report.cocNumber}`, pageWidth / 2, 105, { align: 'center' });
        }
        
        doc.setFontSize(12);
        doc.text(`Validated: ${new Date(validation.validated_at).toLocaleDateString()}`, pageWidth / 2, 125, { align: 'center' });
        
        // Status Badge
        doc.setFontSize(28);
        doc.setFont(undefined, 'bold');
        const statusText = status?.toUpperCase() || 'UNKNOWN';
        let statusColor: [number, number, number] = [200, 200, 200];
        if (status?.toLowerCase() === 'pass') statusColor = [76, 175, 80];
        else if (status?.toLowerCase() === 'fail') statusColor = [220, 53, 69];
        doc.setTextColor(...statusColor);
        doc.text(statusText, pageWidth / 2, 155, { align: 'center' });
      });
    }

    // Generate blob
    const pdfBlob = doc.output('blob');
    const reportDateFormatted = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    const filename = `${siteName} - Site Summary Report - ${reportDateFormatted}.pdf`;
    
    return { blob: pdfBlob, filename };
  };

  const handlePreview = async () => {
    try {
      setGenerating(true);
      toast.info("Generating site summary report preview...");

      const { blob, filename } = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      setPreviewData({ url, blob, filename });
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Failed to generate preview');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!previewData) return;
    
    try {
      setSaving(true);
      
      const result = await savePDFToDocuments({
        blob: previewData.blob,
        fileName: previewData.filename,
        siteId,
        categoryName: getReportCategoryName("site-summary"),
      });

      if (result.success) {
        toast.success("Site summary report saved to documents!");
        setPreviewData(null);
      } else {
        toast.error(result.error || "Failed to save report");
      }
    } catch (error) {
      console.error('Error saving report:', error);
      toast.error('Failed to save report to documents');
    } finally {
      setSaving(false);
    }
  };

  const handleClosePreview = (open: boolean) => {
    if (!open && previewData) {
      URL.revokeObjectURL(previewData.url);
      setPreviewData(null);
    }
  };

  return (
    <>
      <Button 
        onClick={handlePreview} 
        disabled={generating}
        variant="outline"
        className="gap-2"
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
        {generating ? "Generating..." : "Preview Report"}
      </Button>

      {previewData && (
        <DocumentPreviewDialog
          open={!!previewData}
          onOpenChange={handleClosePreview}
          fileUrl={previewData.url}
          fileName={previewData.filename}
          onSaveToDocuments={handleSaveToDocuments}
          saveLocation="site"
          contextName={siteName}
          isSaving={saving}
        />
      )}
    </>
  );
};
