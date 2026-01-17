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
import { 
  Eye, 
  EyeOff, 
  ChevronUp, 
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Palette,
  Building2,
  Plus,
  Trash2,
  Calendar,
  Hash,
  MapPin,
  User,
  FileText,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Pencil,
  Database
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

// A4 dimensions in pixels (at 96 DPI)
const A4_WIDTH = 595;
const A4_HEIGHT = 842;

// ============================================
// PLACEHOLDER DATA COMPONENT
// Shows data that will be replaced with real values when generating PDF
// ============================================
interface PlaceholderDataProps {
  value: React.ReactNode;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

const PlaceholderData: React.FC<PlaceholderDataProps> = ({ 
  value, 
  label, 
  className, 
  style,
}) => (
  <span
    className={cn(
      "relative inline-block border border-dashed border-amber-400/50 bg-amber-50/30 rounded px-0.5 py-px",
      "hover:border-amber-500 hover:bg-amber-100/40 transition-all group cursor-default",
      className
    )}
    style={style}
    title={`Sample data${label ? ` for "${label}"` : ''} – will be replaced with actual values when generating PDF`}
  >
    {value}
    <span className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-3 h-3 bg-amber-100 rounded-full border border-amber-400 z-10">
      <Database className="w-1.5 h-1.5 text-amber-600" />
    </span>
  </span>
);

// ============================================
// EDITABLE CELL COMPONENT
// Template fields that can be customized and persist in the template
// ============================================
interface EditableCellProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
}

const EditableCell: React.FC<EditableCellProps> = ({ value, onChange, className, style, multiline }) => {
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

  if (isEditing) {
    return multiline ? (
      <textarea
        ref={inputRef as any}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => e.key === 'Escape' && setIsEditing(false)}
        className={cn("w-full border border-primary rounded px-1 py-0.5 text-inherit resize-none bg-white focus:ring-2 focus:ring-primary/20", className)}
        style={style}
        rows={3}
      />
    ) : (
      <input
        ref={inputRef as any}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') setIsEditing(false);
        }}
        className={cn("w-full border border-primary rounded px-1 py-0.5 text-inherit bg-white focus:ring-2 focus:ring-primary/20", className)}
        style={style}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={cn(
        "relative cursor-pointer hover:bg-blue-50 border border-transparent hover:border-blue-300 px-1 py-0.5 rounded transition-all inline-block group",
        !value && "text-gray-400 italic",
        className
      )}
      style={style}
      title="Click to edit this template field"
    >
      {value || 'Click to edit'}
      <span className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-3 h-3 bg-blue-100 rounded-full border border-blue-400 z-10">
        <Pencil className="w-1.5 h-1.5 text-blue-600" />
      </span>
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
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(0.8);
  
  // Dialog states
  const [addColumnDialog, setAddColumnDialog] = useState<{ open: boolean; sectionId: string | null }>({ open: false, sectionId: null });
  const [addKPIDialog, setAddKPIDialog] = useState<{ open: boolean; sectionId: string | null }>({ open: false, sectionId: null });
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newKPILabel, setNewKPILabel] = useState('');
  const [newKPIField, setNewKPIField] = useState('totalSubsections');
  const [newKPIColor, setNewKPIColor] = useState('blue');

  // Sample data for mock content - using real data from first project
  const siteName = sampleData.site?.name || 'Evaton Mall';
  const clientName = sampleData.site?.clientName || 'Fortress Fund Managers';
  const siteAddress = sampleData.site?.address || 'Golden Highway, Evaton West, Gauteng';
  const clientLogo = sampleData.site?.clientLogoUrl;

  // Get subsections data
  const subsectionsData = sampleData.subsections.length > 0 
    ? sampleData.subsections 
    : [
        { name: 'SHOP 001', tenantName: 'RUSSELS', category: 'LS', cocStatus: 'Pass' },
        { name: 'SHOP 002', tenantName: 'NB CELLULAR', category: 'LS', cocStatus: 'Missing' },
        { name: 'SHOP 003', tenantName: 'JEFFREY MEYER OPTOMETRIST', category: 'LS', cocStatus: 'Pass' },
        { name: 'SHOP T005A', tenantName: 'YOUBAR HAIR AND NAILS', category: 'Line Shop', cocStatus: 'Missing' },
        { name: 'SHOP F02', tenantName: 'FOOD LOVERS MARKET', category: 'Anchor', cocStatus: 'Pending' },
        { name: 'SHOP L01A', tenantName: 'CLICKS PHARMACY', category: 'LS', cocStatus: 'Pass' },
        { name: 'SHOP L02', tenantName: 'PEP STORES', category: 'LS', cocStatus: 'Missing' },
        { name: 'SHOP L03', tenantName: 'CASH CRUSADERS', category: 'LS', cocStatus: 'Missing' },
      ];

  // Get assets data
  const assetsData = sampleData.assets.length > 0
    ? sampleData.assets
    : [
        { serialNumber: '35778057', premisesId: 'YA - BULK METER', tradeAs: 'BULK SUPPLY', breakerSize: '1000A', ctRatio: '1000/5A' },
        { serialNumber: '35778055', premisesId: 'YA - SHOP 050', tradeAs: 'SHOPRITE', breakerSize: '800A', ctRatio: '800/5A' },
        { serialNumber: '36084016', premisesId: 'YA - SHOP 004', tradeAs: 'ACKERMANS', breakerSize: '63A', ctRatio: '—' },
      ];

  // KPI values
  const kpiValues = {
    totalSubsections: sampleData.kpis.totalSubsections || 116,
    cocPass: sampleData.kpis.cocPass || 2,
    cocMissing: sampleData.kpis.cocMissing || 114,
    cocPending: sampleData.kpis.cocPending || 0,
    complianceRate: sampleData.kpis.complianceRate || 1.7,
    totalAssets: sampleData.kpis.totalAssets || 45,
  };

  // Handlers
  const handleSectionTitleChange = (sectionId: string, title: string) => {
    const updated = sections.map(s => s.id === sectionId ? { ...s, title } : s);
    onSectionsChange(updated);
  };

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

  const handleKPILabelChange = (sectionId: string, kpiId: string, label: string) => {
    const updated = sections.map(s => {
      if (s.id === sectionId && s.kpiItems) {
        return { ...s, kpiItems: s.kpiItems.map(k => k.id === kpiId ? { ...k, label } : k) };
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
  };

  // Page wrapper with A4 aspect ratio
  const PageWrapper: React.FC<{ children: React.ReactNode; pageNum: number }> = ({ children, pageNum }) => (
    <div 
      className="bg-white shadow-xl relative flex-shrink-0"
      style={{ 
        width: A4_WIDTH * zoom, 
        height: A4_HEIGHT * zoom,
        transform: `scale(1)`,
        transformOrigin: 'top center'
      }}
    >
      {/* Watermark */}
      {customization.includeWatermark && (
        <div 
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ 
            transform: 'rotate(-45deg)',
            fontSize: 48 * zoom,
            fontWeight: 'bold',
            color: 'rgba(0,0,0,0.04)',
            letterSpacing: '0.1em'
          }}
        >
          {customization.watermarkText || 'DRAFT'}
        </div>
      )}
      
      {/* Content */}
      <div className="absolute inset-0 overflow-hidden" style={{ padding: 40 * zoom }}>
        {children}
      </div>
      
      {/* Page number */}
      {customization.includePageNumbers && (
        <div 
          className="absolute bottom-4 left-0 right-0 text-center text-gray-400"
          style={{ fontSize: 10 * zoom }}
        >
          Page {pageNum}
        </div>
      )}
    </div>
  );

  // Cover Page
  const renderCoverPage = () => (
    <PageWrapper pageNum={1}>
      {/* Top accent bar */}
      <Popover>
        <PopoverTrigger asChild>
          <div 
            className="absolute top-0 left-0 right-0 cursor-pointer hover:opacity-80 transition-opacity"
            style={{ height: 8 * zoom, backgroundColor: colors.primary }}
          />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3">
          <p className="text-sm font-medium mb-2">Accent Color</p>
          <div className="flex gap-2">
            {ACCENT_COLORS.map(color => (
              <button
                key={color.value}
                onClick={() => onCustomizationChange({ accentColor: color.value as any })}
                className={cn(
                  "w-6 h-6 rounded-full transition-transform hover:scale-110",
                  customization.accentColor === color.value && "ring-2 ring-offset-1 ring-gray-400"
                )}
                style={{ backgroundColor: color.primary }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="h-full flex flex-col" style={{ paddingTop: 20 * zoom }}>
        {/* Logo */}
        <div className="mb-auto">
          {clientLogo ? (
            <img 
              src={clientLogo} 
              alt="Client Logo"
              style={{ height: 60 * zoom, objectFit: 'contain' }}
            />
          ) : (
            <div 
              className="rounded flex items-center justify-center"
              style={{ 
                width: 120 * zoom, 
                height: 60 * zoom, 
                backgroundColor: colors.light 
              }}
            >
              <Building2 style={{ width: 24 * zoom, height: 24 * zoom, color: colors.primary }} />
            </div>
          )}
        </div>

        {/* Title section */}
        <div className="flex-1 flex flex-col justify-center">
          <h1 style={{ fontSize: 32 * zoom, fontWeight: 'bold', color: colors.primary, marginBottom: 8 * zoom }}>
            <EditableCell
              value={customization.coverTitle}
              onChange={(v) => onCustomizationChange({ coverTitle: v })}
            />
          </h1>
          <p style={{ fontSize: 16 * zoom, color: '#6b7280', marginBottom: 40 * zoom }}>
            <EditableCell
              value={customization.coverSubtitle}
              onChange={(v) => onCustomizationChange({ coverSubtitle: v })}
            />
          </p>

          {/* Site details */}
          <div style={{ fontSize: 14 * zoom }}>
            <div className="flex items-center gap-2 mb-2">
              <Building2 style={{ width: 16 * zoom, height: 16 * zoom, color: colors.primary }} />
              <PlaceholderData value={siteName} label="Site Name" className="font-semibold" />
            </div>
            <div className="flex items-center gap-2 mb-2">
              <User style={{ width: 16 * zoom, height: 16 * zoom, color: colors.primary }} />
              <PlaceholderData value={clientName} label="Client Name" />
            </div>
            <div className="flex items-center gap-2">
              <MapPin style={{ width: 16 * zoom, height: 16 * zoom, color: colors.primary }} />
              <PlaceholderData value={siteAddress} label="Site Address" className="text-gray-500" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-200 flex gap-6" style={{ fontSize: 11 * zoom }}>
          {customization.includeDate && (
            <div className="flex items-center gap-1 text-gray-500">
              <Calendar style={{ width: 12 * zoom, height: 12 * zoom }} />
              <PlaceholderData value={format(new Date(), 'dd MMMM yyyy')} label="Report Date" />
            </div>
          )}
          {customization.includeReference && (
            <div className="flex items-center gap-1 text-gray-500">
              <Hash style={{ width: 12 * zoom, height: 12 * zoom }} />
              <PlaceholderData value="REF-2026-0001" label="Reference Number" />
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );

  // Table of Contents Page
  const renderTOCPage = () => {
    if (!customization.includeTableOfContents) return null;
    const enabledSections = sections.filter(s => s.enabled).sort((a, b) => a.order - b.order);
    
    return (
      <PageWrapper pageNum={2}>
        <h2 style={{ fontSize: 20 * zoom, fontWeight: 'bold', color: colors.primary, marginBottom: 20 * zoom }}>
          Table of Contents
        </h2>
        <div style={{ fontSize: 12 * zoom }}>
          {enabledSections.map((section, idx) => (
            <div key={section.id} className="flex justify-between py-2 border-b border-dashed border-gray-200">
              <span>{idx + 1}. {section.title}</span>
              <span className="text-gray-400">{idx + 3}</span>
            </div>
          ))}
        </div>
      </PageWrapper>
    );
  };

  // Executive Summary Page
  const renderExecutiveSummaryPage = () => (
    <PageWrapper pageNum={customization.includeTableOfContents ? 3 : 2}>
      <h2 style={{ fontSize: 18 * zoom, fontWeight: 'bold', color: colors.primary, marginBottom: 16 * zoom }}>
        Executive Summary
      </h2>
      <div style={{ fontSize: 11 * zoom, lineHeight: 1.6 }}>
        <EditableCell
          value={customization.executiveSummary || 'This report provides a comprehensive overview of the electrical compliance status for ' + siteName + '. The assessment covers all subsections, certificates of compliance (COCs), and metering infrastructure.'}
          onChange={(v) => onCustomizationChange({ executiveSummary: v })}
          multiline
          className="w-full"
        />
      </div>

      {/* Quick Stats */}
      <div className="mt-8 grid grid-cols-4 gap-3" style={{ marginTop: 24 * zoom }}>
        {[
          { label: 'Total Subsections', value: kpiValues.totalSubsections, color: colors },
          { label: 'COC Pass', value: kpiValues.cocPass, color: { primary: '#16a34a', light: '#dcfce7' } },
          { label: 'COC Missing', value: kpiValues.cocMissing, color: { primary: '#ea580c', light: '#ffedd5' } },
          { label: 'Compliance Rate', value: `${kpiValues.complianceRate}%`, color: { primary: '#9333ea', light: '#f3e8ff' } },
        ].map((stat, idx) => (
          <div 
            key={idx}
            className="rounded text-center"
            style={{ 
              padding: 12 * zoom, 
              backgroundColor: stat.color.light,
            }}
          >
            <div style={{ fontSize: 20 * zoom, fontWeight: 'bold', color: stat.color.primary }}>
              <PlaceholderData value={stat.value} label={stat.label} />
            </div>
            <div style={{ fontSize: 9 * zoom, color: '#6b7280', marginTop: 4 * zoom }}>
              <EditableCell value={stat.label} onChange={() => {}} />
            </div>
          </div>
        ))}
      </div>
    </PageWrapper>
  );

  // Subsections Table Page
  const renderSubsectionsPage = () => {
    const section = sections.find(s => s.id === 'subsections' || s.type === 'table');
    const columns = section?.columns || [
      { id: 'name', label: 'Shop Name', field: 'name', visible: true },
      { id: 'tenant', label: 'Tenant', field: 'tenantName', visible: true },
      { id: 'category', label: 'Category', field: 'category', visible: true },
      { id: 'status', label: 'COC Status', field: 'cocStatus', visible: true },
    ];
    const visibleCols = columns.filter(c => c.visible);

    return (
      <PageWrapper pageNum={customization.includeTableOfContents ? 4 : 3}>
        <div className="flex items-center justify-between" style={{ marginBottom: 16 * zoom }}>
          <h2 style={{ fontSize: 16 * zoom, fontWeight: 'bold', color: colors.primary }}>
            <EditableCell
              value={section?.title || 'Subsections Overview'}
              onChange={(v) => section && handleSectionTitleChange(section.id, v)}
            />
          </h2>
          <button
            onClick={() => setAddColumnDialog({ open: true, sectionId: section?.id || 'subsections' })}
            className="text-gray-400 hover:text-gray-600"
            style={{ padding: 4 * zoom }}
          >
            <Plus style={{ width: 14 * zoom, height: 14 * zoom }} />
          </button>
        </div>

        {/* Table */}
        <div className="border border-gray-200 rounded overflow-hidden">
          <table className="w-full" style={{ fontSize: 9 * zoom }}>
            <thead>
              <tr style={{ backgroundColor: colors.light }}>
                {visibleCols.map((col) => (
                  <th 
                    key={col.id} 
                    className="text-left border-b border-gray-200 group"
                    style={{ padding: `${8 * zoom}px ${6 * zoom}px`, color: colors.text }}
                  >
                    <div className="flex items-center gap-1">
                      <EditableCell
                        value={col.label}
                        onChange={(v) => section && handleColumnLabelChange(section.id, col.id, v)}
                        className="font-semibold"
                      />
                      <button 
                        onClick={() => section && handleColumnVisibilityToggle(section.id, col.id)}
                        className="opacity-0 group-hover:opacity-100"
                      >
                        <Eye style={{ width: 10 * zoom, height: 10 * zoom }} className="text-gray-400" />
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subsectionsData.slice(0, 12).map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  {visibleCols.map((col) => (
                    <td 
                      key={col.id} 
                      className="border-b border-gray-100"
                      style={{ padding: `${6 * zoom}px` }}
                    >
                      {col.field === 'cocStatus' ? (
                        <span 
                          className="px-2 py-0.5 rounded text-white"
                          style={{ 
                            fontSize: 8 * zoom,
                            backgroundColor: 
                              (row as any)[col.field] === 'Pass' ? '#16a34a' :
                              (row as any)[col.field] === 'Missing' ? '#dc2626' : '#ea580c'
                          }}
                        >
                          <PlaceholderData value={(row as any)[col.field]} label={col.label} className="text-white bg-transparent border-white/30" />
                        </span>
                      ) : (
                        <PlaceholderData value={(row as any)[col.field] || '—'} label={col.label} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-right text-gray-400" style={{ fontSize: 9 * zoom, marginTop: 8 * zoom }}>
          Showing {Math.min(12, subsectionsData.length)} of {subsectionsData.length} subsections
        </div>
      </PageWrapper>
    );
  };

  // Assets/Meters Page
  const renderAssetsPage = () => (
    <PageWrapper pageNum={customization.includeTableOfContents ? 5 : 4}>
      <h2 style={{ fontSize: 16 * zoom, fontWeight: 'bold', color: colors.primary, marginBottom: 16 * zoom }}>
        <EditableCell value="Electrical Meters Register" onChange={() => {}} />
      </h2>

      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full" style={{ fontSize: 9 * zoom }}>
          <thead>
            <tr style={{ backgroundColor: colors.light }}>
              {['Serial Number', 'Premises ID', 'Trade As', 'Breaker Size', 'CT Ratio'].map((label) => (
                <th 
                  key={label}
                  className="text-left border-b border-gray-200"
                  style={{ padding: `${8 * zoom}px ${6 * zoom}px`, color: colors.text }}
                >
                  <EditableCell value={label} onChange={() => {}} className="font-semibold" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assetsData.map((asset, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="border-b border-gray-100" style={{ padding: `${6 * zoom}px` }}>
                  <PlaceholderData value={asset.serialNumber || '—'} label="Serial Number" />
                </td>
                <td className="border-b border-gray-100" style={{ padding: `${6 * zoom}px` }}>
                  <PlaceholderData value={asset.premisesId} label="Premises ID" />
                </td>
                <td className="border-b border-gray-100" style={{ padding: `${6 * zoom}px` }}>
                  <PlaceholderData value={asset.tradeAs || '—'} label="Trade As" />
                </td>
                <td className="border-b border-gray-100" style={{ padding: `${6 * zoom}px` }}>
                  <PlaceholderData value={asset.breakerSize || '—'} label="Breaker Size" />
                </td>
                <td className="border-b border-gray-100" style={{ padding: `${6 * zoom}px` }}>
                  <PlaceholderData value={asset.ctRatio || '—'} label="CT Ratio" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageWrapper>
  );

  // Notes Page
  const renderNotesPage = () => (
    <PageWrapper pageNum={customization.includeTableOfContents ? 6 : 5}>
      <h2 style={{ fontSize: 16 * zoom, fontWeight: 'bold', color: colors.primary, marginBottom: 16 * zoom }}>
        <EditableCell value="Notes & Observations" onChange={() => {}} />
      </h2>
      <div style={{ fontSize: 11 * zoom, lineHeight: 1.6 }}>
        <EditableCell
          value={customization.customNotes || 'Add any notes or observations that should appear at the end of all reports of this type. Click here to edit...'}
          onChange={(v) => onCustomizationChange({ customNotes: v })}
          multiline
          className="w-full"
        />
      </div>

      {/* Signature block */}
      <div className="mt-auto pt-8" style={{ marginTop: 'auto', paddingTop: 60 * zoom }}>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <div className="border-b border-gray-300 mb-2" style={{ height: 40 * zoom }} />
            <div style={{ fontSize: 10 * zoom }} className="text-gray-600">
              <EditableCell value="Inspector Signature" onChange={() => {}} />
            </div>
            <div style={{ fontSize: 9 * zoom }} className="text-gray-400">
              Date: _______________
            </div>
          </div>
          <div>
            <div className="border-b border-gray-300 mb-2" style={{ height: 40 * zoom }} />
            <div style={{ fontSize: 10 * zoom }} className="text-gray-600">
              <EditableCell value="Client Representative" onChange={() => {}} />
            </div>
            <div style={{ fontSize: 9 * zoom }} className="text-gray-400">
              Date: _______________
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );

  // Build pages array
  const pages = [
    { id: 'cover', render: renderCoverPage },
    ...(customization.includeTableOfContents ? [{ id: 'toc', render: renderTOCPage }] : []),
    { id: 'summary', render: renderExecutiveSummaryPage },
    { id: 'subsections', render: renderSubsectionsPage },
    { id: 'assets', render: renderAssetsPage },
    { id: 'notes', render: renderNotesPage },
  ];

  const totalPages = pages.length;

  return (
    <div className="flex flex-col h-full">
      {/* Legend Bar - Visual indicator guide */}
      <div className="flex items-center gap-6 px-4 py-2 bg-muted/40 border-b text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Field Types:</span>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 px-1.5 py-0.5 border border-blue-300 bg-blue-50/50 rounded">
            <Pencil className="w-2.5 h-2.5 text-blue-600" />
            <span>Editable template field</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 px-1.5 py-0.5 border border-dashed border-amber-400/60 bg-amber-50/40 rounded">
            <Database className="w-2.5 h-2.5 text-amber-600" />
            <span>Sample data (replaced when generating)</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 border-b flex-wrap">
        <div className="flex items-center gap-4">
          <Label className="flex items-center gap-2 cursor-pointer text-sm">
            <Switch 
              checked={customization.includeTableOfContents}
              onCheckedChange={(v) => onCustomizationChange({ includeTableOfContents: v })}
            />
            TOC
          </Label>
          <Label className="flex items-center gap-2 cursor-pointer text-sm">
            <Switch 
              checked={customization.includePageNumbers}
              onCheckedChange={(v) => onCustomizationChange({ includePageNumbers: v })}
            />
            Page #
          </Label>
          <Label className="flex items-center gap-2 cursor-pointer text-sm">
            <Switch 
              checked={customization.includeWatermark}
              onCheckedChange={(v) => onCustomizationChange({ includeWatermark: v })}
            />
            Watermark
          </Label>
        </div>
        
        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setZoom(z => Math.min(1.5, z + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm px-2">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage === totalPages - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Page thumbnails sidebar + main view */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thumbnails */}
        <div className="w-24 bg-muted/50 border-r overflow-y-auto p-2 space-y-2">
          {pages.map((page, idx) => (
            <button
              key={page.id}
              onClick={() => setCurrentPage(idx)}
              className={cn(
                "w-full aspect-[210/297] bg-white rounded shadow-sm border-2 transition-all overflow-hidden",
                currentPage === idx ? "border-primary" : "border-transparent hover:border-gray-300"
              )}
            >
              <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                {idx + 1}
              </div>
            </button>
          ))}
        </div>

        {/* Main page view */}
        <ScrollArea className="flex-1 bg-gray-100">
          <div className="flex justify-center items-start p-8 min-h-full">
            {pages[currentPage]?.render()}
          </div>
        </ScrollArea>
      </div>

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
