import React, { useState, useCallback } from 'react';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X, Eye, Download, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { extractTemplateFromPDF, ExtractedTemplate, generateTemplatePreviewPDF } from '@/lib/pdfTemplateExtractor';
import { supabase } from '@/integrations/supabase/client';

interface PDFTemplateUploaderProps {
  onTemplateExtracted?: (template: ExtractedTemplate) => void;
  onTemplateSaved?: () => void;
  className?: string;
}

const TEMPLATE_CATEGORIES = [
  { value: 'General', label: 'General' },
  { value: 'Medium Voltage', label: 'Medium Voltage (MV)' },
  { value: 'Low Voltage', label: 'Low Voltage (LV)' },
  { value: 'Generator', label: 'Generator' },
  { value: 'Solar', label: 'Solar' },
  { value: 'Progress', label: 'Progress' },
  { value: 'Site Drawing', label: 'Site Drawing' },
];

export const PDFTemplateUploader: React.FC<PDFTemplateUploaderProps> = ({
  onTemplateExtracted,
  onTemplateSaved,
  className,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedTemplate, setExtractedTemplate] = useState<ExtractedTemplate | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editedTemplate, setEditedTemplate] = useState<ExtractedTemplate | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find(f => f.type === 'application/pdf');

    if (!pdfFile) {
      toast.error('Please upload a PDF file');
      return;
    }

    await processFile(pdfFile);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.error('Please upload a PDF file');
      return;
    }

    await processFile(file);
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    try {
      const template = await extractTemplateFromPDF(file);
      setExtractedTemplate(template);
      setEditedTemplate(template);
      onTemplateExtracted?.(template);
      toast.success('Template extracted successfully');
      setShowEditDialog(true);
    } catch (error) {
      console.error('Error extracting template:', error);
      toast.error('Failed to extract template from PDF');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePreview = async () => {
    if (!editedTemplate) return;

    try {
      const blob = await generateTemplatePreviewPDF(editedTemplate);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      window.open(url, '_blank');
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error('Failed to generate preview');
    }
  };

  const handleSaveTemplate = async () => {
    if (!editedTemplate) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('inspection_templates')
        .insert({
          name: editedTemplate.name,
          category: editedTemplate.category,
          description: editedTemplate.description,
          sections: editedTemplate.sections as any,
          cover_page: editedTemplate.cover_page as any,
          sections_count: editedTemplate.sections.length,
          pages_count: editedTemplate.metadata.pageCount,
        });

      if (error) throw error;

      toast.success('Template saved successfully');
      setShowEditDialog(false);
      setExtractedTemplate(null);
      setEditedTemplate(null);
      onTemplateSaved?.();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const updateEditedTemplate = (updates: Partial<ExtractedTemplate>) => {
    if (!editedTemplate) return;
    setEditedTemplate({ ...editedTemplate, ...updates });
  };

  const updateSection = (sectionId: string, updates: Partial<ExtractedTemplate['sections'][0]>) => {
    if (!editedTemplate) return;
    setEditedTemplate({
      ...editedTemplate,
      sections: editedTemplate.sections.map(s =>
        s.id === sectionId ? { ...s, ...updates } : s
      ),
    });
  };

  const removeSection = (sectionId: string) => {
    if (!editedTemplate) return;
    setEditedTemplate({
      ...editedTemplate,
      sections: editedTemplate.sections.filter(s => s.id !== sectionId),
    });
  };

  return (
    <>
      <Card className={cn('border-dashed', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import PDF Template
          </CardTitle>
          <CardDescription>
            Upload an existing PDF to extract its structure and create an editable template
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'relative border-2 border-dashed rounded-lg p-8 text-center transition-all',
              isDragging && 'border-primary bg-primary/5',
              !isDragging && 'border-muted-foreground/25 hover:border-primary/50'
            )}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Extracting template structure...</p>
              </div>
            ) : extractedTemplate ? (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle className="h-10 w-10 text-green-500" />
                <p className="font-medium">{extractedTemplate.name}</p>
                <p className="text-sm text-muted-foreground">
                  {extractedTemplate.sections.length} sections extracted
                </p>
                <div className="flex gap-2 mt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowEditDialog(true)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExtractedTemplate(null);
                      setEditedTemplate(null);
                    }}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium mb-1">Drop PDF here or click to browse</p>
                <p className="text-sm text-muted-foreground">
                  Supports PDF files up to 20MB
                </p>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Extracted Template</DialogTitle>
            <DialogDescription>
              Review and modify the extracted template before saving
            </DialogDescription>
          </DialogHeader>

          {editedTemplate && (
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Template Name</Label>
                    <Input
                      id="name"
                      value={editedTemplate.name}
                      onChange={(e) => updateEditedTemplate({ name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Select
                      value={editedTemplate.category}
                      onValueChange={(value) => updateEditedTemplate({ category: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TEMPLATE_CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={editedTemplate.description}
                    onChange={(e) => updateEditedTemplate({ description: e.target.value })}
                    rows={2}
                  />
                </div>

                {/* Cover Page */}
                {editedTemplate.cover_page && (
                  <div className="space-y-3">
                    <h4 className="font-medium">Cover Page</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="coverTitle">Title</Label>
                        <Input
                          id="coverTitle"
                          value={editedTemplate.cover_page.title}
                          onChange={(e) => updateEditedTemplate({
                            cover_page: { ...editedTemplate.cover_page!, title: e.target.value }
                          })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="coverSubtitle">Subtitle</Label>
                        <Input
                          id="coverSubtitle"
                          value={editedTemplate.cover_page.subtitle}
                          onChange={(e) => updateEditedTemplate({
                            cover_page: { ...editedTemplate.cover_page!, subtitle: e.target.value }
                          })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        value={editedTemplate.cover_page.company_name}
                        onChange={(e) => updateEditedTemplate({
                          cover_page: { ...editedTemplate.cover_page!, company_name: e.target.value }
                        })}
                      />
                    </div>
                  </div>
                )}

                {/* Sections */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Sections ({editedTemplate.sections.length})</h4>
                  </div>

                  {editedTemplate.sections.map((section, idx) => (
                    <Card key={section.id} className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{idx + 1}</Badge>
                            <Input
                              value={section.name}
                              onChange={(e) => updateSection(section.id, { name: e.target.value })}
                              className="flex-1"
                            />
                            <Badge variant="secondary">{section.type}</Badge>
                          </div>

                          {section.items && section.items.length > 0 && (
                            <div className="pl-6 space-y-1">
                              <p className="text-sm text-muted-foreground">
                                {section.items.length} items
                              </p>
                              <div className="text-sm text-muted-foreground">
                                {section.items.slice(0, 3).map((item, i) => (
                                  <div key={item.id} className="flex items-center gap-2">
                                    <span>•</span>
                                    <span>{item.name}</span>
                                    <Badge variant="outline" className="text-xs">
                                      {item.type}
                                    </Badge>
                                  </div>
                                ))}
                                {section.items.length > 3 && (
                                  <div className="text-muted-foreground">
                                    +{section.items.length - 3} more items
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {section.content && (
                            <Textarea
                              value={section.content}
                              onChange={(e) => updateSection(section.id, { content: e.target.value })}
                              rows={2}
                              className="text-sm"
                            />
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeSection(section.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>

                {/* Metadata */}
                <div className="text-sm text-muted-foreground border-t pt-4">
                  <p>Source: {editedTemplate.metadata.sourceFileName}</p>
                  <p>Pages: {editedTemplate.metadata.pageCount}</p>
                  <p>Extracted: {new Date(editedTemplate.metadata.extractedAt).toLocaleString()}</p>
                </div>
              </div>
            </ScrollArea>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={handlePreview}>
              <Eye className="h-4 w-4 mr-1" />
              Preview PDF
            </Button>
            <Button onClick={handleSaveTemplate} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Template'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default PDFTemplateUploader;
