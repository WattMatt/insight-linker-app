import React, { useState, useRef, useEffect } from "react";
import { ReportCustomization, ReportSection } from "@/components/pdf-editor/types";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  GripVertical, 
  Eye, 
  EyeOff, 
  ChevronUp, 
  ChevronDown,
  Check,
  X,
  Palette,
  Plus,
  Trash2
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface PDFWYSIWYGEditorProps {
  customization: ReportCustomization;
  sections: ReportSection[];
  reportType: string;
  onCustomizationChange: (updates: Partial<ReportCustomization>) => void;
  onSectionsChange: (sections: ReportSection[]) => void;
}

const ACCENT_COLORS = [
  { value: 'blue', primary: '#2563eb', light: '#dbeafe', text: '#1e40af' },
  { value: 'green', primary: '#16a34a', light: '#dcfce7', text: '#166534' },
  { value: 'orange', primary: '#ea580c', light: '#ffedd5', text: '#c2410c' },
  { value: 'red', primary: '#dc2626', light: '#fee2e2', text: '#b91c1c' },
  { value: 'purple', primary: '#9333ea', light: '#f3e8ff', text: '#7e22ce' },
];

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
}

const EditableText: React.FC<EditableTextProps> = ({ 
  value, 
  onChange, 
  className, 
  placeholder,
  multiline = false,
  style 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = () => {
    onChange(tempValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="relative">
        {multiline ? (
          <Textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className={cn("text-xs resize-none", className)}
            rows={3}
            style={style}
          />
        ) : (
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            value={tempValue}
            onChange={(e) => setTempValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSave}
            className={cn("h-auto py-0.5 px-1 text-inherit font-inherit", className)}
            style={style}
          />
        )}
      </div>
    );
  }

  return (
    <span
      onClick={() => {
        setTempValue(value);
        setIsEditing(true);
      }}
      className={cn(
        "cursor-text hover:bg-primary/10 hover:outline hover:outline-2 hover:outline-primary/30 rounded px-0.5 transition-all",
        !value && "text-muted-foreground italic",
        className
      )}
      style={style}
    >
      {value || placeholder || 'Click to edit...'}
    </span>
  );
};

export const PDFWYSIWYGEditor: React.FC<PDFWYSIWYGEditorProps> = ({
  customization,
  sections,
  reportType,
  onCustomizationChange,
  onSectionsChange,
}) => {
  const colors = ACCENT_COLORS.find(c => c.value === customization.accentColor) || ACCENT_COLORS[0];
  const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);
  const [draggedSection, setDraggedSection] = useState<string | null>(null);

  const sampleData = {
    siteName: "Example Site Name",
    clientName: "Client Company Ltd",
    reference: "REF-2026-0001",
    date: format(new Date(), "dd MMMM yyyy"),
  };

  const handleSectionToggle = (sectionId: string) => {
    const updated = sections.map(s =>
      s.id === sectionId ? { ...s, enabled: !s.enabled } : s
    );
    onSectionsChange(updated);
  };

  const handleSectionMove = (sectionId: string, direction: 'up' | 'down') => {
    const sortedSections = [...sections].sort((a, b) => a.order - b.order);
    const currentIndex = sortedSections.findIndex(s => s.id === sectionId);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    
    if (newIndex < 0 || newIndex >= sortedSections.length) return;
    
    [sortedSections[currentIndex], sortedSections[newIndex]] = 
    [sortedSections[newIndex], sortedSections[currentIndex]];
    
    const reordered = sortedSections.map((s, i) => ({ ...s, order: i }));
    onSectionsChange(reordered);
  };

  const renderPageWrapper = (children: React.ReactNode, pageNum: number, key: string) => (
    <div 
      key={key}
      className="flex-shrink-0 w-[320px] bg-white rounded-lg shadow-lg overflow-hidden border relative group"
      style={{ aspectRatio: '210/297' }}
    >
      {/* Watermark */}
      {customization.includeWatermark && (
        <div 
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          style={{ 
            transform: 'rotate(-45deg)',
            fontSize: '40px',
            fontWeight: 'bold',
            color: 'rgba(0,0,0,0.04)',
            letterSpacing: '0.1em'
          }}
        >
          <EditableText
            value={customization.watermarkText}
            onChange={(v) => onCustomizationChange({ watermarkText: v })}
            className="pointer-events-auto"
          />
        </div>
      )}
      
      {children}
      
      {customization.includePageNumbers && (
        <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-muted-foreground">
          {pageNum}
        </div>
      )}
    </div>
  );

  const renderCoverPage = () => (
    <div 
      className="flex-shrink-0 w-[320px] bg-white rounded-lg shadow-lg overflow-hidden border relative group"
      style={{ aspectRatio: '210/297' }}
    >
      {/* Color picker for accent bar */}
      <Popover>
        <PopoverTrigger asChild>
          <div 
            className="h-4 cursor-pointer hover:opacity-80 transition-opacity relative group/bar"
            style={{ backgroundColor: colors.primary }}
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/bar:opacity-100 transition-opacity">
              <Palette className="h-3 w-3 text-white" />
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="flex gap-2">
            {ACCENT_COLORS.map(color => (
              <button
                key={color.value}
                onClick={() => onCustomizationChange({ accentColor: color.value as any })}
                className={cn(
                  "w-8 h-8 rounded-full transition-transform hover:scale-110",
                  customization.accentColor === color.value && "ring-2 ring-offset-2 ring-primary"
                )}
                style={{ backgroundColor: color.primary }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
      
      <div className="p-6 flex flex-col h-[calc(100%-16px)]">
        {/* Logo placeholder */}
        <div className="w-20 h-20 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground mb-6 hover:bg-muted/80 cursor-pointer transition-colors">
          Logo
        </div>
        
        {/* Title section - Editable */}
        <div className="flex-1 flex flex-col justify-center">
          <EditableText
            value={customization.coverTitle}
            onChange={(v) => onCustomizationChange({ coverTitle: v })}
            className="text-2xl font-bold mb-2 leading-tight block"
            style={{ color: colors.primary }}
            placeholder="Report Title"
          />
          <EditableText
            value={customization.coverSubtitle}
            onChange={(v) => onCustomizationChange({ coverSubtitle: v })}
            className="text-sm text-muted-foreground mb-6 block"
            placeholder="Subtitle"
          />
          
          <div className="space-y-1">
            <p className="text-sm font-medium">{sampleData.siteName}</p>
            <p className="text-xs text-muted-foreground">{sampleData.clientName}</p>
          </div>
        </div>
        
        {/* Footer info - Toggleable */}
        <div className="pt-4 border-t space-y-2 text-xs">
          <div 
            className={cn(
              "flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors",
              !customization.includeDate && "opacity-50"
            )}
            onClick={() => onCustomizationChange({ includeDate: !customization.includeDate })}
          >
            <Switch checked={customization.includeDate} className="scale-75" />
            <span className={customization.includeDate ? "" : "line-through"}>
              Date: {sampleData.date}
            </span>
          </div>
          <div 
            className={cn(
              "flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded p-1 -m-1 transition-colors",
              !customization.includeReference && "opacity-50"
            )}
            onClick={() => onCustomizationChange({ includeReference: !customization.includeReference })}
          >
            <Switch checked={customization.includeReference} className="scale-75" />
            <span className={customization.includeReference ? "" : "line-through"}>
              Reference: {sampleData.reference}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTableOfContents = () => {
    if (!customization.includeTableOfContents) return null;
    
    return renderPageWrapper(
      <div className="p-6">
        <h2 
          className="text-lg font-bold mb-4 pb-2 border-b"
          style={{ color: colors.primary, borderColor: colors.light }}
        >
          Table of Contents
        </h2>
        
        <div className="space-y-2">
          {enabledSections.map((section, idx) => (
            <div key={section.id} className="flex justify-between text-sm">
              <span className="truncate pr-2">{section.title}</span>
              <span className="text-muted-foreground">{idx + 2}</span>
            </div>
          ))}
        </div>
      </div>,
      1,
      'toc'
    );
  };

  const renderExecutiveSummary = () => {
    const hasContent = customization.executiveSummary?.trim();
    
    return renderPageWrapper(
      <div className="p-6 h-full flex flex-col">
        <h2 
          className="text-lg font-bold mb-4 pb-2 border-b"
          style={{ color: colors.primary, borderColor: colors.light }}
        >
          Executive Summary
        </h2>
        
        <div className="flex-1">
          <EditableText
            value={customization.executiveSummary}
            onChange={(v) => onCustomizationChange({ executiveSummary: v })}
            className="text-xs text-muted-foreground leading-relaxed block w-full h-full"
            placeholder="Click to add executive summary content that will appear in all reports of this type..."
            multiline
          />
        </div>
      </div>,
      customization.includeTableOfContents ? 2 : 1,
      'exec-summary'
    );
  };

  const renderSectionPage = (section: ReportSection, pageIndex: number) => {
    const sectionIndex = sections.findIndex(s => s.id === section.id);
    const canMoveUp = sectionIndex > 0;
    const canMoveDown = sectionIndex < sections.length - 1;

    return (
      <div 
        key={section.id}
        className={cn(
          "flex-shrink-0 w-[320px] bg-white rounded-lg shadow-lg overflow-hidden border relative group transition-all",
          !section.enabled && "opacity-40 grayscale",
          draggedSection === section.id && "ring-2 ring-primary"
        )}
        style={{ aspectRatio: '210/297' }}
      >
        {/* Section Controls Overlay */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-lg p-1 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleSectionMove(section.id, 'up')}
            disabled={!canMoveUp}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleSectionMove(section.id, 'down')}
            disabled={!canMoveDown}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-6 w-6", section.enabled ? "text-primary" : "text-muted-foreground")}
            onClick={() => handleSectionToggle(section.id)}
          >
            {section.enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </Button>
        </div>

        {/* Enabled/Disabled badge */}
        {!section.enabled && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60">
            <Badge variant="secondary" className="text-xs">
              <EyeOff className="h-3 w-3 mr-1" />
              Hidden
            </Badge>
          </div>
        )}

        {/* Watermark */}
        {customization.includeWatermark && section.enabled && (
          <div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ 
              transform: 'rotate(-45deg)',
              fontSize: '40px',
              fontWeight: 'bold',
              color: 'rgba(0,0,0,0.04)',
              letterSpacing: '0.1em'
            }}
          >
            {customization.watermarkText}
          </div>
        )}
        
        <div className="p-6">
          <h2 
            className="text-lg font-bold mb-4 pb-2 border-b"
            style={{ color: colors.primary, borderColor: colors.light }}
          >
            {section.title}
          </h2>
          
          {/* Section content preview */}
          {section.type === 'table' && (
            <div className="space-y-1">
              <div 
                className="flex text-xs font-medium p-1.5 rounded"
                style={{ backgroundColor: colors.light, color: colors.text }}
              >
                <span className="flex-1">Column 1</span>
                <span className="flex-1">Column 2</span>
                <span className="flex-1">Column 3</span>
              </div>
              {[1, 2, 3, 4].map(row => (
                <div key={row} className="flex text-xs p-1.5 border-b border-muted/50">
                  <span className="flex-1 text-muted-foreground">Data {row}A</span>
                  <span className="flex-1 text-muted-foreground">Data {row}B</span>
                  <span className="flex-1 text-muted-foreground">Data {row}C</span>
                </div>
              ))}
            </div>
          )}
          
          {section.type === 'kpi' && (
            <div className="grid grid-cols-2 gap-3">
              {['Total', 'Compliant', 'Pending', 'Issues'].map((label, i) => (
                <div 
                  key={label}
                  className="p-3 rounded text-center"
                  style={{ backgroundColor: colors.light }}
                >
                  <div className="text-lg font-bold" style={{ color: colors.primary }}>
                    {[42, 38, 3, 1][i]}
                  </div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          )}
          
          {(section.type === 'text' || section.type === 'summary') && (
            <div className="space-y-2 text-xs text-muted-foreground">
              <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
              <p>Ut enim ad minim veniam, quis nostrud exercitation.</p>
            </div>
          )}
          
          {section.type === 'chart' && (
            <div className="flex items-end justify-center gap-2 h-32 pt-4">
              {[60, 80, 45, 90, 70].map((height, i) => (
                <div
                  key={i}
                  className="w-8 rounded-t transition-all"
                  style={{ 
                    height: `${height}%`,
                    backgroundColor: i === 3 ? colors.primary : colors.light
                  }}
                />
              ))}
            </div>
          )}
        </div>
        
        {customization.includePageNumbers && section.enabled && (
          <div className="absolute bottom-3 left-0 right-0 text-center text-xs text-muted-foreground">
            {pageIndex}
          </div>
        )}
      </div>
    );
  };

  const renderNotesPage = () => {
    return renderPageWrapper(
      <div className="p-6 h-full flex flex-col">
        <h2 
          className="text-lg font-bold mb-4 pb-2 border-b"
          style={{ color: colors.primary, borderColor: colors.light }}
        >
          Notes
        </h2>
        
        <div className="flex-1">
          <EditableText
            value={customization.customNotes}
            onChange={(v) => onCustomizationChange({ customNotes: v })}
            className="text-xs text-muted-foreground leading-relaxed block w-full h-full"
            placeholder="Click to add notes that will appear at the end of all reports..."
            multiline
          />
        </div>
      </div>,
      enabledSections.length + (customization.includeTableOfContents ? 2 : 1) + 1,
      'notes'
    );
  };

  // Calculate page numbers
  let pageCounter = 1;
  const tocPageNum = customization.includeTableOfContents ? pageCounter++ : null;
  const execPageNum = pageCounter++;
  const sectionStartPage = pageCounter;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch 
              checked={customization.includeTableOfContents}
              onCheckedChange={(v) => onCustomizationChange({ includeTableOfContents: v })}
              id="toc-toggle"
            />
            <label htmlFor="toc-toggle" className="text-sm cursor-pointer">Table of Contents</label>
          </div>
          <div className="flex items-center gap-2">
            <Switch 
              checked={customization.includePageNumbers}
              onCheckedChange={(v) => onCustomizationChange({ includePageNumbers: v })}
              id="pagenum-toggle"
            />
            <label htmlFor="pagenum-toggle" className="text-sm cursor-pointer">Page Numbers</label>
          </div>
          <div className="flex items-center gap-2">
            <Switch 
              checked={customization.includeWatermark}
              onCheckedChange={(v) => onCustomizationChange({ includeWatermark: v })}
              id="watermark-toggle"
            />
            <label htmlFor="watermark-toggle" className="text-sm cursor-pointer">Watermark</label>
          </div>
        </div>
        <Badge variant="outline">
          {1 + (customization.includeTableOfContents ? 1 : 0) + 1 + sections.length + 1} pages
        </Badge>
      </div>

      {/* Page Preview Scroll Container */}
      <div className="bg-muted/20 rounded-lg p-6 overflow-x-auto">
        <div className="flex gap-6 pb-4" style={{ minWidth: 'max-content' }}>
          {/* Cover Page */}
          {renderCoverPage()}
          
          {/* Table of Contents */}
          {renderTableOfContents()}
          
          {/* Executive Summary */}
          {renderExecutiveSummary()}
          
          {/* Content Sections - All sections, sorted by order */}
          {sections
            .sort((a, b) => a.order - b.order)
            .map((section, idx) => renderSectionPage(
              section, 
              sectionStartPage + idx
            ))}
          
          {/* Notes Page */}
          {renderNotesPage()}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-xs text-muted-foreground text-center">
        Click on text to edit • Hover over pages to show controls • Click accent bar to change color • Toggle sections with the eye icon
      </p>
    </div>
  );
};
