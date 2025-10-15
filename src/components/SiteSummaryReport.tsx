import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
    // Card background
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, width, height, 2, 2, 'F');
    
    // Title
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.setFont(undefined, 'normal');
    doc.text(title, x + width / 2, y + 10, { align: 'center', maxWidth: width - 4 });
    
    // Circular progress - fully filled circle
    const centerX = x + width / 2;
    const centerY = y + 28;
    const radius = 12;
    
    // Fill the entire circle with color
    doc.setFillColor(colorR, colorG, colorB);
    doc.circle(centerX, centerY, radius, 'F');
    
    // Percentage text (white on colored circle)
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text(`${percentage}%`, centerX, centerY + 3, { align: 'center' });
    
    // Subtitle
    if (subtitle) {
      doc.setFontSize(7);
      doc.setTextColor(100, 100, 100);
      doc.setFont(undefined, 'normal');
      const lines = doc.splitTextToSize(subtitle, width - 4);
      doc.text(lines, x + width / 2, y + height - 8, { align: 'center' });
    }
  };

  const drawArc = (
    doc: jsPDF,
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ) => {
    const startRad = (startAngle - 90) * (Math.PI / 180);
    const endRad = (endAngle - 90) * (Math.PI / 180);
    const steps = 30;
    
    for (let i = 0; i <= steps; i++) {
      const angle = startRad + (endRad - startRad) * (i / steps);
      const nextAngle = startRad + (endRad - startRad) * ((i + 1) / steps);
      
      const x1 = x + radius * Math.cos(angle);
      const y1 = y + radius * Math.sin(angle);
      const x2 = x + radius * Math.cos(nextAngle);
      const y2 = y + radius * Math.sin(nextAngle);
      
      doc.triangle(x, y, x1, y1, x2, y2, 'F');
    }
  };

  const generateReport = async () => {
    try {
      setGenerating(true);
      toast.info("Generating site summary report...");

      // Fetch all necessary data
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
      const cocCompliant = subsections.filter(s => s.coc_status === 'Approved' || s.coc_status === 'Valid').length;
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
      
      // Draw 4 health metric cards
      const cardWidth = 42;
      const cardHeight = 50;
      const cardSpacing = 5;
      const startX = 15;
      let cardY = 40;
      
      drawHealthCard(doc, startX, cardY, cardWidth, cardHeight, "OVERALL HEALTH", overallHealth, "", 220, 53, 69);
      drawHealthCard(doc, startX + cardWidth + cardSpacing, cardY, cardWidth, cardHeight, "COC COMPLIANCE", cocCompliance, `${cocCompliant} of ${cocRequired} required`, 255, 193, 7);
      drawHealthCard(doc, startX + (cardWidth + cardSpacing) * 2, cardY, cardWidth, cardHeight, "METERING DATA", meteringData, `${meteringInstalled} of ${subsections.length} required`, 220, 53, 69);
      drawHealthCard(doc, startX + (cardWidth + cardSpacing) * 3, cardY, cardWidth, cardHeight, "SNAGGED ITEMS", snagsPercentage, `${subsectionsWithSnags.size} of ${subsections.length} subsections`, 220, 53, 69);
      
      // Health by Category section
      cardY = 110;
      doc.setTextColor(63, 81, 181);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text("Health by Category", 20, cardY);
      doc.setDrawColor(63, 81, 181);
      doc.line(20, cardY + 3, pageWidth - 20, cardY + 3);
      
      cardY = 125;
      
      // Group by category
      const categoryGroups = subsections.reduce((acc, sub) => {
        const cat = sub.category || 'Uncategorized';
        if (!acc[cat]) acc[cat] = { total: 0, compliant: 0 };
        acc[cat].total++;
        if (sub.is_compliant) acc[cat].compliant++;
        return acc;
      }, {} as Record<string, { total: number; compliant: number }>);
      
      // Abbreviate category names
      const categoryAbbreviations: Record<string, string> = {
        'Commercial Activity': 'CA',
        'Electrical Equipment': 'EE',
        'Line Shop': 'LS',
        'Lightning Protection': 'LP',
        'Generator': 'GEN',
        'Transformer': 'TRANS'
      };
      
      const categories = Object.keys(categoryGroups).slice(0, 3);
      categories.forEach((cat, idx) => {
        const data = categoryGroups[cat];
        const percentage = Math.round((data.compliant / data.total) * 100) || 0;
        const xPos = startX + (cardWidth + cardSpacing) * idx;
        const abbrev = categoryAbbreviations[cat] || cat.substring(0, 3).toUpperCase();
        drawHealthCard(doc, xPos, cardY, cardWidth, cardHeight, abbrev, percentage, `${data.compliant} of ${data.total} compliant`, 220, 53, 69);
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
        
        // First subsection on page
        renderSubsectionCard(doc, subsections[i], 15, allInspections, subsectionDocuments);
        
        // Second subsection on page (if exists)
        if (i + 1 < subsections.length) {
          renderSubsectionCard(doc, subsections[i + 1], 140, allInspections, subsectionDocuments);
        }
        
        // Footer
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
        pageNumber++;
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
    subsectionDocuments: any[]
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    const cardHeight = 115;
    
    // Determine status color
    const isCompliant = subsection.is_compliant;
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
