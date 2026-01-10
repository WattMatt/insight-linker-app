import React from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { GripVertical, ChevronDown, ChevronUp, Edit2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReportSection } from "./types";

interface SectionToggleProps {
  section: ReportSection;
  onToggle: (id: string, enabled: boolean) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  isEditing?: boolean;
}

export const SectionToggle: React.FC<SectionToggleProps> = ({
  section,
  onToggle,
  onMoveUp,
  onMoveDown,
  onEdit,
  onDelete,
  canMoveUp = true,
  canMoveDown = true,
  isEditing = false,
}) => {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-3 rounded-lg border transition-all",
        section.enabled 
          ? "bg-card border-border" 
          : "bg-muted/50 border-border/50 opacity-60",
        isEditing && "ring-2 ring-primary"
      )}
    >
      <div className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </div>
      
      <Switch
        id={`section-${section.id}`}
        checked={section.enabled}
        onCheckedChange={(checked) => onToggle(section.id, checked)}
      />
      
      <div className="flex-1 min-w-0">
        <Label 
          htmlFor={`section-${section.id}`}
          className={cn(
            "font-medium cursor-pointer",
            !section.enabled && "text-muted-foreground"
          )}
        >
          {section.title}
        </Label>
        <p className="text-xs text-muted-foreground capitalize">
          {section.type} section
        </p>
      </div>
      
      <div className="flex items-center gap-1">
        {section.editable && onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
            disabled={!section.enabled}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </Button>
        )}
        
        <div className="flex flex-col">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-8"
            onClick={onMoveUp}
            disabled={!canMoveUp}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-8"
            onClick={onMoveDown}
            disabled={!canMoveDown}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
        
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
};
