import React, { useState } from 'react';
import { Download, Loader2, Eye, Settings2, FileText, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { 
  exportTemplateToPDF, 
  downloadTemplatePDF,
  TemplateData, 
  ExportOptions 
} from '@/lib/pdfTemplateExporter';

interface PDFTemplateExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: TemplateData | null;
}

const ACCENT_COLORS = [
  { value: 'blue', label: 'Blue', color: '#2563eb' },
  { value: 'green', label: 'Green', color: '#16a34a' },
  { value: 'orange', label: 'Orange', color: '#ea580c' },
  { value: 'red', label: 'Red', color: '#dc2626' },
  { value: 'purple', label: 'Purple', color: '#9333ea' },
] as const;

export const PDFTemplateExportDialog: React.FC<PDFTemplateExportDialogProps> = ({
  open,
  onOpenChange,
  template,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('options');
  
  const [options, setOptions] = useState<ExportOptions>({
    includeHeader: true,
    includeFooter: true,
    includeCoverPage: true,
    includeTableOfContents: true,
    accentColor: 'blue',
    watermark: '',
    companyName: 'Watson Mattheus',
    reportDate: new Date(),
    referenceNumber: '',
  });

  const updateOption = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const handlePreview = async () => {
    if (!template) return;
    
    setIsExporting(true);
    try {
      const blob = await exportTemplateToPDF(template, options);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setActiveTab('preview');
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Failed to generate preview');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = async () => {
    if (!template) return;
    
    setIsExporting(true);
    try {
      await downloadTemplatePDF(template, options);
      toast.success('PDF downloaded successfully');
      onOpenChange(false);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export Template to PDF
          </DialogTitle>
          <DialogDescription>
            Configure export options and preview the PDF before downloading
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="options" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              Options
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Preview
            </TabsTrigger>
          </TabsList>

          <TabsContent value="options" className="flex-1 overflow-y-auto mt-4 space-y-6">
            {/* Content Options */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                Content Options
              </h4>
              
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Cover Page</Label>
                    <p className="text-sm text-muted-foreground">Include branded cover page</p>
                  </div>
                  <Switch
                    checked={options.includeCoverPage}
                    onCheckedChange={(checked) => updateOption('includeCoverPage', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Table of Contents</Label>
                    <p className="text-sm text-muted-foreground">Auto-generated section index</p>
                  </div>
                  <Switch
                    checked={options.includeTableOfContents}
                    onCheckedChange={(checked) => updateOption('includeTableOfContents', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Page Headers</Label>
                    <p className="text-sm text-muted-foreground">Document title and page numbers</p>
                  </div>
                  <Switch
                    checked={options.includeHeader}
                    onCheckedChange={(checked) => updateOption('includeHeader', checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Page Footers</Label>
                    <p className="text-sm text-muted-foreground">Company name and date</p>
                  </div>
                  <Switch
                    checked={options.includeFooter}
                    onCheckedChange={(checked) => updateOption('includeFooter', checked)}
                  />
                </div>
              </div>
            </div>

            {/* Branding */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                Branding
              </h4>

              <div className="space-y-2">
                <Label>Accent Color</Label>
                <div className="flex gap-2">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => updateOption('accentColor', color.value)}
                      className={cn(
                        'w-10 h-10 rounded-lg transition-all ring-offset-2',
                        options.accentColor === color.value && 'ring-2 ring-primary'
                      )}
                      style={{ backgroundColor: color.color }}
                      title={color.label}
                    >
                      {options.accentColor === color.value && (
                        <CheckCircle className="h-5 w-5 text-white mx-auto" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={options.companyName}
                  onChange={(e) => updateOption('companyName', e.target.value)}
                  placeholder="Your company name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="watermark">Watermark (optional)</Label>
                <Input
                  id="watermark"
                  value={options.watermark}
                  onChange={(e) => updateOption('watermark', e.target.value)}
                  placeholder="e.g., DRAFT, CONFIDENTIAL"
                />
              </div>
            </div>

            {/* Document Info */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                Document Information
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reportDate">Report Date</Label>
                  <Input
                    id="reportDate"
                    type="date"
                    value={options.reportDate?.toISOString().split('T')[0]}
                    onChange={(e) => updateOption('reportDate', new Date(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referenceNumber">Reference Number</Label>
                  <Input
                    id="referenceNumber"
                    value={options.referenceNumber}
                    onChange={(e) => updateOption('referenceNumber', e.target.value)}
                    placeholder="e.g., INS-2026-001"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 overflow-hidden mt-4">
            {previewUrl ? (
              <iframe
                src={previewUrl}
                className="w-full h-[500px] border rounded-lg"
                title="PDF Preview"
              />
            ) : (
              <div className="h-[500px] border rounded-lg flex items-center justify-center bg-muted/50">
                <div className="text-center space-y-3">
                  <Eye className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Click "Generate Preview" to see the PDF
                  </p>
                  <Button onClick={handlePreview} disabled={isExporting}>
                    {isExporting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      'Generate Preview'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {activeTab === 'options' && (
            <Button onClick={handlePreview} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </>
              )}
            </Button>
          )}
          <Button onClick={handleDownload} disabled={isExporting || !template}>
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PDFTemplateExportDialog;
