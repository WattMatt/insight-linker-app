import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { generateFortressTemplate } from "@/lib/fortressTemplate";

interface ChecklistItem {
  id: string;
  item_id: string;
  item_name: string;
  section_name: string;
  is_checked: boolean;
  checked_at: string | null;
  notes: string | null;
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
        }, {
          onConflict: 'site_id,item_id'
        });

      if (error) throw error;

      // Update local state
      setChecklistItems(items =>
        items.map(i =>
          i.item_id === itemId
            ? { ...i, is_checked: newState, checked_at: newState ? new Date().toISOString() : null }
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
        items.map(i => ({ ...i, is_checked: false, checked_at: null }))
      );

      toast.success('All items cleared');
    } catch (error) {
      console.error('Error clearing checklist:', error);
      toast.error('Failed to clear checklist');
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

  const totalItems = checklistItems.length;
  const checkedItems = checklistItems.filter(i => i.is_checked).length;
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
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={clearAllChecks}
            >
              Clear All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={completionPercentage} className="mb-6" />

          <div className="space-y-8">
            {Object.entries(sections).map(([sectionName, items], sectionIndex) => {
              const sectionChecked = items.filter(i => i.is_checked).length;
              const sectionTotal = items.length;
              const sectionProgress = Math.round((sectionChecked / sectionTotal) * 100);

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
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <Checkbox
                          id={item.item_id}
                          checked={item.is_checked}
                          onCheckedChange={() => toggleCheckbox(item.item_id, item.is_checked)}
                          disabled={updating === item.item_id}
                          className="mt-0.5"
                        />
                        <label
                          htmlFor={item.item_id}
                          className={`flex-1 cursor-pointer text-sm leading-relaxed ${
                            item.is_checked ? 'text-muted-foreground line-through' : ''
                          }`}
                        >
                          {item.item_name}
                        </label>
                        {item.is_checked && (
                          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                        )}
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
