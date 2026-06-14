/**
 * Pure, testable builders for the Site Drawing inspection report.
 * No pdfmake imports — assembly + image embedding live in siteDrawingReportGenerator.ts.
 */
import { formatDate } from './reportKernel';

export interface SiteDrawingPinImage {
  url: string;
  name?: string;
}

export interface SiteDrawingPin {
  id?: string;
  number: number;
  x?: number;
  y?: number;
  title?: string;
  description?: string;
  images?: SiteDrawingPinImage[];
}

export interface SiteDrawingGeneralInfo {
  projectName?: string;
  inspectorName?: string;
  date?: string;
  location?: string;
  totalPins?: number;
}

export interface SiteDrawingData {
  title?: string;
  subtitle?: string;
  siteName?: string;
  subsectionId?: string;
  subsectionName?: string;
  drawingImageBase64?: string;
  pdfUrl?: string;
  pins: SiteDrawingPin[];
  generalInfo?: SiteDrawingGeneralInfo;
  generatedAt?: string;
}

export interface SiteDrawingPinRow {
  number: string;
  title: string;
  description: string;
  images: string;
}

export interface SiteDrawingMetaRow {
  label: string;
  value: string;
}

/** Pins ordered by pin number, with guarded fields and a per-pin image count. */
export function buildSiteDrawingPinRows(pins: SiteDrawingPin[]): SiteDrawingPinRow[] {
  return [...pins]
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    .map((pin) => ({
      number: pin.number != null ? String(pin.number) : '—',
      title: pin.title?.trim() || '—',
      description: pin.description?.trim() || '—',
      images: String(pin.images?.length ?? 0),
    }));
}

/** Header meta block. totalPins falls back to the actual pin count when not supplied. */
export function buildSiteDrawingInfo(
  info: SiteDrawingGeneralInfo | undefined,
  pinCount: number,
): SiteDrawingMetaRow[] {
  const g = info || {};
  return [
    { label: 'Project', value: g.projectName?.trim() || '—' },
    { label: 'Inspector', value: g.inspectorName?.trim() || '—' },
    { label: 'Date', value: formatDate(g.date) },
    { label: 'Location', value: g.location?.trim() || '—' },
    { label: 'Total Pins', value: String(g.totalPins ?? pinCount) },
  ];
}
