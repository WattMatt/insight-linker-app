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
  Edit2
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
import { Label } from "@/components/ui/label";

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

const KPI_COLOR_OPTIONS = [
  { value: 'blue', primary: '#2563eb', light: '#dbeafe' },
  { value: 'green', primary: '#16a34a', light: '#dcfce7' },
  { value: 'orange', primary: '#ea580c', light: '#ffedd5' },
  { value: 'red', primary: '#dc2626', light: '#fee2e2' },
  { value: 'purple', primary: '#9333ea', light: '#f3e8ff' },
  { value: 'muted', primary: '#6b7280', light: '#f3f4f6' },
];

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

  if (disabled) {
    return (
      <span className={className} style={style}>
        {value || placeholder || '—'}
      </span>
    );
  }

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

// Editable column header component
interface EditableColumnHeaderProps {
  column: TableColumn;
  accentColor: { primary: string; light: string; text: string };
  onLabelChange: (newLabel: string) => void;
  onVisibilityToggle: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

const EditableColumnHeader: React.FC<EditableColumnHeaderProps> = ({
  column,
  accentColor,
  onLabelChange,
  onVisibilityToggle,
  onDelete,
  canDelete
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempLabel, setTempLabel] = useState(column.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  if (!column.visible) {
    return (
      <span 
        className="flex-1 text-xs opacity-50 line-through cursor-pointer hover:opacity-75 flex items-center gap-1 min-w-0"
        onClick={onVisibilityToggle}
      >
        <EyeOff className="h-2.5 w-2.5 flex-shrink-0" />
        <span className="truncate">{column.label}</span>
      </span>
    );
  }

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={tempLabel}
        onChange={(e) => setTempLabel(e.target.value)}
        onBlur={() => {
          onLabelChange(tempLabel);
          setIsEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onLabelChange(tempLabel);
            setIsEditing(false);
          } else if (e.key === 'Escape') {
            setTempLabel(column.label);
            setIsEditing(false);
          }
        }}
        className="flex-1 h-5 text-xs py-0 px-1 min-w-0"
      />
    );
  }

  return (
    <span 
      className="flex-1 text-xs font-medium cursor-text hover:bg-white/30 rounded px-0.5 transition-colors group flex items-center gap-1 min-w-0"
      style={{ color: accentColor.text }}
    >
      <span onClick={() => setIsEditing(true)} className="flex-1 truncate">
        {column.label}
      </span>
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
        <button 
          onClick={(e) => { e.stopPropagation(); onVisibilityToggle(); }}
          className="p-0.5 hover:bg-white/50 rounded"
        >
          <Eye className="h-2.5 w-2.5" />
        </button>
        {canDelete && (
          <button 
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-0.5 hover:bg-red-100 rounded text-red-500"
          >
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
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
  const [addColumnDialog, setAddColumnDialog] = useState<{ open: boolean; sectionId: string | null }>({ open: false, sectionId: null });
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newColumnField, setNewColumnField] = useState('');
  const [addKPIDialog, setAddKPIDialog] = useState<{ open: boolean; sectionId: string | null }>({ open: false, sectionId: null });
  const [newKPILabel, setNewKPILabel] = useState('');
  const [newKPIField, setNewKPIField] = useState('totalSubsections');

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

  const handleSectionTitleChange = (sectionId: string, newTitle: string) => {
    const updated = sections.map(s =>
      s.id === sectionId ? { ...s, title: newTitle } : s
    );
    onSectionsChange(updated);
  };

  const handleColumnLabelChange = (sectionId: string, columnId: string, newLabel: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.columns) {
        return {
          ...s,
          columns: s.columns.map(c => c.id === columnId ? { ...c, label: newLabel } : c)
        };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleColumnVisibilityToggle = (sectionId: string, columnId: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.columns) {
        return {
          ...s,
          columns: s.columns.map(c => c.id === columnId ? { ...c, visible: !c.visible } : c)
        };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleColumnDelete = (sectionId: string, columnId: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.columns) {
        return {
          ...s,
          columns: s.columns.filter(c => c.id !== columnId)
        };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleAddColumn = () => {
    if (!addColumnDialog.sectionId || !newColumnLabel.trim()) return;
    
    const updated = sections.map(s => {
      if (s.id === addColumnDialog.sectionId) {
        const newColumn: TableColumn = {
          id: `col-${Date.now()}`,
          label: newColumnLabel.trim(),
          field: newColumnField.trim() || newColumnLabel.toLowerCase().replace(/\s+/g, '_'),
          visible: true
        };
        return {
          ...s,
          columns: [...(s.columns || []), newColumn]
        };
      }
      return s;
    });
    onSectionsChange(updated);
    setAddColumnDialog({ open: false, sectionId: null });
    setNewColumnLabel('');
    setNewColumnField('');
  };

  const handleKPILabelChange = (sectionId: string, kpiId: string, newLabel: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.kpiItems) {
        return {
          ...s,
          kpiItems: s.kpiItems.map(k => k.id === kpiId ? { ...k, label: newLabel } : k)
        };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleKPIVisibilityToggle = (sectionId: string, kpiId: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.kpiItems) {
        return {
          ...s,
          kpiItems: s.kpiItems.map(k => k.id === kpiId ? { ...k, visible: !k.visible } : k)
        };
      }
      return s;
    });
    onSectionsChange(updated);
  };

  const handleKPIDelete = (sectionId: string, kpiId: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.kpiItems) {
        return {
          ...s,
          kpiItems: s.kpiItems.filter(k => k.id !== kpiId)
        };
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
          color: 'blue'
        };
        return {
          ...s,
          kpiItems: [...(s.kpiItems || []), newKPI]
        };
      }
      return s;
    });
    onSectionsChange(updated);
    setAddKPIDialog({ open: false, sectionId: null });
    setNewKPILabel('');
    setNewKPIField('totalSubsections');
  };

  // Get sample row data for a table section based on its ID
  const getSampleTableData = (sectionId: string): Record<string, string>[] => {
    switch (sectionId) {
      case 'subsections':
      case 'coc-status':
      case 'non-compliant':
      case 'expiring-cocs':
        return sampleData.subsections.length > 0 
          ? sampleData.subsections.map(sub => ({
              name: sub.name,
              tenant: sub.tenantName || '—',
              category: sub.category || '—',
              cocStatus: sub.cocStatus || 'Missing',
              documents: sub.documentCount.toString()
            }))
          : [
              { name: 'SHOP 001', tenant: 'Sample Tenant', category: 'LS', cocStatus: 'Pass', documents: '3' },
              { name: 'SHOP 002', tenant: 'Retail Store', category: 'Line Shop', cocStatus: 'Missing', documents: '1' },
              { name: 'SHOP 003', tenant: 'Food Court', category: 'LS', cocStatus: 'Pending', documents: '2' },
            ];
      case 'electrical-meters':
      case 'water-meters':
      case 'equipment':
        return sampleData.assets.length > 0
          ? sampleData.assets.map(asset => ({
              serial: asset.serialNumber || '—',
              premises: asset.premisesId,
              trade: asset.tradeAs || '—',
              breaker: asset.breakerSize || '—',
              ct: asset.ctRatio || '—',
              type: asset.meterType || '—'
            }))
          : [
              { serial: '35778057', premises: 'SHOP-001', trade: 'BULK METER', breaker: '1000A', ct: '1000/5A', type: 'CT' },
              { serial: '35778055', premises: 'SHOP-002', trade: 'SHOPRITE', breaker: '800A', ct: '800/5A', type: 'CT' },
              { serial: '36084016', premises: 'SHOP-003', trade: 'ACKERMANS', breaker: '63A', ct: '—', type: '3PH DIRECT' },
            ];
      case 'site-info':
        return sampleData.site ? [{
          name: sampleData.site.name,
          client: sampleData.site.clientName,
          address: sampleData.site.address || '—'
        }] : [{ name: 'Sample Site', client: 'Sample Client', address: '123 Sample Street' }];
      case 'inspections':
      case 'inspection-details':
        return sampleData.inspections.length > 0
          ? sampleData.inspections.map(insp => ({
              title: insp.title,
              status: insp.status,
              inspector: insp.inspectorName || '—',
              date: insp.inspectionDate ? format(new Date(insp.inspectionDate), 'dd MMM yyyy') : '—'
            }))
          : [
              { title: 'Electrical Inspection', status: 'Completed', inspector: 'John Smith', date: '10 Jan 2026' },
              { title: 'Safety Audit', status: 'In Progress', inspector: 'Jane Doe', date: '08 Jan 2026' },
            ];
      case 'findings':
        return [
          { finding: 'Exposed wiring in DB', severity: 'High', status: 'Open', location: 'Shop 003' },
          { finding: 'Missing cover plate', severity: 'Medium', status: 'Resolved', location: 'Shop 001' },
        ];
      case 'photos':
        return [
          { description: 'Before rectification', timestamp: '10:30 AM', location: 'Shop 003' },
          { description: 'After rectification', timestamp: '11:45 AM', location: 'Shop 003' },
        ];
      case 'signatures':
        return [
          { signer: 'Inspector', name: 'John Smith', date: '10 Jan 2026' },
          { signer: 'Client Rep', name: 'Jane Doe', date: '10 Jan 2026' },
        ];
      case 'pins-table':
        return [
          { pin: '1', type: 'Issue', status: 'Open', description: 'Damaged outlet' },
          { pin: '2', type: 'Note', status: 'Resolved', description: 'Wall repair needed' },
        ];
      case 'documents':
        return [
          { name: 'COC Certificate', type: 'PDF', uploaded: '05 Jan 2026', category: 'Compliance' },
          { name: 'Floor Plan', type: 'Image', uploaded: '03 Jan 2026', category: 'Site Documents' },
        ];
      default:
        return [];
    }
  };

  // Get KPI values for a section - with fallback sample data
  const getKPIValue = (field: string): number => {
    const values: Record<string, number> = {
      totalSubsections: sampleData.kpis.totalSubsections || 116,
      cocPass: sampleData.kpis.cocPass || 2,
      cocMissing: sampleData.kpis.cocMissing || 114,
      cocPending: sampleData.kpis.cocPending || 0,
      complianceRate: sampleData.kpis.complianceRate || 1.7,
      totalAssets: sampleData.kpis.totalAssets || 45,
      totalInspections: sampleData.kpis.totalInspections || 12,
      completedInspections: sampleData.kpis.completedInspections || 8,
    };
    return values[field] ?? 0;
  };

  // Auto-generate columns based on section if none exist
  const getColumnsForSection = (section: ReportSection): TableColumn[] => {
    if (section.columns && section.columns.length > 0) return section.columns;
    
    // Generate default columns based on section ID
    switch (section.id) {
      case 'subsections':
      case 'coc-status':
        return [
          { id: 'name', label: 'Shop Name', field: 'name', visible: true },
          { id: 'tenant', label: 'Tenant', field: 'tenant', visible: true },
          { id: 'category', label: 'Category', field: 'category', visible: true },
          { id: 'cocStatus', label: 'COC Status', field: 'cocStatus', visible: true },
        ];
      case 'documents':
        return [
          { id: 'name', label: 'Document Name', field: 'name', visible: true },
          { id: 'type', label: 'Type', field: 'type', visible: true },
          { id: 'category', label: 'Category', field: 'category', visible: true },
          { id: 'uploaded', label: 'Uploaded', field: 'uploaded', visible: true },
        ];
      case 'inspections':
      case 'inspection-details':
        return [
          { id: 'title', label: 'Title', field: 'title', visible: true },
          { id: 'status', label: 'Status', field: 'status', visible: true },
          { id: 'inspector', label: 'Inspector', field: 'inspector', visible: true },
          { id: 'date', label: 'Date', field: 'date', visible: true },
        ];
      case 'findings':
        return [
          { id: 'finding', label: 'Finding', field: 'finding', visible: true },
          { id: 'severity', label: 'Severity', field: 'severity', visible: true },
          { id: 'status', label: 'Status', field: 'status', visible: true },
        ];
      case 'photos':
        return [
          { id: 'description', label: 'Description', field: 'description', visible: true },
          { id: 'timestamp', label: 'Time', field: 'timestamp', visible: true },
          { id: 'location', label: 'Location', field: 'location', visible: true },
        ];
      case 'signatures':
        return [
          { id: 'signer', label: 'Signer Type', field: 'signer', visible: true },
          { id: 'name', label: 'Name', field: 'name', visible: true },
          { id: 'date', label: 'Date', field: 'date', visible: true },
        ];
      case 'pins-table':
        return [
          { id: 'pin', label: 'Pin #', field: 'pin', visible: true },
          { id: 'type', label: 'Type', field: 'type', visible: true },
          { id: 'status', label: 'Status', field: 'status', visible: true },
          { id: 'description', label: 'Description', field: 'description', visible: true },
        ];
      case 'expiring-cocs':
      case 'non-compliant':
        return [
          { id: 'name', label: 'Shop Name', field: 'name', visible: true },
          { id: 'tenant', label: 'Tenant', field: 'tenant', visible: true },
          { id: 'cocStatus', label: 'Status', field: 'cocStatus', visible: true },
        ];
      case 'equipment':
        return [
          { id: 'name', label: 'Equipment Name', field: 'name', visible: true },
          { id: 'type', label: 'Type', field: 'type', visible: true },
          { id: 'status', label: 'Status', field: 'status', visible: true },
        ];
      default:
        return [];
    }
  };

  const renderPageWrapper = (children: React.ReactNode, pageNum: number, key: string) => (
    <div 
      key={key}
      className="flex-shrink-0 w-[320px] bg-white rounded-lg shadow-lg overflow-hidden border relative group"
      style={{ aspectRatio: '210/297' }}
    >
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
        {/* Logo - Real client logo or placeholder */}
        {sampleData.loading ? (
          <Skeleton className="w-20 h-20 rounded mb-6" />
        ) : sampleData.site?.clientLogoUrl ? (
          <img 
            src={sampleData.site.clientLogoUrl} 
            alt="Client Logo"
            className="w-20 h-20 object-contain rounded mb-6"
          />
        ) : (
          <div className="w-20 h-20 rounded bg-muted flex items-center justify-center mb-6">
            <Building2 className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        
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
            {sampleData.loading ? (
              <>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{sampleData.site?.name || 'Sample Site'}</p>
                <p className="text-xs text-muted-foreground">{sampleData.site?.clientName || 'Sample Client'}</p>
              </>
            )}
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
              Date: {format(new Date(), "dd MMMM yyyy")}
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
              Reference: REF-2026-0001
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTableOfContents = () => {
    if (!customization.includeTableOfContents) return null;
    const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);
    
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

  const renderTableSection = (section: ReportSection) => {
    const columns = getColumnsForSection(section);
    const visibleColumns = columns.filter(c => c.visible);
    const rowData = getSampleTableData(section.id);

    if (sampleData.loading && rowData.length === 0) {
      return (
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      );
    }

    return (
      <div className="space-y-1 overflow-hidden">
        {/* Column Headers */}
        <div 
          className="flex text-xs font-medium p-1.5 rounded gap-1 items-center"
          style={{ backgroundColor: colors.light }}
        >
          {columns.map(col => (
            <EditableColumnHeader
              key={col.id}
              column={col}
              accentColor={colors}
              onLabelChange={(newLabel) => handleColumnLabelChange(section.id, col.id, newLabel)}
              onVisibilityToggle={() => handleColumnVisibilityToggle(section.id, col.id)}
              onDelete={() => handleColumnDelete(section.id, col.id)}
              canDelete={columns.length > 1}
            />
          ))}
          <button
            onClick={() => {
              setAddColumnDialog({ open: true, sectionId: section.id });
            }}
            className="flex-shrink-0 p-0.5 hover:bg-white/50 rounded text-muted-foreground hover:text-primary transition-colors"
            title="Add column"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        
        {/* Data Rows */}
        {rowData.length > 0 ? (
          rowData.slice(0, 4).map((row, rowIdx) => (
            <div key={rowIdx} className="flex text-xs p-1.5 border-b border-muted/50 gap-1">
              {visibleColumns.map(col => (
                <span key={col.id} className="flex-1 truncate text-muted-foreground min-w-0">
                  {row[col.field] || '—'}
                </span>
              ))}
            </div>
          ))
        ) : (
          <div className="text-xs text-muted-foreground italic text-center py-4">
            Sample data will appear here
          </div>
        )}
        
        {rowData.length > 4 && (
          <div className="text-xs text-muted-foreground text-center pt-1">
            +{rowData.length - 4} more rows
          </div>
        )}
      </div>
    );
  };

  const renderKPISection = (section: ReportSection) => {
    const kpiItems = section.kpiItems || [];

    if (sampleData.loading) {
      return (
        <div className="grid grid-cols-2 gap-2">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-16 rounded" />
          ))}
        </div>
      );
    }

    // Generate default KPIs if none exist
    const effectiveKPIs = kpiItems.length > 0 ? kpiItems : [
      { id: 'total', label: 'Total', field: 'totalSubsections', visible: true, color: 'blue' as const },
      { id: 'compliant', label: 'Compliant', field: 'cocPass', visible: true, color: 'green' as const },
      { id: 'pending', label: 'Pending', field: 'cocPending', visible: true, color: 'orange' as const },
      { id: 'issues', label: 'Issues', field: 'cocMissing', visible: true, color: 'red' as const },
    ];

    return (
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {effectiveKPIs.map((kpi) => {
            const value = getKPIValue(kpi.field);
            const isHidden = !kpi.visible;
            const kpiColor = KPI_COLOR_OPTIONS.find(c => c.value === kpi.color) || KPI_COLOR_OPTIONS[0];

            return (
              <div 
                key={kpi.id}
                className={cn(
                  "p-2 rounded text-center group relative",
                  isHidden && "opacity-40"
                )}
                style={{ backgroundColor: kpiColor.light }}
              >
                {/* Visibility toggle and delete */}
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
                  <button
                    onClick={() => handleKPIVisibilityToggle(section.id, kpi.id)}
                    className="p-0.5 hover:bg-white/50 rounded"
                  >
                    {kpi.visible ? (
                      <Eye className="h-2.5 w-2.5 text-muted-foreground" />
                    ) : (
                      <EyeOff className="h-2.5 w-2.5 text-muted-foreground" />
                    )}
                  </button>
                  {effectiveKPIs.length > 1 && (
                    <button
                      onClick={() => handleKPIDelete(section.id, kpi.id)}
                      className="p-0.5 hover:bg-red-100 rounded"
                    >
                      <Trash2 className="h-2.5 w-2.5 text-red-500" />
                    </button>
                  )}
                </div>

                <div className="text-xl font-bold" style={{ color: kpiColor.primary }}>
                  {kpi.field === 'complianceRate' ? `${value}%` : value}
                </div>
                <EditableText
                  value={kpi.label}
                  onChange={(newLabel) => handleKPILabelChange(section.id, kpi.id, newLabel)}
                  className="text-xs text-muted-foreground block"
                  disabled={isHidden}
                />
              </div>
            );
          })}
        </div>
        
        {/* Add KPI button */}
        <button
          onClick={() => setAddKPIDialog({ open: true, sectionId: section.id })}
          className="w-full p-2 border-2 border-dashed border-muted rounded text-xs text-muted-foreground hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-1"
        >
          <Plus className="h-3 w-3" />
          Add KPI
        </button>
      </div>
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
          !section.enabled && "opacity-40 grayscale"
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

        {/* Hidden badge */}
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
          {/* Editable section title */}
          <div className="flex items-center gap-2 mb-4 pb-2 border-b" style={{ borderColor: colors.light }}>
            <EditableText
              value={section.title}
              onChange={(v) => handleSectionTitleChange(section.id, v)}
              className="text-lg font-bold flex-1"
              style={{ color: colors.primary }}
              placeholder="Section Title"
            />
            <Edit2 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-50" />
          </div>
          
          {/* Section content based on type */}
          {section.type === 'table' && renderTableSection(section)}
          {section.type === 'kpi' && renderKPISection(section)}
          
          {(section.type === 'text' || section.type === 'summary') && (
            <div className="space-y-2 text-xs text-muted-foreground">
              <EditableText
                value={section.textContent || ''}
                onChange={(v) => {
                  const updated = sections.map(s =>
                    s.id === section.id ? { ...s, textContent: v } : s
                  );
                  onSectionsChange(updated);
                }}
                className="block w-full"
                placeholder="Click to add content..."
                multiline
              />
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
    const enabledSections = sections.filter(s => s.enabled);
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
  const sectionStartPage = 1 + (customization.includeTableOfContents ? 2 : 1);

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
        <div className="flex items-center gap-2">
          {sampleData.loading && (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading data...
            </Badge>
          )}
          <Badge variant="outline">
            {1 + (customization.includeTableOfContents ? 1 : 0) + 1 + sections.length + 1} pages
          </Badge>
        </div>
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
        Click on text to edit • Click column headers to rename • Use + to add columns/KPIs • Toggle visibility with eye icons • Hover over pages to show controls
      </p>

      {/* Add Column Dialog */}
      <Dialog open={addColumnDialog.open} onOpenChange={(open) => setAddColumnDialog({ open, sectionId: open ? addColumnDialog.sectionId : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Column</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="column-label">Column Header</Label>
              <Input
                id="column-label"
                value={newColumnLabel}
                onChange={(e) => setNewColumnLabel(e.target.value)}
                placeholder="e.g., Status, Notes, Date..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="column-field">Data Field (optional)</Label>
              <Input
                id="column-field"
                value={newColumnField}
                onChange={(e) => setNewColumnField(e.target.value)}
                placeholder="e.g., status, notes, created_at..."
              />
              <p className="text-xs text-muted-foreground">The database field this column maps to</p>
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
      <Dialog open={addKPIDialog.open} onOpenChange={(open) => setAddKPIDialog({ open, sectionId: open ? addKPIDialog.sectionId : null })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add KPI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="kpi-label">KPI Label</Label>
              <Input
                id="kpi-label"
                value={newKPILabel}
                onChange={(e) => setNewKPILabel(e.target.value)}
                placeholder="e.g., Total Sites, Compliance Rate..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kpi-field">Data Source</Label>
              <select
                id="kpi-field"
                value={newKPIField}
                onChange={(e) => setNewKPIField(e.target.value)}
                className="w-full p-2 border rounded-md text-sm"
              >
                <option value="totalSubsections">Total Subsections</option>
                <option value="cocPass">COC Pass Count</option>
                <option value="cocMissing">Missing COC Count</option>
                <option value="cocPending">Pending Count</option>
                <option value="complianceRate">Compliance Rate %</option>
                <option value="totalAssets">Total Assets</option>
                <option value="totalInspections">Total Inspections</option>
                <option value="completedInspections">Completed Inspections</option>
              </select>
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
