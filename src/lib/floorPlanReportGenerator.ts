import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Pin {
  pin_number: number;
  pin_type: 'snag' | 'observation';
  status: 'open' | 'resolved';
  priority?: string;
  title?: string;
  notes?: string;
  photo_url?: string;
  assigned_contractor?: string;
  due_date?: string;
}

interface ReportData {
  projectName: string;
  siteName: string;
  subsectionName: string;
  floorPlanUrl: string;
  pins: Pin[];
  canvasDataUrl?: string; // Canvas with pins rendered on floor plan
}

export const generateFloorPlanReport = async (data: ReportData): Promise<jsPDF> => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  // Helper function to add page numbers
  const addPageNumber = (pageNum: number, totalPages: number) => {
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(
      `Page ${pageNum} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: "center" }
    );
  };

  // Cover Page
  doc.setFillColor(41, 128, 185);
  doc.rect(0, 0, pageWidth, 80, "F");
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(28);
  doc.text("Floor Plan Inspection Report", pageWidth / 2, 35, { align: "center" });
  
  doc.setFontSize(14);
  doc.text(data.projectName, pageWidth / 2, 50, { align: "center" });
  doc.text(data.siteName, pageWidth / 2, 60, { align: "center" });
  doc.text(data.subsectionName, pageWidth / 2, 70, { align: "center" });

  doc.setTextColor(0, 0, 0);
  yPos = 100;

  doc.setFontSize(12);
  doc.text(`Report Generated: ${new Date().toLocaleDateString()}`, margin, yPos);
  yPos += 10;
  doc.text(`Total Items: ${data.pins.length}`, margin, yPos);
  yPos += 10;

  const snags = data.pins.filter(p => p.pin_type === 'snag');
  const observations = data.pins.filter(p => p.pin_type === 'observation');
  const openSnags = snags.filter(p => p.status === 'open');
  const resolvedSnags = snags.filter(p => p.status === 'resolved');

  doc.text(`Snags: ${snags.length} (${openSnags.length} open, ${resolvedSnags.length} resolved)`, margin, yPos);
  yPos += 10;
  doc.text(`Observations: ${observations.length}`, margin, yPos);

  // Executive Summary Page
  doc.addPage();
  let pageNum = 2;
  
  doc.setFontSize(18);
  doc.text("Executive Summary", margin, margin + 5);
  yPos = margin + 15;

  // Priority breakdown for snags
  if (snags.length > 0) {
    doc.setFontSize(14);
    doc.text("Snags by Priority", margin, yPos);
    yPos += 10;

    const priorityCount = {
      critical: snags.filter(s => s.priority === 'critical').length,
      high: snags.filter(s => s.priority === 'high').length,
      medium: snags.filter(s => s.priority === 'medium').length,
      low: snags.filter(s => s.priority === 'low').length,
    };

    autoTable(doc, {
      startY: yPos,
      head: [['Priority', 'Count']],
      body: [
        ['Critical', priorityCount.critical.toString()],
        ['High', priorityCount.high.toString()],
        ['Medium', priorityCount.medium.toString()],
        ['Low', priorityCount.low.toString()],
      ],
      theme: 'grid',
      headStyles: { fillColor: [220, 53, 69] },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
  }

  // Contractor breakdown
  const contractorCounts: Record<string, number> = {};
  snags.forEach(snag => {
    if (snag.assigned_contractor) {
      contractorCounts[snag.assigned_contractor] = (contractorCounts[snag.assigned_contractor] || 0) + 1;
    }
  });

  if (Object.keys(contractorCounts).length > 0) {
    doc.setFontSize(14);
    doc.text("Snags by Contractor", margin, yPos);
    yPos += 10;

    autoTable(doc, {
      startY: yPos,
      head: [['Contractor', 'Count']],
      body: Object.entries(contractorCounts).map(([contractor, count]) => [contractor, count.toString()]),
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    });
  }

  addPageNumber(pageNum, 0); // We'll update total pages later

  // Floor Plan Overview Page
  if (data.canvasDataUrl) {
    doc.addPage();
    pageNum++;
    
    doc.setFontSize(18);
    doc.text("Floor Plan Overview", margin, margin + 5);
    
    // Add floor plan image with pins
    const imgWidth = pageWidth - (2 * margin);
    const imgHeight = pageHeight - (2 * margin) - 30;
    
    try {
      doc.addImage(data.canvasDataUrl, 'PNG', margin, margin + 15, imgWidth, imgHeight, undefined, 'FAST');
    } catch (error) {
      console.error('Error adding floor plan image:', error);
      doc.text('Error loading floor plan image', margin, margin + 20);
    }

    addPageNumber(pageNum, 0);
  }

  // Items Summary Table
  doc.addPage();
  pageNum++;
  
  doc.setFontSize(18);
  doc.text("Items Summary", margin, margin + 5);
  
  autoTable(doc, {
    startY: margin + 15,
    head: [['#', 'Type', 'Title', 'Priority', 'Status', 'Contractor']],
    body: data.pins
      .sort((a, b) => a.pin_number - b.pin_number)
      .map(pin => [
        pin.pin_number.toString(),
        pin.pin_type,
        pin.title || 'Untitled',
        pin.priority || '-',
        pin.status,
        pin.assigned_contractor || '-',
      ]),
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185] },
    styles: { fontSize: 9 },
  });

  addPageNumber(pageNum, 0);

  // Individual Item Detail Pages
  for (const pin of data.pins.sort((a, b) => a.pin_number - b.pin_number)) {
    doc.addPage();
    pageNum++;
    yPos = margin;

    // Item header
    doc.setFillColor(41, 128, 185);
    doc.rect(0, 0, pageWidth, 25, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text(`Item #${pin.pin_number}`, margin, 15);
    
    doc.setTextColor(0, 0, 0);
    yPos = 35;

    // Type and status badges
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Type: ${pin.pin_type.toUpperCase()}`, margin, yPos);
    doc.text(`Status: ${pin.status.toUpperCase()}`, margin + 60, yPos);
    yPos += 10;

    // Title
    if (pin.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.text("Title:", margin, yPos);
      doc.setFont("helvetica", "normal");
      const titleLines = doc.splitTextToSize(pin.title, pageWidth - (2 * margin));
      doc.text(titleLines, margin, yPos + 7);
      yPos += 7 * titleLines.length + 10;
    }

    // Photo
    if (pin.photo_url) {
      try {
        const imgWidth = pageWidth - (2 * margin);
        const imgHeight = 80;
        doc.addImage(pin.photo_url, 'JPEG', margin, yPos, imgWidth, imgHeight, undefined, 'FAST');
        yPos += imgHeight + 10;
      } catch (error) {
        console.error('Error adding photo:', error);
        doc.text('Error loading photo', margin, yPos);
        yPos += 10;
      }
    }

    // Notes
    if (pin.notes) {
      doc.setFont("helvetica", "bold");
      doc.text("Notes:", margin, yPos);
      doc.setFont("helvetica", "normal");
      yPos += 7;
      const notesLines = doc.splitTextToSize(pin.notes, pageWidth - (2 * margin));
      doc.text(notesLines, margin, yPos);
      yPos += 7 * notesLines.length + 10;
    }

    // Snag-specific details
    if (pin.pin_type === 'snag') {
      if (pin.priority) {
        doc.setFont("helvetica", "bold");
        doc.text(`Priority: `, margin, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(pin.priority.toUpperCase(), margin + 25, yPos);
        yPos += 7;
      }

      if (pin.assigned_contractor) {
        doc.setFont("helvetica", "bold");
        doc.text(`Assigned to: `, margin, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(pin.assigned_contractor, margin + 30, yPos);
        yPos += 7;
      }

      if (pin.due_date) {
        doc.setFont("helvetica", "bold");
        doc.text(`Due date: `, margin, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(new Date(pin.due_date).toLocaleDateString(), margin + 25, yPos);
        yPos += 7;
      }
    }

    addPageNumber(pageNum, 0);
  }

  // Update all page numbers with total
  const totalPages = pageNum;
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addPageNumber(i, totalPages);
  }

  return doc;
};