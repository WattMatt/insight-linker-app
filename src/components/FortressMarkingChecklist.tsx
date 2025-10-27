import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, Circle, FileDown } from "lucide-react";
import { generateFortressTemplate } from "@/lib/fortressTemplate";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

  const exportToPDF = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      
      // Title
      doc.setFontSize(18);
      doc.text('Fortress Site Close-Out Checklist', pageWidth / 2, 20, { align: 'center' });
      
      // Summary
      doc.setFontSize(12);
      doc.text(`Progress: ${checkedItems} of ${totalItems} items completed (${completionPercentage}%)`, 14, 35);
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 42);

      let yPosition = 52;

      // Generate table data for each section
      Object.entries(sections).forEach(([sectionName, items]) => {
        const sectionApplicable = items.filter(i => i.status !== 'not_applicable');
        const sectionChecked = sectionApplicable.filter(i => i.is_checked).length;
        const sectionTotal = sectionApplicable.length;
        const sectionProgress = sectionTotal > 0 ? Math.round((sectionChecked / sectionTotal) * 100) : 0;

        // Section header
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(`${sectionName} (${sectionProgress}%)`, 14, yPosition);
        yPosition += 8;

        // Section items table
        const tableData = items.map(item => [
          item.status === 'not_applicable' ? 'N/A' : (item.is_checked ? '✓' : '☐'),
          item.item_name,
          item.status === 'not_applicable' ? 'Not Applicable' : (item.is_checked ? 'Complete' : 'Pending')
        ]);

        autoTable(doc, {
          startY: yPosition,
          head: [['Status', 'Item', 'Progress']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246] },
          columnStyles: {
            0: { cellWidth: 15, halign: 'center' },
            1: { cellWidth: 130 },
            2: { cellWidth: 30, halign: 'center' }
          },
          styles: { fontSize: 9 },
        });

        yPosition = (doc as any).lastAutoTable.finalY + 10;
      });

      doc.save(`fortress-checklist-${new Date().getTime()}.pdf`);
      toast.success('PDF exported successfully');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast.error('Failed to export PDF');
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
                onClick={exportToPDF}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export PDF
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
                    {items.map((item, itemIndex) => (
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
    </div>
  );
};
