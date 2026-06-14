import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, Eye, Save } from "lucide-react";
import { generateFortressTemplate } from "@/lib/fortressTemplate";
import { DocumentPreviewDialog } from "@/components/DocumentPreviewDialog";
import { generateFortressChecklistPdf, type FortressChecklistData } from "@/lib/fortressChecklistReportGenerator";
import { savePDFToDocuments } from "@/lib/pdfDocumentSaver";

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
  siteName?: string;
}

export const FortressMarkingChecklist = ({ siteId, siteName }: FortressMarkingChecklistProps) => {
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [previewFileName, setPreviewFileName] = useState<string>("");
  const [previewBlob, setPreviewBlob] = useState<Blob | undefined>(undefined);
  const [isGenerating, setIsGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const handlePreviewReport = async () => {
    // Build sections data for the report
    const sectionsData = Object.entries(sections).map(([sectionName, items]) => {
      const sectionApplicable = items.filter(i => i.status !== 'not_applicable');
      const sectionChecked = sectionApplicable.filter(i => i.is_checked).length;
      const sectionTotal = sectionApplicable.length;
      const sectionProgress = sectionTotal > 0 ? Math.round((sectionChecked / sectionTotal) * 100) : 0;

      return {
        name: sectionName,
        progress: sectionProgress,
        items: items.map(item => ({
          id: item.item_id,
          label: item.item_name,
          isChecked: item.is_checked,
          isNotApplicable: item.status === 'not_applicable',
          checkedAt: item.checked_at || undefined,
        })),
      };
    });

    const reportData: FortressChecklistData = {
      title: 'Fortress Site Close-Out Checklist',
      siteName: siteName || 'Site',
      siteId,
      overallProgress: completionPercentage,
      sections: sectionsData,
      stats: {
        completed: checkedItems,
        pending: totalItems - checkedItems,
        notApplicable: notApplicableCount,
        total: totalItems,
      },
      generatedAt: new Date().toISOString(),
    };

    setIsGenerating(true);
    try {
      const result = await generateFortressChecklistPdf(reportData);

      if (result.success && result.blob) {
        const url = URL.createObjectURL(result.blob);
        setPreviewUrl(url);
        setPreviewFileName(result.filename || `Fortress_Checklist_${Date.now()}.pdf`);
        setPreviewBlob(result.blob);
        setPreviewOpen(true);
      } else {
        toast.error(result.error || 'Failed to generate report');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToDocuments = async () => {
    if (!previewBlob) {
      toast.error('Cannot save report');
      return;
    }
    try {
      setSaving(true);
      const res = await savePDFToDocuments({
        blob: previewBlob,
        fileName: previewFileName,
        siteId,
        categoryName: 'Marking Checklists',
      });
      if (res.success) {
        toast.success('Report saved to documents!');
      } else {
        toast.error(res.error || 'Failed to save report');
      }
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
                disabled={isGenerating}
              >
                <Eye className="h-4 w-4 mr-2" />
                {isGenerating ? "Generating..." : "Preview Report"}
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
            setPreviewBlob(undefined);
          }
        }}
        fileUrl={previewUrl}
        fileName={previewFileName}
        downloadBlobData={previewBlob}
        onSaveToDocuments={handleSaveToDocuments}
        saveLocation="site"
        contextName={siteName || 'Site'}
        isSaving={saving}
      />
    </div>
  );
};
