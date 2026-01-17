import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, Eye } from "lucide-react";
import { generateFortressTemplate } from "@/lib/fortressTemplate";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { savePDFToDocuments, getReportCategoryName } from "@/lib/pdfDocumentSaver";
import {
  generatePdfBlob,
  createCoverPage,
  createDataTable,
  createSectionHeader,
  COLORS,
  DEFAULT_STYLES,
} from "@/lib/pdfMakeUtils";

type Content = any;
type TDocumentDefinitions = any;

const PDF_COLORS = COLORS;

// Simple progress bar for pdfmake
function createProgressBar(percentage: number): Content {
  return {
    canvas: [
      { type: 'rect', x: 0, y: 0, w: 200, h: 10, color: '#E5E7EB' },
      { type: 'rect', x: 0, y: 0, w: 200 * (percentage / 100), h: 10, color: percentage >= 80 ? '#22C55E' : percentage >= 50 ? '#F59E0B' : '#EF4444' }
    ],
    width: 200
  };
}

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

  useEffect(() => {
    initializeChecklist();
  }, [siteId]);

  const initializeChecklist = async () => {
    try {
      setLoading(true);
      
      const { data: existingItems, error: fetchError } = await supabase
        .from('site_marking_checklist')
        .select('*')
        .eq('site_id', siteId);

      if (fetchError) throw fetchError;

      const template = generateFortressTemplate();
      const allItems: ChecklistItem[] = [];

      template.sections.forEach((section) => {
        section.items.forEach((item) => {
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

  // Calculate stats
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

  const generatePDFDocument = async (): Promise<{ fileName: string; blob: Blob }> => {
    const content: Content[] = [];

    // Cover page
    const coverPage = createCoverPage({
      title: 'Fortress Site Close-Out Checklist',
      subtitle: `Progress: ${checkedItems} of ${totalItems} items completed (${completionPercentage}%)`,
      siteName: 'Site Checklist',
      reportType: 'Close-Out Checklist',
      organizationName: 'Fortress',
      reportDate: new Date(),
    });
    content.push(coverPage);

    // Summary page
    content.push({ text: '', pageBreak: 'after' } as Content);
    content.push(createSectionHeader('Checklist Summary', 'secondary'));

    // Progress bar
    content.push({
      columns: [
        { text: 'Overall Progress', bold: true, width: 100 },
        createProgressBar(completionPercentage)
      ],
      margin: [0, 10, 0, 20]
    } as Content);

    // Summary stats table
    content.push(createSectionHeader('Summary Statistics', 'muted'));
    const summaryTable = createDataTable(
      ['Metric', 'Value'],
      [
        ['Total Items', totalItems.toString()],
        ['Completed', checkedItems.toString()],
        ['Pending', (totalItems - checkedItems).toString()],
        ['Not Applicable', notApplicableCount.toString()],
        ['Completion Rate', `${completionPercentage}%`],
      ]
    );
    content.push(summaryTable);

    // Section details
    Object.entries(sections).forEach(([sectionName, items]) => {
      const sectionApplicable = items.filter(i => i.status !== 'not_applicable');
      const sectionChecked = sectionApplicable.filter(i => i.is_checked).length;
      const sectionTotal = sectionApplicable.length;
      const sectionProgress = sectionTotal > 0 ? Math.round((sectionChecked / sectionTotal) * 100) : 0;

      content.push({ text: '', pageBreak: 'before' } as Content);
      content.push(createSectionHeader(`${sectionName} (${sectionProgress}%)`, 'secondary'));

      const tableData = items.map(item => [
        item.status === 'not_applicable' ? 'N/A' : (item.is_checked ? '✓' : '☐'),
        item.item_name,
        item.status === 'not_applicable' ? 'Not Applicable' : (item.is_checked ? 'Complete' : 'Pending')
      ]);

      const sectionTable = createDataTable(
        ['Status', 'Item', 'Progress'],
        tableData
      );
      content.push(sectionTable);
    });

    // Build document definition
    const date = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const docDefinition: TDocumentDefinitions = {
      content,
      styles: DEFAULT_STYLES,
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 10,
      },
      pageMargins: [40, 40, 40, 60],
      footer: (currentPage: number, pageCount: number) => {
        if (currentPage === 1) return null;
        return {
          columns: [
            { text: 'Confidential', fontSize: 8, color: PDF_COLORS.textMuted, margin: [40, 0, 0, 0] },
            { text: `Page ${currentPage - 1} of ${pageCount - 1}`, fontSize: 8, alignment: 'center', color: PDF_COLORS.textMuted },
            { text: date, fontSize: 8, alignment: 'right', color: PDF_COLORS.textMuted, margin: [0, 0, 40, 0] }
          ],
          margin: [0, 20, 0, 0]
        };
      }
    };

    const blob = await generatePdfBlob(docDefinition);
    const fileName = `fortress-checklist-${new Date().getTime()}.pdf`;
    
    return { fileName, blob };
  };

  const handlePreviewReport = async () => {
    try {
      setGenerating(true);
      const result = await generatePDFDocument();
      
      const url = URL.createObjectURL(result.blob);
      setPreviewUrl(url);
      setPreviewFileName(result.fileName);
      setPdfBlob(result.blob);
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
                          disabled={updating === item.item_id || item.status === 'not_applicable'}
                          onCheckedChange={() => toggleCheckbox(item.item_id, item.is_checked)}
                        />
                        <div className="flex-1">
                          <label
                            htmlFor={item.item_id}
                            className={`text-sm font-medium cursor-pointer ${
                              item.status === 'not_applicable' ? 'text-muted-foreground line-through' : ''
                            }`}
                          >
                            {item.item_name}
                          </label>
                          {item.is_checked && item.checked_at && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                              Completed {new Date(item.checked_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => toggleNotApplicable(item.item_id)}
                          disabled={updating === item.item_id}
                        >
                          {item.status === 'not_applicable' ? 'Undo N/A' : 'N/A'}
                        </Button>
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
      />
    </div>
  );
};
