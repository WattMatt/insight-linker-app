// Types for PDF Report Editor

export interface TableColumn {
  id: string;
  label: string;
  field: string;
  visible: boolean;
  width?: number;
}

export interface KPIItem {
  id: string;
  label: string;
  field: string;
  visible: boolean;
  color?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'muted';
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'summary' | 'table' | 'kpi' | 'text' | 'chart';
  enabled: boolean;
  order: number;
  editable: boolean;
  data?: any;
  notes?: string;
  
  // Table configuration
  columns?: TableColumn[];
  
  // KPI configuration
  kpiItems?: KPIItem[];
  
  // Text content for text sections
  textContent?: string;
}

export interface ReportCustomization {
  // Cover page
  coverTitle: string;
  coverSubtitle: string;
  includeDate: boolean;
  includeReference: boolean;
  
  // Sections
  sections: ReportSection[];
  
  // Styling
  accentColor: 'blue' | 'green' | 'orange' | 'red' | 'purple';
  
  // Content
  executiveSummary: string;
  customNotes: string;
  
  // Options
  includeTableOfContents: boolean;
  includePageNumbers: boolean;
  includeWatermark: boolean;
  watermarkText: string;
}

export interface EditableField {
  id: string;
  path: string;
  label: string;
  value: string | number;
  originalValue: string | number;
  type: 'text' | 'number' | 'select' | 'textarea';
  options?: string[];
  changed: boolean;
}

export interface ReportPreviewState {
  loading: boolean;
  previewUrl: string | null;
  error: string | null;
}

export const DEFAULT_CUSTOMIZATION: ReportCustomization = {
  coverTitle: 'Site Report',
  coverSubtitle: 'Comprehensive Analysis',
  includeDate: true,
  includeReference: true,
  sections: [],
  accentColor: 'blue',
  executiveSummary: '',
  customNotes: '',
  includeTableOfContents: false,
  includePageNumbers: true,
  includeWatermark: false,
  watermarkText: 'DRAFT',
};
