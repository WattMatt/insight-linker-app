import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Pin {
  pin_number: number;
  pin_type: 'snag' | 'observation';
  status: 'open' | 'in_progress' | 'finished' | 'closed' | 'resolved';
  priority?: string;
  title?: string;
  notes?: string;
  detailed_description?: string;
  photo_url?: string;
  assigned_contractor?: string;
  stakeholders?: string;
  package?: string;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  edit_history?: any[];
  rectification_photo_url?: string;
  rectification_notes?: string;
  rectified_at?: string;
  rectified_by?: string;
  comments?: Array<{
    user_name: string;
    comment: string;
    created_at: string;
  }>;
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
  
  // Status breakdown
  const statusCount = {
    open: data.pins.filter(p => p.status === 'open').length,
    in_progress: data.pins.filter(p => p.status === 'in_progress').length,
    finished: data.pins.filter(p => p.status === 'finished').length,
    closed: data.pins.filter(p => p.status === 'closed').length,
    resolved: data.pins.filter(p => p.status === 'resolved').length,
  };

  doc.text(`Snags: ${snags.length}`, margin, yPos);
  yPos += 7;
  doc.text(`Observations: ${observations.length}`, margin, yPos);
  yPos += 10;
  
  doc.setFontSize(10);
  doc.text(`Status: ${statusCount.open} Open, ${statusCount.in_progress} In Progress, ${statusCount.finished} Finished, ${statusCount.closed + statusCount.resolved} Closed`, margin, yPos);

  // Executive Summary Page
  doc.addPage();
  let pageNum = 2;
  
  doc.setFillColor(52, 152, 219);
  doc.rect(0, 0, pageWidth, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Executive Summary", pageWidth / 2, 10, { align: "center" });
  doc.setTextColor(0, 0, 0);
  yPos = margin + 10;

  // Status breakdown table
  doc.setFontSize(13);
  doc.text("Status Overview", margin, yPos);
  yPos += 7;

  autoTable(doc, {
    startY: yPos,
    head: [['Status', 'Count', 'Percentage']],
    body: [
      ['Open', statusCount.open.toString(), `${Math.round((statusCount.open / data.pins.length) * 100)}%`],
      ['In Progress', statusCount.in_progress.toString(), `${Math.round((statusCount.in_progress / data.pins.length) * 100)}%`],
      ['Finished', statusCount.finished.toString(), `${Math.round((statusCount.finished / data.pins.length) * 100)}%`],
      ['Closed', (statusCount.closed + statusCount.resolved).toString(), `${Math.round(((statusCount.closed + statusCount.resolved) / data.pins.length) * 100)}%`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [52, 152, 219], textColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 60 },
      1: { cellWidth: 40, halign: 'center' },
      2: { cellWidth: 40, halign: 'center' },
    },
  });

  yPos = (doc as any).lastAutoTable.finalY + 12;

  // Priority breakdown for snags
  if (snags.length > 0) {
    doc.setFontSize(13);
    doc.text("Snags by Priority", margin, yPos);
    yPos += 7;

    const priorityCount = {
      critical: snags.filter(s => s.priority === 'critical').length,
      high: snags.filter(s => s.priority === 'high').length,
      medium: snags.filter(s => s.priority === 'medium').length,
      low: snags.filter(s => s.priority === 'low').length,
    };

    autoTable(doc, {
      startY: yPos,
      head: [['Priority', 'Count', 'Percentage']],
      body: [
        ['Critical', priorityCount.critical.toString(), `${Math.round((priorityCount.critical / snags.length) * 100)}%`],
        ['High', priorityCount.high.toString(), `${Math.round((priorityCount.high / snags.length) * 100)}%`],
        ['Medium', priorityCount.medium.toString(), `${Math.round((priorityCount.medium / snags.length) * 100)}%`],
        ['Low', priorityCount.low.toString(), `${Math.round((priorityCount.low / snags.length) * 100)}%`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [220, 53, 69], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 40, halign: 'center' },
        2: { cellWidth: 40, halign: 'center' },
      },
    });

    yPos = (doc as any).lastAutoTable.finalY + 12;
  }

  // Contractor breakdown
  const contractorCounts: Record<string, number> = {};
  snags.forEach(snag => {
    if (snag.assigned_contractor) {
      contractorCounts[snag.assigned_contractor] = (contractorCounts[snag.assigned_contractor] || 0) + 1;
    }
  });

  if (Object.keys(contractorCounts).length > 0) {
    doc.setFontSize(13);
    doc.text("Snags by Contractor", margin, yPos);
    yPos += 7;

    autoTable(doc, {
      startY: yPos,
      head: [['Contractor', 'Total', 'Open', 'In Progress', 'Finished']],
      body: Object.entries(contractorCounts).map(([contractor]) => {
        const contractorSnags = snags.filter(s => s.assigned_contractor === contractor);
        return [
          contractor,
          contractorSnags.length.toString(),
          contractorSnags.filter(s => s.status === 'open').length.toString(),
          contractorSnags.filter(s => s.status === 'in_progress').length.toString(),
          contractorSnags.filter(s => s.status === 'finished' || s.status === 'closed' || s.status === 'resolved').length.toString(),
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: [108, 117, 125], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 25, halign: 'center' },
        2: { cellWidth: 25, halign: 'center' },
        3: { cellWidth: 30, halign: 'center' },
        4: { cellWidth: 30, halign: 'center' },
      },
    });
  }

  addPageNumber(pageNum, 0); // We'll update total pages later

  // Floor Plan Overview Page
  if (data.canvasDataUrl) {
    doc.addPage();
    pageNum++;
    
    doc.setFillColor(52, 152, 219);
    doc.rect(0, 0, pageWidth, 15, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Floor Plan Overview", pageWidth / 2, 10, { align: "center" });
    doc.setTextColor(0, 0, 0);
    
    // Add floor plan image with pins
    const imgWidth = pageWidth - (2 * margin);
    const imgHeight = pageHeight - (2 * margin) - 30;
    
    try {
      doc.addImage(data.canvasDataUrl, 'PNG', margin, margin + 10, imgWidth, imgHeight, undefined, 'FAST');
    } catch (error) {
      console.error('Error adding floor plan image:', error);
      doc.text('Error loading floor plan image', margin, margin + 20);
    }

    addPageNumber(pageNum, 0);
  }

  // Items Summary Table
  doc.addPage();
  pageNum++;
  
  doc.setFillColor(52, 152, 219);
  doc.rect(0, 0, pageWidth, 15, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text("Items Summary", pageWidth / 2, 10, { align: "center" });
  doc.setTextColor(0, 0, 0);
  
  autoTable(doc, {
    startY: margin + 10,
    head: [['#', 'Type', 'Title', 'Priority', 'Status', 'Contractor']],
    body: data.pins
      .sort((a, b) => a.pin_number - b.pin_number)
      .map(pin => [
        pin.pin_number.toString(),
        pin.pin_type,
        pin.title || 'Untitled',
        pin.priority || '-',
        pin.status.replace('_', ' '),
        pin.assigned_contractor || '-',
      ]),
    theme: 'striped',
    headStyles: { fillColor: [52, 152, 219], textColor: [255, 255, 255] },
    styles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [240, 248, 255] },
  });

  addPageNumber(pageNum, 0);

  // Individual Item Detail Pages
  for (const pin of data.pins.sort((a, b) => a.pin_number - b.pin_number)) {
    doc.addPage();
    pageNum++;
    yPos = margin;

    // Item header with status color
    let headerColor: [number, number, number] = [52, 152, 219]; // Default blue
    if (pin.status === 'closed' || pin.status === 'resolved') headerColor = [40, 167, 69]; // Green
    else if (pin.status === 'in_progress') headerColor = [255, 193, 7]; // Yellow
    else if (pin.status === 'open' && pin.priority === 'critical') headerColor = [220, 53, 69]; // Red
    
    doc.setFillColor(...headerColor);
    doc.rect(0, 0, pageWidth, 30, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text(`Item #${pin.pin_number}`, margin, 12);
    
    doc.setFontSize(11);
    doc.text(`${pin.pin_type.toUpperCase()} • ${pin.status.replace('_', ' ').toUpperCase()}`, margin, 22);
    
    doc.setTextColor(0, 0, 0);
    yPos = 40;

    // Info grid
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    
    let infoYPos = yPos;
    if (pin.priority) {
      doc.text("Priority:", margin, infoYPos);
      doc.setFont("helvetica", "normal");
      doc.text(pin.priority.toUpperCase(), margin + 25, infoYPos);
      infoYPos += 6;
    }
    
    if (pin.assigned_contractor) {
      doc.setFont("helvetica", "bold");
      doc.text("Contractor:", margin, infoYPos);
      doc.setFont("helvetica", "normal");
      doc.text(pin.assigned_contractor, margin + 30, infoYPos);
      infoYPos += 6;
    }
    
    if (pin.stakeholders) {
      doc.setFont("helvetica", "bold");
      doc.text("Stakeholders:", margin, infoYPos);
      doc.setFont("helvetica", "normal");
      doc.text(pin.stakeholders, margin + 35, infoYPos);
      infoYPos += 6;
    }
    
    if (pin.package) {
      doc.setFont("helvetica", "bold");
      doc.text("Package:", margin, infoYPos);
      doc.setFont("helvetica", "normal");
      doc.text(pin.package, margin + 25, infoYPos);
      infoYPos += 6;
    }
    
    if (pin.due_date) {
      doc.setFont("helvetica", "bold");
      doc.text("Due Date:", margin, infoYPos);
      doc.setFont("helvetica", "normal");
      doc.text(new Date(pin.due_date).toLocaleDateString(), margin + 27, infoYPos);
      infoYPos += 6;
    }
    
    yPos = infoYPos + 5;

    // Title
    if (pin.title) {
      doc.setFillColor(240, 248, 255);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Title", margin + 2, yPos + 8);
      yPos += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const titleLines = doc.splitTextToSize(pin.title, pageWidth - (2 * margin) - 4);
      doc.text(titleLines, margin + 2, yPos);
      yPos += 5 * titleLines.length + 8;
    }

    // Before/After Photo Comparison
    if (pin.photo_url || pin.rectification_photo_url) {
      if (pin.photo_url && pin.rectification_photo_url) {
        // Side-by-side comparison
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Before / After Comparison", margin, yPos);
        yPos += 5;
        
        const halfWidth = (pageWidth - (2 * margin) - 5) / 2;
        const imgHeight = 70;
        
        // Before label and image
        doc.setFontSize(9);
        doc.setTextColor(220, 53, 69);
        doc.text("BEFORE", margin, yPos);
        doc.setTextColor(40, 167, 69);
        doc.text("AFTER", margin + halfWidth + 5, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 3;
        
        doc.setDrawColor(220, 53, 69);
        doc.setLineWidth(1);
        doc.rect(margin, yPos, halfWidth, imgHeight);
        try {
          doc.addImage(pin.photo_url, 'JPEG', margin + 1, yPos + 1, halfWidth - 2, imgHeight - 2, undefined, 'FAST');
        } catch (error) {
          console.error('Error adding before photo:', error);
        }
        
        doc.setDrawColor(40, 167, 69);
        doc.rect(margin + halfWidth + 5, yPos, halfWidth, imgHeight);
        try {
          doc.addImage(pin.rectification_photo_url, 'JPEG', margin + halfWidth + 6, yPos + 1, halfWidth - 2, imgHeight - 2, undefined, 'FAST');
        } catch (error) {
          console.error('Error adding after photo:', error);
        }
        
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        yPos += imgHeight + 5;
        
        // Rectification notes
        if (pin.rectification_notes) {
          doc.setFillColor(232, 245, 233);
          doc.rect(margin, yPos, pageWidth - 2 * margin, 10, "F");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text("Rectification Notes:", margin + 2, yPos + 7);
          yPos += 12;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          const rectNotes = doc.splitTextToSize(pin.rectification_notes, pageWidth - (2 * margin) - 4);
          doc.text(rectNotes, margin + 2, yPos);
          yPos += 4 * rectNotes.length + 3;
        }
        
        if (pin.rectified_at) {
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(`Rectified on ${new Date(pin.rectified_at).toLocaleString()}${pin.rectified_by ? ` by ${pin.rectified_by}` : ''}`, margin, yPos);
          doc.setTextColor(0);
          yPos += 8;
        }
      } else if (pin.photo_url) {
        // Original photo only
        try {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(11);
          doc.text("Photo", margin, yPos);
          yPos += 5;
          
          const imgWidth = pageWidth - (2 * margin);
          const imgHeight = 90;
          doc.setDrawColor(200);
          doc.setLineWidth(0.5);
          doc.rect(margin, yPos, imgWidth, imgHeight);
          doc.addImage(pin.photo_url, 'JPEG', margin + 1, yPos + 1, imgWidth - 2, imgHeight - 2, undefined, 'FAST');
          yPos += imgHeight + 10;
        } catch (error) {
          console.error('Error adding photo:', error);
          doc.text('Error loading photo', margin, yPos);
          yPos += 10;
        }
      }
    }

    // Detailed Description
    if (pin.detailed_description) {
      doc.setFillColor(240, 248, 255);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Detailed Description", margin + 2, yPos + 8);
      yPos += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const descLines = doc.splitTextToSize(pin.detailed_description, pageWidth - (2 * margin) - 4);
      doc.text(descLines, margin + 2, yPos);
      yPos += 5 * descLines.length + 8;
    }

    // Notes
    if (pin.notes) {
      doc.setFillColor(255, 250, 240);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Notes", margin + 2, yPos + 8);
      yPos += 14;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const notesLines = doc.splitTextToSize(pin.notes, pageWidth - (2 * margin) - 4);
      doc.text(notesLines, margin + 2, yPos);
      yPos += 5 * notesLines.length + 8;
    }

    // Comments section
    if (pin.comments && pin.comments.length > 0) {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        pageNum++;
        yPos = margin;
      }
      
      doc.setFillColor(245, 245, 245);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`Comments (${pin.comments.length})`, margin + 2, yPos + 8);
      yPos += 14;
      
      doc.setFontSize(9);
      pin.comments.forEach((comment, idx) => {
        if (yPos > pageHeight - 30) {
          doc.addPage();
          pageNum++;
          yPos = margin;
        }
        
        doc.setFont("helvetica", "bold");
        doc.text(`${comment.user_name || 'User'}`, margin + 2, yPos);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100);
        doc.text(new Date(comment.created_at).toLocaleDateString(), margin + 50, yPos);
        doc.setTextColor(0);
        yPos += 5;
        
        const commentLines = doc.splitTextToSize(comment.comment, pageWidth - (2 * margin) - 4);
        doc.text(commentLines, margin + 2, yPos);
        yPos += 4 * commentLines.length + 6;
      });
    }

    // Edit History
    if (pin.edit_history && Array.isArray(pin.edit_history) && pin.edit_history.length > 0) {
      if (yPos > pageHeight - 50) {
        doc.addPage();
        pageNum++;
        yPos = margin;
      }
      
      doc.setFillColor(250, 245, 255);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 12, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Edit History", margin + 2, yPos + 8);
      yPos += 14;
      
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      
      pin.edit_history.slice(-5).forEach((edit: any) => {
        if (yPos > pageHeight - 20) {
          doc.addPage();
          pageNum++;
          yPos = margin;
        }
        
        const timestamp = new Date(edit.timestamp).toLocaleString();
        doc.setTextColor(100);
        doc.text(timestamp, margin + 2, yPos);
        doc.setTextColor(0);
        yPos += 4;
        
        if (edit.changes?.status) {
          doc.text(`Status: ${edit.changes.status.from} → ${edit.changes.status.to}`, margin + 4, yPos);
          yPos += 4;
        }
        if (edit.changes?.priority) {
          doc.text(`Priority: ${edit.changes.priority.from} → ${edit.changes.priority.to}`, margin + 4, yPos);
          yPos += 4;
        }
        if (edit.changes?.assigned_contractor) {
          doc.text(`Contractor: ${edit.changes.assigned_contractor.from || 'None'} → ${edit.changes.assigned_contractor.to}`, margin + 4, yPos);
          yPos += 4;
        }
        yPos += 3;
      });
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