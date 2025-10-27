import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCategoryAbbreviation } from "@/lib/subsectionCategories";

interface SiteSummaryReportProps {
  siteId: string;
  siteName: string;
  clientName: string;
}

export const SiteSummaryReport = ({ siteId, siteName, clientName }: SiteSummaryReportProps) => {
  const [generating, setGenerating] = useState(false);

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

  const generateReport = async () => {
    try {
      setGenerating(true);
      toast.info("Generating site summary report...");

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
      const compliantCount = subsections.filter(s => s.is_compliant).length;
      
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

        // Add each COC validation report as an annex
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
          
          // Report Details Page
          doc.addPage();
          doc.setFillColor(245, 245, 245);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          
          let yPos = 20;
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(16);
          doc.setFont(undefined, 'bold');
          doc.text(`Annex ${annexNumber} - Verification Details`, 20, yPos);
          yPos += 10;
          
          // Summary
          if (report.installationSummary || report.overallAssessment) {
            doc.setFontSize(12);
            doc.setTextColor(63, 81, 181);
            doc.text('Summary', 20, yPos);
            yPos += 7;
            
            doc.setFontSize(9);
            doc.setTextColor(33, 33, 33);
            doc.setFont(undefined, 'normal');
            
            if (report.installationSummary) {
              const summaryLines = doc.splitTextToSize(report.installationSummary, pageWidth - 40);
              doc.text(summaryLines, 20, yPos);
              yPos += (summaryLines.length * 5) + 5;
            }
            
            if (report.overallAssessment) {
              const assessmentLines = doc.splitTextToSize(report.overallAssessment, pageWidth - 40);
              doc.text(assessmentLines, 20, yPos);
              yPos += (assessmentLines.length * 5) + 10;
            }
          }
          
          // Critical Failures
          if (report.criticalFailures && report.criticalFailures.length > 0) {
            if (yPos > 240) {
              doc.addPage();
              doc.setFillColor(245, 245, 245);
              doc.rect(0, 0, pageWidth, pageHeight, 'F');
              yPos = 20;
            }
            
            doc.setFontSize(12);
            doc.setTextColor(220, 53, 69);
            doc.setFont(undefined, 'bold');
            doc.text(`Critical Failures (${report.criticalFailures.length})`, 20, yPos);
            yPos += 7;
            
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            
            report.criticalFailures.slice(0, 5).forEach((failure: any, idx: number) => {
              if (yPos > 270) {
                doc.addPage();
                doc.setFillColor(245, 245, 245);
                doc.rect(0, 0, pageWidth, pageHeight, 'F');
                yPos = 20;
              }
              
              doc.setTextColor(220, 53, 69);
              doc.setFont(undefined, 'bold');
              doc.text(`${idx + 1}. ${failure.clause}`, 20, yPos);
              yPos += 5;
              
              doc.setTextColor(33, 33, 33);
              doc.setFont(undefined, 'normal');
              const desc = doc.splitTextToSize(failure.description, pageWidth - 40);
              doc.text(desc, 20, yPos);
              yPos += (desc.length * 4) + 5;
            });
            
            if (report.criticalFailures.length > 5) {
              doc.setTextColor(100, 100, 100);
              doc.setFont(undefined, 'italic');
              doc.text(`... and ${report.criticalFailures.length - 5} more failures`, 20, yPos);
              yPos += 7;
            }
          }
          
          // Recommendations
          if (report.recommendations && report.recommendations.length > 0) {
            if (yPos > 240) {
              doc.addPage();
              doc.setFillColor(245, 245, 245);
              doc.rect(0, 0, pageWidth, pageHeight, 'F');
              yPos = 20;
            }
            
            doc.setFontSize(12);
            doc.setTextColor(63, 81, 181);
            doc.setFont(undefined, 'bold');
            doc.text('Recommendations', 20, yPos);
            yPos += 7;
            
            doc.setFontSize(8);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(33, 33, 33);
            
            report.recommendations.slice(0, 3).forEach((rec: string, idx: number) => {
              if (yPos > 270) {
                doc.addPage();
                doc.setFillColor(245, 245, 245);
                doc.rect(0, 0, pageWidth, pageHeight, 'F');
                yPos = 20;
              }
              
              const recLines = doc.splitTextToSize(`${idx + 1}. ${rec}`, pageWidth - 40);
              doc.text(recLines, 20, yPos);
              yPos += (recLines.length * 4) + 4;
            });
          }
          
          // Footer for annex pages
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text(`Annex ${annexNumber} - COC #${report.cocNumber || 'N/A'}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        });
      }

      doc.save(`${siteName}_Summary_Report.pdf`);
      toast.success("Site summary report generated successfully!");
    } catch (error) {
      console.error("Error generating report:", error);
      toast.error("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const renderSubsectionCard = (
    doc: jsPDF, 
    subsection: any, 
    startY: number,
    allInspections: any[],
    subsectionDocuments: any[],
    isCompliant: boolean
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const cardHeight = 115;
    
    // Determine status color based on calculated compliance
    const borderColor = isCompliant ? [76, 175, 80] : [220, 53, 69]; // Green or Red
    
    // Card border
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(2);
    doc.roundedRect(15, startY, pageWidth - 30, cardHeight, 3, 3, 'S');
    
    // White background
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(15, startY, pageWidth - 30, cardHeight, 3, 3, 'F');
    
    // Re-draw border
    doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.setLineWidth(2);
    doc.roundedRect(15, startY, pageWidth - 30, cardHeight, 3, 3, 'S');
    
    // Title (subsection name)
    doc.setFontSize(11);
    doc.setTextColor(33, 33, 33);
    doc.setFont(undefined, 'bold');
    doc.text(`${subsection.name} (${siteName})`, 20, startY + 10);
    
    // Status badge (Pass/Fail)
    const statusText = isCompliant ? 'PASS' : 'FAIL';
    const statusWidth = 20;
    const statusX = pageWidth - 35;
    
    doc.setFillColor(borderColor[0], borderColor[1], borderColor[2]);
    doc.roundedRect(statusX, startY + 5, statusWidth, 6, 1, 1, 'F');
    
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text(statusText, statusX + statusWidth / 2, startY + 9, { align: 'center' });
    
    let yPos = startY + 20;
    
    // Metering Details
    doc.setFontSize(10);
    doc.setTextColor(63, 81, 181);
    doc.setFont(undefined, 'bold');
    doc.text("Metering Details", 20, yPos);
    yPos += 5;
    
    doc.setFontSize(9);
    doc.setTextColor(33, 33, 33);
    doc.setFont(undefined, 'normal');
    
    autoTable(doc, {
      startY: yPos,
      margin: { left: 20, right: 20 },
      body: [
        ['Meter Serial Number:', subsection.meter_serial_number || 'N/A'],
        ['CT Ratio:', subsection.ct_ratio || 'N/A']
      ],
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 5;
    
    // COC Details
    doc.setFontSize(10);
    doc.setTextColor(63, 81, 181);
    doc.setFont(undefined, 'bold');
    doc.text("Certificate of Compliance", 20, yPos);
    yPos += 5;
    
    doc.setFontSize(9);
    doc.setTextColor(33, 33, 33);
    doc.setFont(undefined, 'normal');
    
    if (subsection.is_coc_required) {
      autoTable(doc, {
        startY: yPos,
        margin: { left: 20, right: 20 },
        body: [
          ['COC Number:', subsection.coc_number || 'N/A'],
          ['COC Type:', subsection.coc_type || 'N/A'],
          ['Issue Date:', subsection.coc_issue_date ? new Date(subsection.coc_issue_date).toLocaleDateString('en-ZA') : 'N/A'],
          ['Status:', subsection.coc_status || 'Missing']
        ],
        theme: 'plain',
        styles: { fontSize: 8, cellPadding: 1 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 5;
    } else {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("COC not required for this subsection.", 20, yPos);
      yPos += 6;
    }
    
    // Snag List (Blue heading)
    doc.setFontSize(10);
    doc.setTextColor(63, 81, 181);
    doc.setFont(undefined, 'bold');
    doc.text("Snag List", 20, yPos);
    yPos += 4;
    
    const subsectionInspections = allInspections.filter(i => i.subsection_id === subsection.id);
    const allSnags: any[] = [];
    subsectionInspections.forEach(insp => {
      allSnags.push(...extractSnags(insp.json_data));
    });
    
    if (allSnags.length > 0) {
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      allSnags.slice(0, 2).forEach((snag, idx) => {
        const color = snag.urgency === 'High' ? [220, 53, 69] : snag.urgency === 'Medium' ? [255, 193, 7] : [108, 117, 125];
        doc.setTextColor(color[0], color[1], color[2]);
        doc.setFont(undefined, 'bold');
        doc.text(`${snag.urgency}:`, 20, yPos);
        doc.setTextColor(33, 33, 33);
        doc.setFont(undefined, 'normal');
        const maxLength = 55;
        const description = snag.description.substring(0, maxLength) + (snag.description.length > maxLength ? '...' : '');
        doc.text(`${idx + 1}. ${description}`, 35, yPos);
        yPos += 4;
      });
    } else {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("No open snags.", 20, yPos);
      yPos += 4;
    }
    
    yPos += 2;
    
    // Inspection Reports
    doc.setFontSize(10);
    doc.setTextColor(63, 81, 181);
    doc.setFont(undefined, 'bold');
    doc.text("Inspection Reports", 20, yPos);
    yPos += 3;
    
    if (subsectionInspections.length > 0) {
      const inspectionRows = subsectionInspections.slice(0, 2).map(insp => [
        insp.title || 'Inspection',
        insp.inspection_date || 'N/A',
        insp.status || 'N/A'
      ]);
      
      autoTable(doc, {
        startY: yPos,
        margin: { left: 20, right: 20 },
        head: [['Report Type', 'Date', 'Status']],
        body: inspectionRows,
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1 },
        headStyles: { fillColor: [240, 240, 240], textColor: [33, 33, 33], fontStyle: 'bold' }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 5;
    }
    
    // Documents
    doc.setFontSize(10);
    doc.setTextColor(63, 81, 181);
    doc.setFont(undefined, 'bold');
    doc.text("Documents", 20, yPos);
    yPos += 4;
    
    const docs = subsectionDocuments.filter(d => d.subsection_id === subsection.id);
    
    if (docs.length > 0) {
      doc.setFontSize(8);
      doc.setTextColor(33, 33, 33);
      doc.setFont(undefined, 'normal');
      
      // Show full filenames with count
      const fileGroups: Record<string, number> = {};
      docs.forEach(d => {
        const fileName = d.file_name || 'Unknown';
        fileGroups[fileName] = (fileGroups[fileName] || 0) + 1;
      });
      
      // Display up to 3 files
      Object.entries(fileGroups).slice(0, 3).forEach(([fileName, count]) => {
        doc.text(`- ${fileName} (${count})`, 20, yPos);
        yPos += 4;
      });
      
      if (Object.keys(fileGroups).length > 3) {
        doc.setTextColor(100, 100, 100);
        doc.text(`... and ${Object.keys(fileGroups).length - 3} more files`, 20, yPos);
      }
    } else {
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      doc.text("No documents uploaded.", 20, yPos);
    }
  };

  const calculateSubsectionCompliance = (
    subsection: any,
    inspections: any[],
    documents: any[]
  ): boolean => {
    // Rule 1: If COC required, must be approved/valid/pass
    if (subsection.is_coc_required && 
        subsection.coc_status !== 'Approved' && 
        subsection.coc_status !== 'Valid' && 
        subsection.coc_status !== 'Pass') {
      return false;
    }

    // Rule 2: If COC required, metering must not be missing (unless meter serial exists)
    if (subsection.is_coc_required && 
        subsection.metering_status === 'Missing' && 
        !subsection.meter_serial_number) {
      return false;
    }

    // Rule 3: Must not have any open snags from latest inspection
    const subsectionInspections = inspections.filter(i => i.subsection_id === subsection.id);
    const allSnags: any[] = [];
    subsectionInspections.forEach(insp => {
      allSnags.push(...extractSnags(insp.json_data));
    });
    if (allSnags.length > 0) return false;

    return true;
  };

  const extractSnags = (jsonData: any): Array<{ description: string; urgency: string }> => {
    if (!jsonData || typeof jsonData !== 'object') return [];
    
    const snags: Array<{ description: string; urgency: string }> = [];
    
    const searchForSnags = (obj: any) => {
      if (Array.isArray(obj)) {
        obj.forEach(item => searchForSnags(item));
      } else if (obj && typeof obj === 'object') {
        if (obj.status === 'Fail' || obj.status === 'Deficient' || obj.status === 'Not Compliant') {
          snags.push({
            description: obj.notes || obj.description || obj.item_name || 'Issue detected',
            urgency: obj.urgency || obj.priority || 'Medium'
          });
        }
        Object.values(obj).forEach(value => searchForSnags(value));
      }
    };
    
    searchForSnags(jsonData);
    return snags;
  };

  return (
    <Button 
      onClick={generateReport} 
      disabled={generating}
      variant="outline"
      className="gap-2"
    >
      <FileText className="h-4 w-4" />
      {generating ? "Generating..." : "Generate Site Summary"}
    </Button>
  );
};
