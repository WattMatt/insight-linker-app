import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, Eye } from "lucide-react";
import { generateFortressTemplate } from "@/lib/fortressTemplate";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import {
  addCoverPage,
  addStandardHeader,
  addFootersToAllPages,
  addSectionHeader,
  drawProgressBar,
  RGB_COLORS,
  PAGE,
  logComplianceCheck,
  PDFComplianceCheck,
} from "@/lib/pdfUtils";
import { DOCUMENT_DESIGN_STANDARDS } from "@/lib/documentDesignStandards";

const { margins, typography, tables } = DOCUMENT_DESIGN_STANDARDS;

interface ChecklistItem {
  id: string;
  item_id: string;
  item_name: string;
  section_name: string;
  is_checked: boolean;
  checked_at: string | null;
  notes: string | null;
  status: 'pending' | 'completed' | 'not_applicable';
}

interface FortressMarkingChecklistProps {
  siteId: string;
}

export const FortressMarkingChecklist = ({ siteId }: FortressMarkingChecklistProps) => {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [complianceChecks, setComplianceChecks] = useState<PDFComplianceCheck | null>(null);

  useEffect(() => {
    initializeChecklist();
  }, [siteId]);

  const initializeChecklist = async () => {
    try {
      setLoading(true);
      
      // Get existing checklist items from database
      const { data: existingItems, error: fetchError } = await supabase
        .from('site_marking_checklist')
        .select('*')
        .eq('site_id', siteId);

      if (fetchError) throw fetchError;

      // Get template structure
      const template = generateFortressTemplate();
      const allItems: ChecklistItem[] = [];

      // Build complete checklist from template
      template.sections.forEach((section) => {
        section.items.forEach((item) => {
          // Only include checkbox items for the marking checklist
          if (item.type === 'checkbox') {
            const existingItem = existingItems?.find(i => i.item_id === item.id);
            
            allItems.push({
              id: existingItem?.id || '',
              item_id: item.id,
              item_name: item.name,
              section_name: section.name,
              is_checked: existingItem?.is_checked || false,
              checked_at: existingItem?.checked_at || null,
              notes: existingItem?.notes || null,
              status: (existingItem?.status as 'pending' | 'completed' | 'not_applicable') || 'pending',
            });
          }
        });
      });

      setChecklistItems(allItems);
    } catch (error) {
      console.error('Error initializing checklist:', error);
      toast.error('Failed to load checklist');
    } finally {
      setLoading(false);
    }
  };

  const toggleCheckbox = async (itemId: string, currentState: boolean) => {
    try {
      setUpdating(itemId);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const item = checklistItems.find(i => i.item_id === itemId);
      if (!item) return;

      const newState = !currentState;
      const newStatus = newState ? 'completed' : 'pending';

      // Upsert the checklist item
      const { error } = await supabase
        .from('site_marking_checklist')
        .upsert({
          site_id: siteId,
          item_id: itemId,
          item_name: item.item_name,
          section_name: item.section_name,
          is_checked: newState,
          checked_by: newState ? user.id : null,
          checked_at: newState ? new Date().toISOString() : null,
          status: newStatus,
        }, {
          onConflict: 'site_id,item_id'
        });

      if (error) throw error;

      // Update local state
      setChecklistItems(items =>
        items.map(i =>
          i.item_id === itemId
            ? { ...i, is_checked: newState, checked_at: newState ? new Date().toISOString() : null, status: newStatus }
            : i
        )
      );

      toast.success(newState ? 'Item marked complete' : 'Item unmarked');
    } catch (error) {
      console.error('Error updating checkbox:', error);
      toast.error('Failed to update item');
    } finally {
      setUpdating(null);
    }
  };

  const toggleNotApplicable = async (itemId: string) => {
    try {
      setUpdating(itemId);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const item = checklistItems.find(i => i.item_id === itemId);
      if (!item) return;

      const newStatus = item.status === 'not_applicable' ? 'pending' : 'not_applicable';

      // Upsert the checklist item
      const { error } = await supabase
        .from('site_marking_checklist')
        .upsert({
          site_id: siteId,
          item_id: itemId,
          item_name: item.item_name,
          section_name: item.section_name,
          is_checked: false,
          checked_by: null,
          checked_at: null,
          status: newStatus,
        }, {
          onConflict: 'site_id,item_id'
        });

      if (error) throw error;

      // Update local state
      setChecklistItems(items =>
        items.map(i =>
          i.item_id === itemId
            ? { ...i, is_checked: false, checked_at: null, status: newStatus }
            : i
        )
      );

      toast.success(newStatus === 'not_applicable' ? 'Item marked N/A' : 'N/A removed');
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update item');
    } finally {
      setUpdating(null);
    }
  };

  const clearAllChecks = async () => {
    if (!confirm('Are you sure you want to clear all checkboxes? This cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('site_marking_checklist')
        .delete()
        .eq('site_id', siteId);

      if (error) throw error;

      setChecklistItems(items =>
        items.map(i => ({ ...i, is_checked: false, checked_at: null, status: 'pending' }))
      );

      toast.success('All items cleared');
    } catch (error) {
      console.error('Error clearing checklist:', error);
      toast.error('Failed to clear checklist');
    }
  };

  // Calculate stats for PDF generation
  const applicableItems = checklistItems.filter(i => i.status !== 'not_applicable');
  const totalItems = applicableItems.length;
  const checkedItems = applicableItems.filter(i => i.is_checked).length;
  const notApplicableCount = checklistItems.filter(i => i.status === 'not_applicable').length;
  const completionPercentage = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  // Group items by section
  const sections = checklistItems.reduce((acc, item) => {
    if (!acc[item.section_name]) {
      acc[item.section_name] = [];
    }
    acc[item.section_name].push(item);
    return acc;
  }, {} as Record<string, ChecklistItem[]>);

  const generatePDFDocument = (): { doc: jsPDF; fileName: string; blob: Blob; complianceChecks: PDFComplianceCheck } => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    // ===== COVER PAGE =====
    addCoverPage(doc, {
      title: 'Fortress Site Close-Out Checklist',
      subtitle: `Progress: ${checkedItems} of ${totalItems} items completed (${completionPercentage}%)`,
      siteName: 'Site Checklist',
      reportType: 'Close-Out Checklist',
      organizationName: 'Fortress',
      reportDate: new Date(),
    });

    // ===== SUMMARY PAGE =====
    doc.addPage();
    addStandardHeader(doc, 'Checklist Summary', null);
    
    let yPos = PAGE.contentStartY;

    // Progress bar
    doc.setFontSize(typography.scale.body);
    doc.setFont(typography.fonts.heading, 'bold');
    doc.setTextColor(...RGB_COLORS.textPrimary);
    doc.text('Overall Progress', margins.left, yPos);
    
    drawProgressBar(doc, margins.left + 40, yPos - 4, PAGE.contentWidth - 60, completionPercentage);
    yPos += 20;

    // Summary stats
    yPos = addSectionHeader(doc, 'Summary Statistics', yPos);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Metric', 'Value']],
      body: [
        ['Total Items', totalItems.toString()],
        ['Completed', checkedItems.toString()],
        ['Pending', (totalItems - checkedItems).toString()],
        ['Not Applicable', notApplicableCount.toString()],
        ['Completion Rate', `${completionPercentage}%`],
      ],
      theme: 'grid',
      headStyles: { fillColor: RGB_COLORS.primary, textColor: RGB_COLORS.white },
      styles: { fontSize: 10, cellPadding: 4 },
      margin: { left: margins.left, right: margins.right },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 50, halign: 'center', fontStyle: 'bold' }
      }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;

    // ===== SECTION DETAIL PAGES =====
    Object.entries(sections).forEach(([sectionName, items]) => {
      const sectionApplicable = items.filter(i => i.status !== 'not_applicable');
      const sectionChecked = sectionApplicable.filter(i => i.is_checked).length;
      const sectionTotal = sectionApplicable.length;
      const sectionProgress = sectionTotal > 0 ? Math.round((sectionChecked / sectionTotal) * 100) : 0;

      // Check if we need a new page
      if (yPos > pageHeight - 80) {
        doc.addPage();
        addStandardHeader(doc, 'Checklist Details', null);
        yPos = PAGE.contentStartY;
      }

      yPos = addSectionHeader(doc, `${sectionName} (${sectionProgress}%)`, yPos);

      // Section items table
      const tableData = items.map(item => [
        item.status === 'not_applicable' ? 'N/A' : (item.is_checked ? '✓' : '☐'),
        item.item_name,
        item.status === 'not_applicable' ? 'Not Applicable' : (item.is_checked ? 'Complete' : 'Pending')
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Status', 'Item', 'Progress']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: RGB_COLORS.primary, textColor: RGB_COLORS.white },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          1: { cellWidth: 130 },
          2: { cellWidth: 30, halign: 'center' }
        },
        styles: { fontSize: 9 },
        margin: { left: margins.left, right: margins.right },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const value = data.cell.raw as string;
            if (value === '✓') {
              data.cell.styles.textColor = RGB_COLORS.success;
              data.cell.styles.fontStyle = 'bold';
            } else if (value === 'N/A') {
              data.cell.styles.textColor = RGB_COLORS.textMuted;
            }
          }
          if (data.section === 'body' && data.column.index === 2) {
            const value = data.cell.raw as string;
            if (value === 'Complete') {
              data.cell.styles.textColor = RGB_COLORS.success;
            } else if (value === 'Pending') {
              data.cell.styles.textColor = RGB_COLORS.warning;
            }
          }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 15;
    });

    // Add footers to all pages (skip cover page)
    addFootersToAllPages(doc, true);

    // Log compliance
    const checks = logComplianceCheck('FortressMarkingChecklist', {
      hasCoverPage: true,
      logoPlacement: false,
      standardMargins: true,
      typographyScale: true,
      brandColors: true,
      pageHeaders: true,
      pageFooters: true,
      tableStyles: true,
      pageBreaks: true,
    });

    const fileName = `fortress-checklist-${new Date().getTime()}.pdf`;
    const blob = doc.output('blob');
    
    return { doc, fileName, blob, complianceChecks: checks };
  };

  const handlePreviewReport = async () => {
    try {
      setGenerating(true);
      const result = generatePDFDocument();
      
      const url = URL.createObjectURL(result.blob);
      setPreviewUrl(url);
      setPreviewFileName(result.fileName);
      setPdfBlob(result.blob);
      setComplianceChecks(result.complianceChecks);
      setPreviewOpen(true);
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!pdfBlob || !siteId) {
      toast.error("Cannot save: missing data");
      return;
    }

    try {
      setSaving(true);
      const result = await savePDFToDocuments({
        blob: pdfBlob,
        fileName: previewFileName,
        siteId,
        categoryName: getReportCategoryName("fortress-checklist"),
      });

      if (result.success) {
        toast.success("Checklist saved to site documents!");
      } else {
        toast.error(result.error || "Failed to save checklist");
      }
    } catch (error) {
      console.error("Error saving checklist:", error);
      toast.error("Failed to save checklist");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle>Fortress Site Close-Out Checklist</CardTitle>
              <p className="text-sm text-muted-foreground">
                {checkedItems} of {totalItems} items completed ({completionPercentage}%)
                {notApplicableCount > 0 && ` • ${notApplicableCount} marked N/A`}
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handlePreviewReport}
                disabled={generating}
              >
                <Eye className="h-4 w-4 mr-2" />
                {generating ? "Generating..." : "Preview Report"}
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={clearAllChecks}
              >
                Clear All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={completionPercentage} className="mb-6" />

          <div className="space-y-8">
            {Object.entries(sections).map(([sectionName, items], sectionIndex) => {
              const sectionApplicable = items.filter(i => i.status !== 'not_applicable');
              const sectionChecked = sectionApplicable.filter(i => i.is_checked).length;
              const sectionTotal = sectionApplicable.length;
              const sectionProgress = sectionTotal > 0 ? Math.round((sectionChecked / sectionTotal) * 100) : 0;

              return (
                <div key={sectionIndex} className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="font-semibold text-lg">{sectionName}</h3>
                    <span className="text-sm text-muted-foreground">
                      {sectionChecked}/{sectionTotal} ({sectionProgress}%)
                    </span>
                  </div>

                  <div className="space-y-2">
                    {items.map((item) => (
                      <div
                        key={item.item_id}
                        className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                          item.status === 'not_applicable' 
                            ? 'bg-muted/50' 
                            : 'hover:bg-accent/50'
                        }`}
                      >
                        <Checkbox
                          id={item.item_id}
                          checked={item.is_checked}
                          onCheckedChange={() => toggleCheckbox(item.item_id, item.is_checked)}
                          disabled={updating === item.item_id || item.status === 'not_applicable'}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor={item.item_id}
                          className={`flex-1 cursor-pointer text-sm leading-relaxed ${
                            item.is_checked ? 'text-muted-foreground line-through' : ''
                          } ${
                            item.status === 'not_applicable' ? 'text-muted-foreground italic' : ''
                          }`}
                        >
                          {item.item_name}
                          {item.status === 'not_applicable' && (
                            <span className="ml-2 text-xs">(N/A)</span>
                          )}
                        </label>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleNotApplicable(item.item_id)}
                            disabled={updating === item.item_id}
                            className="h-6 px-2 text-xs"
                          >
                            {item.status === 'not_applicable' ? 'Undo N/A' : 'N/A'}
                          </Button>
                          {item.is_checked && item.status !== 'not_applicable' && (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <DocumentPreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open && previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl("");
          }
        }}
        fileUrl={previewUrl}
        fileName={previewFileName}
        onSaveToDocuments={handleSaveToDocuments}
        saveLocation="site"
        contextName="Site Documents"
        isSaving={saving}
        complianceChecks={complianceChecks || undefined}
      />
    </div>
  );
};
