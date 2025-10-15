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

  const generateReport = async () => {
    try {
      setGenerating(true);
      toast.info("Generating site summary report...");

      // Fetch all necessary data
      const [siteRes, subsectionsRes, inspectionsRes, docsRes, templatesRes] = await Promise.all([
        supabase.from("sites").select("*, clients(name)").eq("id", siteId).single(),
        supabase.from("subsections").select("*").eq("site_id", siteId).order("category", { ascending: true }),
        supabase.from("inspections").select("*").eq("site_id", siteId),
        supabase.from("site_documents").select("*").eq("site_id", siteId),
        supabase.from("inspection_templates").select("*")
      ]);

      if (siteRes.error) throw siteRes.error;
      
      const site = siteRes.data;
      const subsections = subsectionsRes.data || [];
      const allInspections = inspectionsRes.data || [];
      const siteDocuments = docsRes.data || [];
      const allTemplates = templatesRes.data || [];

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // ===== TITLE PAGE =====
      doc.setFillColor(41, 128, 185);
      doc.rect(0, 0, pageWidth, pageHeight, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(36);
      doc.setFont(undefined, 'bold');
      doc.text("Site Summary Report", pageWidth / 2, 80, { align: 'center' });
      
      doc.setFontSize(24);
      doc.setFont(undefined, 'normal');
      doc.text(clientName, pageWidth / 2, 110, { align: 'center' });
      doc.text(siteName, pageWidth / 2, 130, { align: 'center' });
      
      doc.setFontSize(14);
      const reportDate = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      doc.text(`Date of Report: ${reportDate}`, pageWidth / 2, 155, { align: 'center' });
      doc.text(`Total Subsections: ${subsections.length}`, pageWidth / 2, 170, { align: 'center' });

      // ===== OVERVIEW PAGE =====
      doc.addPage();
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(22);
      doc.setFont(undefined, 'bold');
      doc.text("Site Overview", 20, 25);
      
      // Site Details Section
      doc.setFontSize(16);
      doc.text("Site Details", 20, 40);
      
      doc.setFontSize(11);
      doc.setFont(undefined, 'normal');
      let yPos = 50;
      
      const siteDetails = [
        ['Client', clientName],
        ['Supply Authority', site.supply_authority || 'N/A'],
        ['Consultant Name', site.consultant_name || 'N/A'],
        ['Consultant Company', site.consultant_company || 'N/A'],
        ['Physical Address', site.address || 'N/A'],
        ['Total Subsections', subsections.length.toString()]
      ];

      autoTable(doc, {
        startY: yPos,
        head: [],
        body: siteDetails,
        theme: 'plain',
        styles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } }
      });

      // Site Documents Section
      yPos = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text("Site Documents", 20, yPos);
      
      // Group documents by category
      const docCategories = ['Layouts', 'Service Records', 'Earthing Report', 'Other'];
      const docCounts = docCategories.map(cat => {
        const count = siteDocuments.filter(d => d.category === cat).length;
        return [cat, count.toString()];
      });

      autoTable(doc, {
        startY: yPos + 5,
        head: [['Category', 'Count']],
        body: docCounts,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }
      });

      // ===== SUBSECTION DETAIL PAGES =====
      // Group subsections by category
      const groupedSubsections = subsections.reduce((acc, sub) => {
        const category = sub.category || 'Uncategorized';
        if (!acc[category]) acc[category] = [];
        acc[category].push(sub);
        return acc;
      }, {} as Record<string, typeof subsections>);

      let subsectionIndex = 0;
      
      for (const [category, categorySubsections] of Object.entries(groupedSubsections)) {
        for (let i = 0; i < categorySubsections.length; i += 2) {
          doc.addPage();
          
          // Category header
          doc.setFontSize(18);
          doc.setFont(undefined, 'bold');
          doc.setTextColor(41, 128, 185);
          doc.text(category, 20, 20);
          doc.setTextColor(0, 0, 0);
          
          // First subsection on page
          renderSubsectionCard(doc, categorySubsections[i], 30, allInspections, allTemplates);
          
          // Second subsection on page (if exists)
          if (i + 1 < categorySubsections.length) {
            renderSubsectionCard(doc, categorySubsections[i + 1], 155, allInspections, allTemplates);
          }
        }
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
    allTemplates: any[]
  ) => {
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Status header with color
    const isPass = subsection.is_compliant;
    doc.setFillColor(isPass ? 76 : 220, isPass ? 175 : 53, isPass ? 80 : 69);
    doc.rect(20, startY, pageWidth - 40, 10, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(`${subsection.name} - ${isPass ? 'PASS' : 'FAIL'}`, 25, startY + 7);
    
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    let yPos = startY + 15;
    
    // COC Details
    if (subsection.coc_number) {
      doc.setFont(undefined, 'bold');
      doc.text("COC:", 25, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(`${subsection.coc_number} (${subsection.coc_issue_date || 'N/A'})`, 45, yPos);
      yPos += 5;
    }
    
    // Metering
    doc.setFont(undefined, 'bold');
    doc.text("Metering:", 25, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(`Serial: ${subsection.meter_serial_number || 'N/A'}, CT: ${subsection.ct_ratio || 'N/A'}`, 50, yPos);
    yPos += 7;
    
    // Open Snags from latest inspection
    const subsectionInspections = allInspections
      .filter(i => i.subsection_id === subsection.id)
      .sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime());
    
    if (subsectionInspections.length > 0) {
      const latestInspection = subsectionInspections[0];
      const snags = extractSnags(latestInspection.json_data);
      
      if (snags.length > 0) {
        doc.setFont(undefined, 'bold');
        doc.text("Open Snags:", 25, yPos);
        yPos += 4;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(8);
        
        snags.slice(0, 3).forEach(snag => {
          const urgencyColor: [number, number, number] = snag.urgency === 'High' ? [220, 53, 69] : 
                               snag.urgency === 'Medium' ? [255, 193, 7] : [108, 117, 125];
          doc.setTextColor(urgencyColor[0], urgencyColor[1], urgencyColor[2]);
          doc.text(`• [${snag.urgency}] ${snag.description.substring(0, 50)}...`, 30, yPos);
          doc.setTextColor(0, 0, 0);
          yPos += 4;
        });
        
        doc.setFontSize(9);
        yPos += 2;
      }
    }
    
    // Inspections count
    doc.setFont(undefined, 'bold');
    doc.text("Inspections:", 25, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(`${subsectionInspections.length} recorded`, 55, yPos);
    yPos += 5;
    
    // Documents count (from subsection_documents table)
    doc.setFont(undefined, 'bold');
    doc.text("Documents:", 25, yPos);
    doc.setFont(undefined, 'normal');
    doc.text("Available in system", 55, yPos);
  };

  const extractSnags = (jsonData: any): Array<{ description: string; urgency: string }> => {
    if (!jsonData || typeof jsonData !== 'object') return [];
    
    const snags: Array<{ description: string; urgency: string }> = [];
    
    // Search through JSON structure for deficiencies/snags
    const searchForSnags = (obj: any) => {
      if (Array.isArray(obj)) {
        obj.forEach(item => searchForSnags(item));
      } else if (obj && typeof obj === 'object') {
        if (obj.status === 'Fail' || obj.status === 'Deficient') {
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
