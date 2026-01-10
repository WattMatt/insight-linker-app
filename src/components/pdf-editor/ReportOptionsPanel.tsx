import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Settings, Palette, FileText, MessageSquare } from "lucide-react";
import { ReportCustomization } from "./types";

interface ReportOptionsPanelProps {
  customization: ReportCustomization;
  onChange: (updates: Partial<ReportCustomization>) => void;
}

const ACCENT_COLORS = [
  { value: 'blue', label: 'Blue', color: 'bg-blue-500' },
  { value: 'green', label: 'Green', color: 'bg-green-500' },
  { value: 'orange', label: 'Orange', color: 'bg-orange-500' },
  { value: 'red', label: 'Red', color: 'bg-red-500' },
  { value: 'purple', label: 'Purple', color: 'bg-purple-500' },
] as const;

export const ReportOptionsPanel: React.FC<ReportOptionsPanelProps> = ({
  customization,
  onChange,
}) => {
  return (
    <div className="space-y-4">
      {/* Styling Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Styling
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Accent Color</Label>
            <div className="flex gap-2">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color.value}
                  className={`w-8 h-8 rounded-full ${color.color} transition-all ${
                    customization.accentColor === color.value
                      ? "ring-2 ring-offset-2 ring-primary"
                      : "hover:scale-110"
                  }`}
                  onClick={() => onChange({ accentColor: color.value })}
                  title={color.label}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Document Options */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Document Options
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="toc" className="text-sm cursor-pointer">
              Table of Contents
            </Label>
            <Switch
              id="toc"
              checked={customization.includeTableOfContents}
              onCheckedChange={(checked) => 
                onChange({ includeTableOfContents: checked })
              }
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="pageNumbers" className="text-sm cursor-pointer">
              Page Numbers
            </Label>
            <Switch
              id="pageNumbers"
              checked={customization.includePageNumbers}
              onCheckedChange={(checked) => 
                onChange({ includePageNumbers: checked })
              }
            />
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="watermark" className="text-sm cursor-pointer">
                Watermark
              </Label>
              <Switch
                id="watermark"
                checked={customization.includeWatermark}
                onCheckedChange={(checked) => 
                  onChange({ includeWatermark: checked })
                }
              />
            </div>
            {customization.includeWatermark && (
              <Input
                value={customization.watermarkText}
                onChange={(e) => onChange({ watermarkText: e.target.value })}
                placeholder="DRAFT"
                className="mt-2"
              />
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Executive Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={customization.executiveSummary}
            onChange={(e) => onChange({ executiveSummary: e.target.value })}
            placeholder="Enter an executive summary to appear at the beginning of the report..."
            rows={4}
          />
        </CardContent>
      </Card>
      
      {/* Custom Notes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Report Notes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={customization.customNotes}
            onChange={(e) => onChange({ customNotes: e.target.value })}
            placeholder="Add any additional notes to include in the report footer..."
            rows={3}
          />
        </CardContent>
      </Card>
    </div>
  );
};
