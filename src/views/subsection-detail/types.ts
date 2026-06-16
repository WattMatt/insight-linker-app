export interface SubsectionData {
  name: string;
  tenantName?: string;
  category: string;
  cocNumber?: string;
  cocType?: string;
  cocStatus?: string;
  cocIssueDate?: string;
  cocExpiryDate?: string;
  cocFailureReasons?: string;
  meterSerialNumber?: string;
  meteringStatus?: string;
  ctRatio?: string;
  isCocRequired: boolean;
  isThermalRequired: boolean;
  isCompliant?: boolean | null;
  inspections?: Record<string, any>;
  files?: Record<string, any>;
  snags?: any[];
}

export interface SiteData {
  siteName: string;
  clientInfo?: string;
}

export interface CocDocData {
  cocType: string;
  cocStatus: string;
  cocNumber: string;
  cocIssueDate: string;
}

export interface SupabaseDocument {
  id: string;
  file_name: string;
  file_url: string;
  category_id: string;
  uploaded_at: string;
  coc_number?: string | null;
  coc_issue_date?: string | null;
  coc_type?: string | null;
  coc_status?: string | null;
  coc_expiry_date?: string | null;
}

export interface DocumentCategory {
  id: string;
  name: string;
}

export interface EditFormData {
  name: string;
  tenant_name: string;
  category: string;
  is_coc_required: boolean;
}

export interface PendingDocumentForVerification {
  id: string;
  url: string;
  name: string;
}
