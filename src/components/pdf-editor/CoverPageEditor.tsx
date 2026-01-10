import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FileText } from "lucide-react";
import { ReportCustomization } from "./types";

interface CoverPageEditorProps {
  customization: ReportCustomization;
  onChange: (updates: Partial<ReportCustomization>) => void;
  siteName: string;
  clientName: string;
}

export const CoverPageEditor: React.FC<CoverPageEditorProps> = ({
  customization,
  onChange,
  siteName,
  clientName,
}) => {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Cover Page
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="coverTitle">Report Title</Label>
          <Input
            id="coverTitle"
            value={customization.coverTitle}
            onChange={(e) => onChange({ coverTitle: e.target.value })}
            placeholder="Enter report title"
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="coverSubtitle">Subtitle</Label>
          <Input
            id="coverSubtitle"
            value={customization.coverSubtitle}
            onChange={(e) => onChange({ coverSubtitle: e.target.value })}
            placeholder="Enter subtitle"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="flex items-center gap-2">
            <Switch
              id="includeDate"
              checked={customization.includeDate}
              onCheckedChange={(checked) => onChange({ includeDate: checked })}
            />
            <Label htmlFor="includeDate" className="text-sm">
              Include Date
            </Label>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch
              id="includeReference"
              checked={customization.includeReference}
              onCheckedChange={(checked) => onChange({ includeReference: checked })}
            />
            <Label htmlFor="includeReference" className="text-sm">
              Include Reference #
            </Label>
          </div>
        </div>
        
        <div className="pt-2 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground mb-2">Preview</p>
          <div className="text-center space-y-1">
            <p className="font-bold text-sm">{customization.coverTitle || 'Report Title'}</p>
            <p className="text-xs text-muted-foreground">{customization.coverSubtitle}</p>
            <p className="text-xs font-medium">{siteName}</p>
            <p className="text-xs text-muted-foreground">{clientName}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
