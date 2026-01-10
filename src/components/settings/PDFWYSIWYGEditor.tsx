import React, { useState, useRef, useEffect } from "react";
import { ReportCustomization, ReportSection, TableColumn, KPIItem } from "@/components/pdf-editor/types";
import { useSampleReportData } from "@/hooks/useSampleReportData";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  Eye, 
  EyeOff, 
  ChevronUp, 
  ChevronDown,
  Palette,
  Building2,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  GripVertical,
  Calendar,
  Hash,
  MapPin,
  User,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings2
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface PDFWYSIWYGEditorProps {
  customization: ReportCustomization;
  sections: ReportSection[];
  reportType: string;
  onCustomizationChange: (updates: Partial<ReportCustomization>) => void;
  onSectionsChange: (sections: ReportSection[]) => void;
}

const ACCENT_COLORS = [
  { value: 'blue', primary: '#2563eb', light: '#dbeafe', text: '#1e40af', name: 'Blue' },
  { value: 'green', primary: '#16a34a', light: '#dcfce7', text: '#166534', name: 'Green' },
  { value: 'orange', primary: '#ea580c', light: '#ffedd5', text: '#c2410c', name: 'Orange' },
  { value: 'red', primary: '#dc2626', light: '#fee2e2', text: '#b91c1c', name: 'Red' },
  { value: 'purple', primary: '#9333ea', light: '#f3e8ff', text: '#7e22ce', name: 'Purple' },
];

const KPI_COLOR_OPTIONS = [
  { value: 'blue', primary: '#2563eb', light: '#dbeafe', name: 'Blue' },
  { value: 'green', primary: '#16a34a', light: '#dcfce7', name: 'Green' },
  { value: 'orange', primary: '#ea580c', light: '#ffedd5', name: 'Orange' },
  { value: 'red', primary: '#dc2626', light: '#fee2e2', name: 'Red' },
  { value: 'purple', primary: '#9333ea', light: '#f3e8ff', name: 'Purple' },
  { value: 'muted', primary: '#6b7280', light: '#f3f4f6', name: 'Gray' },
];

const KPI_FIELD_OPTIONS = [
  { value: 'totalSubsections', label: 'Total Subsections' },
  { value: 'cocPass', label: 'COC Pass Count' },
  { value: 'cocMissing', label: 'COC Missing Count' },
  { value: 'cocPending', label: 'COC Pending Count' },
  { value: 'complianceRate', label: 'Compliance Rate %' },
  { value: 'totalAssets', label: 'Total Assets' },
  { value: 'totalInspections', label: 'Total Inspections' },
  { value: 'completedInspections', label: 'Completed Inspections' },
];

// Inline editable text component
interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  style?: React.CSSProperties;
  disabled?: boolean;
}

const EditableText: React.FC<EditableTextProps> = ({ 
  value, 
  onChange, 
  className, 
  placeholder,
  multiline = false,
  style,
  disabled = false
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

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  const handleSave = () => {
    onChange(tempValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTempValue(value);
    setIsEditing(false);
  };

  if (disabled) {
    return <span className={className} style={style}>{value || placeholder || '—'}</span>;
  }

  if (isEditing) {
    return multiline ? (
      <Textarea
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Escape') handleCancel();
        }}
        className={cn("resize-none", className)}
        style={style}
        rows={4}
      />
    ) : (
      <Input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') handleCancel();
        }}
        className={cn("h-auto py-1", className)}
        style={style}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={cn(
        "cursor-text hover:bg-primary/10 px-1 py-0.5 rounded transition-all border border-transparent hover:border-primary/30",
        !value && "text-muted-foreground italic",
        className
      )}
      style={style}
      title="Click to edit"
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
  const sampleData = useSampleReportData(reportType as any);
  
  // Dialog states
  const [addColumnDialog, setAddColumnDialog] = useState<{ open: boolean; sectionId: string | null }>({ open: false, sectionId: null });
  const [addKPIDialog, setAddKPIDialog] = useState<{ open: boolean; sectionId: string | null }>({ open: false, sectionId: null });
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newKPILabel, setNewKPILabel] = useState('');
  const [newKPIField, setNewKPIField] = useState('totalSubsections');
  const [newKPIColor, setNewKPIColor] = useState('blue');

  // Section handlers
  const handleSectionToggle = (sectionId: string) => {
    const updated = sections.map(s => s.id === sectionId ? { ...s, enabled: !s.enabled } : s);
    onSectionsChange(updated);
  };

  const handleSectionMove = (sectionId: string, direction: 'up' | 'down') => {
    const sorted = [...sections].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(s => s.id === sectionId);
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= sorted.length) return;
    [sorted[idx], sorted[newIdx]] = [sorted[newIdx], sorted[idx]];
    onSectionsChange(sorted.map((s, i) => ({ ...s, order: i })));
  };

  const handleSectionTitleChange = (sectionId: string, title: string) => {
    const updated = sections.map(s => s.id === sectionId ? { ...s, title } : s);
    onSectionsChange(updated);
  };

  // Column handlers
  const handleColumnLabelChange = (sectionId: string, columnId: string, label: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.columns) {
        return { ...s, columns: s.columns.map(c => c.id === columnId ? { ...c, label } : c) };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleColumnVisibilityToggle = (sectionId: string, columnId: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.columns) {
        return { ...s, columns: s.columns.map(c => c.id === columnId ? { ...c, visible: !c.visible } : c) };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleColumnDelete = (sectionId: string, columnId: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.columns && s.columns.length > 1) {
        return { ...s, columns: s.columns.filter(c => c.id !== columnId) };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleAddColumn = () => {
    if (!addColumnDialog.sectionId || !newColumnLabel.trim()) return;
    const updated = sections.map(s => {
      if (s.id === addColumnDialog.sectionId) {
        const newCol: TableColumn = {
          id: `col-${Date.now()}`,
          label: newColumnLabel.trim(),
          field: newColumnLabel.toLowerCase().replace(/\s+/g, '_'),
          visible: true
        };
        return { ...s, columns: [...(s.columns || []), newCol] };
      }
      return s;
    });
    onSectionsChange(updated);
    setAddColumnDialog({ open: false, sectionId: null });
    setNewColumnLabel('');
  };

  // KPI handlers
  const handleKPILabelChange = (sectionId: string, kpiId: string, label: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.kpiItems) {
        return { ...s, kpiItems: s.kpiItems.map(k => k.id === kpiId ? { ...k, label } : k) };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleKPIVisibilityToggle = (sectionId: string, kpiId: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.kpiItems) {
        return { ...s, kpiItems: s.kpiItems.map(k => k.id === kpiId ? { ...k, visible: !k.visible } : k) };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleKPIDelete = (sectionId: string, kpiId: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.kpiItems && s.kpiItems.length > 1) {
        return { ...s, kpiItems: s.kpiItems.filter(k => k.id !== kpiId) };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleAddKPI = () => {
    if (!addKPIDialog.sectionId || !newKPILabel.trim()) return;
    const updated = sections.map(s => {
      if (s.id === addKPIDialog.sectionId) {
        const newKPI: KPIItem = {
          id: `kpi-${Date.now()}`,
          label: newKPILabel.trim(),
          field: newKPIField,
          visible: true,
          color: newKPIColor as any
        };
        return { ...s, kpiItems: [...(s.kpiItems || []), newKPI] };
      }
      return s;
    });
    onSectionsChange(updated);
    setAddKPIDialog({ open: false, sectionId: null });
    setNewKPILabel('');
    setNewKPIField('totalSubsections');
    setNewKPIColor('blue');
  };

  // Get sample data for tables
  const getSampleTableData = (sectionId: string): Record<string, string>[] => {
    if (sectionId.includes('subsection') || sectionId === 'coc-status') {
      return sampleData.subsections.length > 0
        ? sampleData.subsections.slice(0, 5).map(s => ({
            name: s.name,
            tenant: s.tenantName || '—',
            category: s.category || '—',
            cocStatus: s.cocStatus || 'Missing',
          }))
        : [
            { name: 'SHOP 001', tenant: 'Sample Store', category: 'LS', cocStatus: 'Pass' },
            { name: 'SHOP 002', tenant: 'Retail Outlet', category: 'Line Shop', cocStatus: 'Missing' },
            { name: 'SHOP 003', tenant: 'Food Court', category: 'LS', cocStatus: 'Pending' },
            { name: 'SHOP 004', tenant: 'Electronics Hub', category: 'Anchor', cocStatus: 'Pass' },
            { name: 'SHOP 005', tenant: 'Fashion Boutique', category: 'LS', cocStatus: 'Missing' },
          ];
    }
    if (sectionId.includes('meter') || sectionId.includes('asset')) {
      return sampleData.assets.length > 0
        ? sampleData.assets.slice(0, 5).map(a => ({
            serial: a.serialNumber || '—',
            premises: a.premisesId,
            trade: a.tradeAs || '—',
            breaker: a.breakerSize || '—',
            ct: a.ctRatio || '—',
          }))
        : [
            { serial: '35778057', premises: 'BULK METER', trade: 'YA-BULK', breaker: '1000A', ct: '1000/5A' },
            { serial: '35778055', premises: 'SHOP-050', trade: 'SHOPRITE', breaker: '800A', ct: '800/5A' },
            { serial: '36084016', premises: 'SHOP-004', trade: 'ACKERMANS', breaker: '63A', ct: '—' },
          ];
    }
    if (sectionId.includes('inspection')) {
      return sampleData.inspections.length > 0
        ? sampleData.inspections.slice(0, 5).map(i => ({
            title: i.title,
            status: i.status,
            inspector: i.inspectorName || '—',
            date: i.inspectionDate ? format(new Date(i.inspectionDate), 'dd MMM yyyy') : '—',
          }))
        : [
            { title: 'Electrical Inspection', status: 'Completed', inspector: 'John Smith', date: '10 Jan 2026' },
            { title: 'Safety Audit', status: 'In Progress', inspector: 'Jane Doe', date: '08 Jan 2026' },
          ];
    }
    if (sectionId.includes('document')) {
      return [
        { name: 'COC Certificate', type: 'PDF', category: 'Compliance', uploaded: '05 Jan 2026' },
        { name: 'Floor Plan', type: 'Image', category: 'Site Documents', uploaded: '03 Jan 2026' },
        { name: 'Test Report', type: 'PDF', category: 'Technical', uploaded: '01 Jan 2026' },
      ];
    }
    return [];
  };

  // Get KPI value
  const getKPIValue = (field: string): string | number => {
    const vals: Record<string, number> = {
      totalSubsections: sampleData.kpis.totalSubsections || 116,
      cocPass: sampleData.kpis.cocPass || 2,
      cocMissing: sampleData.kpis.cocMissing || 114,
      cocPending: sampleData.kpis.cocPending || 0,
      complianceRate: sampleData.kpis.complianceRate || 1.7,
      totalAssets: sampleData.kpis.totalAssets || 45,
      totalInspections: sampleData.kpis.totalInspections || 12,
      completedInspections: sampleData.kpis.completedInspections || 8,
    };
    const val = vals[field] ?? 0;
    return field === 'complianceRate' ? `${val}%` : val;
  };

  // Auto-generate columns if not defined
  const getColumnsForSection = (section: ReportSection): TableColumn[] => {
    if (section.columns?.length) return section.columns;
    
    if (section.id.includes('subsection') || section.id === 'coc-status') {
      return [
        { id: 'name', label: 'Shop Name', field: 'name', visible: true },
        { id: 'tenant', label: 'Tenant', field: 'tenant', visible: true },
        { id: 'category', label: 'Category', field: 'category', visible: true },
        { id: 'cocStatus', label: 'COC Status', field: 'cocStatus', visible: true },
      ];
    }
    if (section.id.includes('meter') || section.id.includes('asset')) {
      return [
        { id: 'serial', label: 'Serial Number', field: 'serial', visible: true },
        { id: 'premises', label: 'Premises ID', field: 'premises', visible: true },
        { id: 'trade', label: 'Trade As', field: 'trade', visible: true },
        { id: 'breaker', label: 'Breaker Size', field: 'breaker', visible: true },
        { id: 'ct', label: 'CT Ratio', field: 'ct', visible: true },
      ];
    }
    if (section.id.includes('inspection')) {
      return [
        { id: 'title', label: 'Title', field: 'title', visible: true },
        { id: 'status', label: 'Status', field: 'status', visible: true },
        { id: 'inspector', label: 'Inspector', field: 'inspector', visible: true },
        { id: 'date', label: 'Date', field: 'date', visible: true },
      ];
    }
    if (section.id.includes('document')) {
      return [
        { id: 'name', label: 'Document Name', field: 'name', visible: true },
        { id: 'type', label: 'Type', field: 'type', visible: true },
        { id: 'category', label: 'Category', field: 'category', visible: true },
        { id: 'uploaded', label: 'Uploaded', field: 'uploaded', visible: true },
      ];
    }
    return [
      { id: 'col1', label: 'Column 1', field: 'col1', visible: true },
      { id: 'col2', label: 'Column 2', field: 'col2', visible: true },
    ];
  };

  // Render Cover Page - Full width document style
  const renderCoverPage = () => (
    <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden">
      {/* Accent bar */}
      <Popover>
        <PopoverTrigger asChild>
          <div 
            className="h-3 cursor-pointer hover:opacity-80 transition-opacity relative group"
            style={{ backgroundColor: colors.primary }}
          >
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
              <Palette className="h-4 w-4 text-white" />
            </div>
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <p className="text-sm font-medium mb-2">Accent Color</p>
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
                title={color.name}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="p-8 md:p-12">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 mb-12">
          {/* Logo */}
          <div className="flex-shrink-0">
            {sampleData.loading ? (
              <Skeleton className="w-32 h-20 rounded" />
            ) : sampleData.site?.clientLogoUrl ? (
              <img 
                src={sampleData.site.clientLogoUrl} 
                alt="Client Logo"
                className="h-20 w-auto object-contain rounded"
              />
            ) : (
              <div 
                className="w-32 h-20 rounded flex flex-col items-center justify-center"
                style={{ backgroundColor: colors.light }}
              >
                <Building2 className="h-8 w-8 mb-1" style={{ color: colors.primary }} />
                <span className="text-xs" style={{ color: colors.text }}>Client Logo</span>
              </div>
            )}
          </div>

          {/* Settings panel */}
          <div className="flex flex-col gap-2 text-sm">
            <Label className="flex items-center gap-2 cursor-pointer">
              <Switch 
                checked={customization.includeDate}
                onCheckedChange={(v) => onCustomizationChange({ includeDate: v })}
              />
              Include Date
            </Label>
            <Label className="flex items-center gap-2 cursor-pointer">
              <Switch 
                checked={customization.includeReference}
                onCheckedChange={(v) => onCustomizationChange({ includeReference: v })}
              />
              Include Reference
            </Label>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4" style={{ color: colors.primary }}>
            <EditableText
              value={customization.coverTitle}
              onChange={(v) => onCustomizationChange({ coverTitle: v })}
              placeholder="Report Title"
              className="text-4xl md:text-5xl font-bold"
            />
          </h1>
          <p className="text-xl text-muted-foreground">
            <EditableText
              value={customization.coverSubtitle}
              onChange={(v) => onCustomizationChange({ coverSubtitle: v })}
              placeholder="Report Subtitle"
              className="text-xl"
            />
          </p>
        </div>

        {/* Site Info */}
        <div className="space-y-3 text-lg mb-12">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5" style={{ color: colors.primary }} />
            <span className="font-semibold">{sampleData.site?.name || 'Sample Site Name'}</span>
          </div>
          <div className="flex items-center gap-3">
            <User className="h-5 w-5" style={{ color: colors.primary }} />
            <span>{sampleData.site?.clientName || 'Client Name'}</span>
          </div>
          {sampleData.site?.address && (
            <div className="flex items-center gap-3">
              <MapPin className="h-5 w-5" style={{ color: colors.primary }} />
              <span className="text-muted-foreground">{sampleData.site.address}</span>
            </div>
          )}
        </div>

        {/* Date & Reference */}
        <div className="pt-6 border-t flex flex-wrap gap-6 text-sm text-muted-foreground">
          {customization.includeDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>{format(new Date(), 'dd MMMM yyyy')}</span>
            </div>
          )}
          {customization.includeReference && (
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4" />
              <span>REF-{format(new Date(), 'yyyy')}-{String(Math.floor(Math.random() * 9999)).padStart(4, '0')}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render Table of Contents
  const renderTableOfContents = () => {
    if (!customization.includeTableOfContents) return null;
    const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);
    
    return (
      <div className="bg-white rounded-lg shadow-md p-8 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: colors.primary }}>Table of Contents</h2>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => onCustomizationChange({ includeTableOfContents: false })}
          >
            <EyeOff className="h-4 w-4 mr-1" />
            Hide
          </Button>
        </div>
        <div className="space-y-3">
          {enabledSections.map((section, idx) => (
            <div key={section.id} className="flex justify-between items-center py-2 border-b border-dashed">
              <span>{idx + 1}. {section.title}</span>
              <span className="text-muted-foreground text-sm">Page {idx + 2}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render Executive Summary
  const renderExecutiveSummary = () => (
    <div className="bg-white rounded-lg shadow-md p-8 mb-6">
      <h2 className="text-2xl font-bold mb-4" style={{ color: colors.primary }}>Executive Summary</h2>
      <Textarea
        value={customization.executiveSummary}
        onChange={(e) => onCustomizationChange({ executiveSummary: e.target.value })}
        placeholder="Enter executive summary content that will appear in all reports of this type. This section provides a high-level overview of the report findings..."
        className="min-h-[120px] border-dashed"
      />
    </div>
  );

  // Render a Table Section
  const renderTableSection = (section: ReportSection) => {
    const columns = getColumnsForSection(section);
    const visibleColumns = columns.filter(c => c.visible);
    const data = getSampleTableData(section.id);

    return (
      <div 
        key={section.id}
        className={cn(
          "bg-white rounded-lg shadow-md p-8 mb-6 transition-opacity",
          !section.enabled && "opacity-50"
        )}
      >
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: colors.primary }}>
            <EditableText
              value={section.title}
              onChange={(v) => handleSectionTitleChange(section.id, v)}
              className="text-2xl font-bold"
            />
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => handleSectionMove(section.id, 'up')}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleSectionMove(section.id, 'down')}>
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleSectionToggle(section.id)}>
              {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: colors.light }}>
                {columns.map((col) => (
                  <th 
                    key={col.id} 
                    className={cn(
                      "px-4 py-3 text-left border-b group",
                      !col.visible && "opacity-50 bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <EditableText
                        value={col.label}
                        onChange={(v) => handleColumnLabelChange(section.id, col.id, v)}
                        className="font-semibold text-sm"
                        style={{ color: colors.text }}
                      />
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleColumnVisibilityToggle(section.id, col.id)}
                          className="p-1 hover:bg-white/50 rounded"
                          title={col.visible ? "Hide column" : "Show column"}
                        >
                          {col.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        </button>
                        {columns.length > 1 && (
                          <button
                            onClick={() => handleColumnDelete(section.id, col.id)}
                            className="p-1 hover:bg-red-100 rounded text-red-600"
                            title="Remove column"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </th>
                ))}
                <th className="px-2 py-3 border-b w-10" style={{ backgroundColor: colors.light }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAddColumnDialog({ open: true, sectionId: section.id })}
                    className="h-6 w-6 p-0"
                    title="Add column"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-muted/30">
                  {visibleColumns.map((col) => (
                    <td key={col.id} className="px-4 py-3 border-b text-sm">
                      {col.field === 'cocStatus' || col.field === 'status' ? (
                        <Badge variant={
                          row[col.field] === 'Pass' || row[col.field] === 'Completed' ? 'default' :
                          row[col.field] === 'Missing' ? 'destructive' : 'secondary'
                        }>
                          {row[col.field] || '—'}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">{row[col.field] || '—'}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-2 py-3 border-b"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Hidden columns indicator */}
        {columns.filter(c => !c.visible).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Hidden columns:</span>
            {columns.filter(c => !c.visible).map(col => (
              <Badge 
                key={col.id} 
                variant="outline" 
                className="text-xs cursor-pointer hover:bg-muted"
                onClick={() => handleColumnVisibilityToggle(section.id, col.id)}
              >
                <EyeOff className="h-3 w-3 mr-1" />
                {col.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render a KPI Section
  const renderKPISection = (section: ReportSection) => {
    const kpis = section.kpiItems || [
      { id: 'total', label: 'Total', field: 'totalSubsections', visible: true, color: 'blue' },
      { id: 'pass', label: 'Compliant', field: 'cocPass', visible: true, color: 'green' },
      { id: 'missing', label: 'Missing', field: 'cocMissing', visible: true, color: 'orange' },
      { id: 'rate', label: 'Compliance Rate', field: 'complianceRate', visible: true, color: 'purple' },
    ];
    const visibleKPIs = kpis.filter(k => k.visible);

    return (
      <div 
        key={section.id}
        className={cn(
          "bg-white rounded-lg shadow-md p-8 mb-6 transition-opacity",
          !section.enabled && "opacity-50"
        )}
      >
        {/* Section Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold" style={{ color: colors.primary }}>
            <EditableText
              value={section.title}
              onChange={(v) => handleSectionTitleChange(section.id, v)}
              className="text-2xl font-bold"
            />
          </h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => handleSectionMove(section.id, 'up')}>
              <ChevronUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleSectionMove(section.id, 'down')}>
              <ChevronDown className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleSectionToggle(section.id)}>
              {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {visibleKPIs.map((kpi) => {
            const kpiColor = KPI_COLOR_OPTIONS.find(c => c.value === kpi.color) || KPI_COLOR_OPTIONS[0];
            return (
              <div 
                key={kpi.id}
                className="p-6 rounded-lg border-2 relative group transition-shadow hover:shadow-md"
                style={{ backgroundColor: kpiColor.light, borderColor: `${kpiColor.primary}30` }}
              >
                {/* Controls */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleKPIVisibilityToggle(section.id, kpi.id)}
                    className="p-1 hover:bg-white/50 rounded"
                    title="Hide KPI"
                  >
                    <Eye className="h-3 w-3" />
                  </button>
                  {kpis.length > 1 && (
                    <button
                      onClick={() => handleKPIDelete(section.id, kpi.id)}
                      className="p-1 hover:bg-red-100 rounded text-red-600"
                      title="Remove KPI"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="text-4xl font-bold mb-2" style={{ color: kpiColor.primary }}>
                  {getKPIValue(kpi.field)}
                </div>
                <EditableText
                  value={kpi.label}
                  onChange={(v) => handleKPILabelChange(section.id, kpi.id, v)}
                  className="text-sm font-medium text-muted-foreground"
                />
              </div>
            );
          })}

          {/* Add KPI button */}
          <button
            onClick={() => setAddKPIDialog({ open: true, sectionId: section.id })}
            className="p-6 rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center hover:border-primary/50 hover:bg-muted/30 transition-all"
          >
            <Plus className="h-8 w-8 text-muted-foreground mb-2" />
            <span className="text-sm text-muted-foreground">Add KPI</span>
          </button>
        </div>

        {/* Hidden KPIs */}
        {kpis.filter(k => !k.visible).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground">Hidden KPIs:</span>
            {kpis.filter(k => !k.visible).map(kpi => (
              <Badge 
                key={kpi.id} 
                variant="outline" 
                className="text-xs cursor-pointer hover:bg-muted"
                onClick={() => handleKPIVisibilityToggle(section.id, kpi.id)}
              >
                <EyeOff className="h-3 w-3 mr-1" />
                {kpi.label}
              </Badge>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render a Text Section
  const renderTextSection = (section: ReportSection) => (
    <div 
      key={section.id}
      className={cn(
        "bg-white rounded-lg shadow-md p-8 mb-6 transition-opacity",
        !section.enabled && "opacity-50"
      )}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold" style={{ color: colors.primary }}>
          <EditableText
            value={section.title}
            onChange={(v) => handleSectionTitleChange(section.id, v)}
            className="text-2xl font-bold"
          />
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => handleSectionMove(section.id, 'up')}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleSectionMove(section.id, 'down')}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleSectionToggle(section.id)}>
            {section.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <Textarea
        value={section.textContent || ''}
        onChange={(e) => {
          const updated = sections.map(s => s.id === section.id ? { ...s, textContent: e.target.value } : s);
          onSectionsChange(updated);
        }}
        placeholder="Enter text content for this section. Notes, observations, or any additional information..."
        className="min-h-[100px] border-dashed"
      />
    </div>
  );

  // Render Custom Notes
  const renderCustomNotes = () => (
    <div className="bg-white rounded-lg shadow-md p-8 mb-6">
      <h2 className="text-2xl font-bold mb-4" style={{ color: colors.primary }}>Notes & Observations</h2>
      <Textarea
        value={customization.customNotes}
        onChange={(e) => onCustomizationChange({ customNotes: e.target.value })}
        placeholder="Add any notes or observations that should appear at the end of all reports of this type..."
        className="min-h-[100px] border-dashed"
      />
    </div>
  );

  // Render a section based on type
  const renderSection = (section: ReportSection) => {
    switch (section.type) {
      case 'table':
        return renderTableSection(section);
      case 'kpi':
        return renderKPISection(section);
      case 'text':
        return renderTextSection(section);
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-4 bg-muted/30 border-b flex-wrap">
        <div className="flex items-center gap-4">
          <Label className="flex items-center gap-2 cursor-pointer">
            <Switch 
              checked={customization.includeTableOfContents}
              onCheckedChange={(v) => onCustomizationChange({ includeTableOfContents: v })}
            />
            <span className="text-sm">Table of Contents</span>
          </Label>
          <Label className="flex items-center gap-2 cursor-pointer">
            <Switch 
              checked={customization.includePageNumbers}
              onCheckedChange={(v) => onCustomizationChange({ includePageNumbers: v })}
            />
            <span className="text-sm">Page Numbers</span>
          </Label>
          <Label className="flex items-center gap-2 cursor-pointer">
            <Switch 
              checked={customization.includeWatermark}
              onCheckedChange={(v) => onCustomizationChange({ includeWatermark: v })}
            />
            <span className="text-sm">Watermark</span>
          </Label>
          {customization.includeWatermark && (
            <Input
              value={customization.watermarkText}
              onChange={(e) => onCustomizationChange({ watermarkText: e.target.value })}
              placeholder="Watermark text"
              className="w-32 h-8"
            />
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          Click on any text to edit • Changes apply to all future reports
        </div>
      </div>

      {/* Document Preview */}
      <ScrollArea className="flex-1 bg-muted/50">
        <div className="max-w-4xl mx-auto py-8 px-4">
          {sampleData.loading ? (
            <div className="space-y-6">
              <Skeleton className="h-64 w-full rounded-lg" />
              <Skeleton className="h-48 w-full rounded-lg" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
          ) : (
            <>
              {renderCoverPage()}
              {renderTableOfContents()}
              {renderExecutiveSummary()}
              {sections
                .sort((a, b) => a.order - b.order)
                .map(section => renderSection(section))}
              {renderCustomNotes()}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Add Column Dialog */}
      <Dialog open={addColumnDialog.open} onOpenChange={(open) => setAddColumnDialog({ open, sectionId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Column Label</Label>
              <Input
                value={newColumnLabel}
                onChange={(e) => setNewColumnLabel(e.target.value)}
                placeholder="e.g., Last Updated"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddColumnDialog({ open: false, sectionId: null })}>
              Cancel
            </Button>
            <Button onClick={handleAddColumn} disabled={!newColumnLabel.trim()}>
              Add Column
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add KPI Dialog */}
      <Dialog open={addKPIDialog.open} onOpenChange={(open) => setAddKPIDialog({ open, sectionId: null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add KPI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>KPI Label</Label>
              <Input
                value={newKPILabel}
                onChange={(e) => setNewKPILabel(e.target.value)}
                placeholder="e.g., Expiring COCs"
              />
            </div>
            <div className="space-y-2">
              <Label>Data Source</Label>
              <Select value={newKPIField} onValueChange={setNewKPIField}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KPI_FIELD_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {KPI_COLOR_OPTIONS.map(color => (
                  <button
                    key={color.value}
                    onClick={() => setNewKPIColor(color.value)}
                    className={cn(
                      "w-8 h-8 rounded-full transition-transform hover:scale-110",
                      newKPIColor === color.value && "ring-2 ring-offset-2 ring-primary"
                    )}
                    style={{ backgroundColor: color.primary }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddKPIDialog({ open: false, sectionId: null })}>
              Cancel
            </Button>
            <Button onClick={handleAddKPI} disabled={!newKPILabel.trim()}>
              Add KPI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
