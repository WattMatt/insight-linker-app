import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Edit2, 
  Check, 
  X, 
  RotateCcw,
  MessageSquare,
  AlertCircle,
} from "lucide-react";
import { ReportSection, EditableField } from "./types";
import { cn } from "@/lib/utils";

interface SectionEditorProps {
  section: ReportSection;
  onUpdate: (sectionId: string, updates: Partial<ReportSection>) => void;
  onClose: () => void;
}

export const SectionEditor: React.FC<SectionEditorProps> = ({
  section,
  onUpdate,
  onClose,
}) => {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>("");
  const [notes, setNotes] = useState(section.notes || "");
  const [editedData, setEditedData] = useState<Record<string, any>>(
    section.data || {}
  );
  const [changes, setChanges] = useState<Set<string>>(new Set());

  const startEditing = (fieldId: string, currentValue: any) => {
    setEditingField(fieldId);
    setTempValue(String(currentValue || ""));
  };

  const saveField = (fieldId: string) => {
    const newData = { ...editedData };
    
    // Handle nested paths like "rows.0.value"
    const parts = fieldId.split(".");
    let current = newData;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = tempValue;
    
    setEditedData(newData);
    setChanges((prev) => new Set([...prev, fieldId]));
    setEditingField(null);
    
    onUpdate(section.id, { data: newData });
  };

  const cancelEditing = () => {
    setEditingField(null);
    setTempValue("");
  };

  const resetField = (fieldId: string, originalValue: any) => {
    const newData = { ...editedData };
    const parts = fieldId.split(".");
    let current = newData;
    for (let i = 0; i < parts.length - 1; i++) {
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = originalValue;
    
    setEditedData(newData);
    setChanges((prev) => {
      const next = new Set(prev);
      next.delete(fieldId);
      return next;
    });
    
    onUpdate(section.id, { data: newData });
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    onUpdate(section.id, { notes: value });
  };

  const renderTableEditor = () => {
    if (!section.data?.rows) return null;
    
    return (
      <div className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              {section.data.columns?.map((col: string, idx: number) => (
                <TableHead key={idx}>{col}</TableHead>
              ))}
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {section.data.rows.map((row: any, rowIdx: number) => (
              <TableRow key={rowIdx}>
                {Object.entries(row).map(([key, value], colIdx) => {
                  const fieldId = `rows.${rowIdx}.${key}`;
                  const isEditing = editingField === fieldId;
                  const hasChanged = changes.has(fieldId);
                  
                  return (
                    <TableCell 
                      key={colIdx}
                      className={cn(
                        "relative",
                        hasChanged && "bg-warning/10"
                      )}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={tempValue}
                            onChange={(e) => setTempValue(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveField(fieldId);
                              if (e.key === "Escape") cancelEditing();
                            }}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => saveField(fieldId)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={cancelEditing}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="cursor-pointer hover:bg-muted/50 px-1 rounded"
                          onClick={() => startEditing(fieldId, value)}
                        >
                          {String(value || "-")}
                        </span>
                      )}
                      {hasChanged && !isEditing && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="absolute right-0 top-1/2 -translate-y-1/2 h-5 w-5 opacity-50 hover:opacity-100"
                          onClick={() => resetField(fieldId, section.data?.rows?.[rowIdx]?.[key])}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => {
                      const firstKey = Object.keys(row)[0];
                      startEditing(`rows.${rowIdx}.${firstKey}`, row[firstKey]);
                    }}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderTextEditor = () => {
    const content = section.data?.content || "";
    const fieldId = "content";
    const isEditing = editingField === fieldId;
    
    return (
      <div className="space-y-2">
        <Label>Content</Label>
        {isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={tempValue}
              onChange={(e) => setTempValue(e.target.value)}
              rows={4}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveField(fieldId)}>
                <Check className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button size="sm" variant="outline" onClick={cancelEditing}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "p-3 bg-muted/50 rounded-lg cursor-pointer hover:bg-muted transition-colors min-h-[80px]",
              changes.has(fieldId) && "ring-2 ring-warning"
            )}
            onClick={() => startEditing(fieldId, content)}
          >
            <p className="text-sm whitespace-pre-wrap">{content || "Click to edit..."}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="border-primary">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Edit2 className="h-4 w-4" />
            Editing: {section.title}
          </CardTitle>
          <div className="flex items-center gap-2">
            {changes.size > 0 && (
              <Badge variant="outline" className="bg-warning/10 text-warning-foreground">
                <AlertCircle className="h-3 w-3 mr-1" />
                {changes.size} change{changes.size !== 1 ? "s" : ""}
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="max-h-[300px]">
          {section.type === "table" && renderTableEditor()}
          {section.type === "text" && renderTextEditor()}
          {section.type === "summary" && renderTextEditor()}
        </ScrollArea>
        
        <Separator />
        
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5" />
            Section Notes
          </Label>
          <Textarea
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Add notes for this section (will appear in the report)..."
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  );
};
