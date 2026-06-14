/**
 * Client-side pdfmake generator for the Site Drawing inspection report.
 *
 * Previously this report type fell through to a generic Site-Summary in the
 * server generate-pdf edge fn (the drawing + pins never rendered). This builds
 * the real document: header meta, the drawing image, a pins summary table, and
 * per-pin detail with embedded photos (load failures are reported, not silent).
 */
import { createInfoTable, createDataTable, createSectionHeader, COLORS, CONTENT_WIDTH_PT } from './pdfMakeUtils';
import { generateReport } from './pdfEngine';
import { loadCompanyBranding, imageUrlToBase64 } from './pdfBranding';
import {
  buildSiteDrawingInfo,
  buildSiteDrawingPinRows,
  type SiteDrawingData,
  type SiteDrawingPin,
} from './report/siteDrawingRows';

type Content = any;

export type { SiteDrawingData, SiteDrawingPin } from './report/siteDrawingRows';

export interface SiteDrawingPdfResult {
  success: boolean;
  blob?: Blob;
  filename?: string;
  previewUrl?: string;
  error?: string;
}

const PIN_IMAGE_WIDTH = (CONTENT_WIDTH_PT - 20) / 2;

/** Embed one pin's photos in a 2-up grid; unreachable images are noted, never dropped silently. */
async function buildPinImages(pin: SiteDrawingPin): Promise<Content[]> {
  const images = pin.images || [];
  if (!images.length) return [];

  const loaded: string[] = [];
  let failed = 0;
  for (const img of images) {
    const dataUrl = img.url ? await imageUrlToBase64(img.url) : null;
    if (dataUrl) loaded.push(dataUrl);
    else failed++;
  }

  const content: Content[] = [];
  for (let i = 0; i < loaded.length; i += 2) {
    content.push({
      columns: [loaded[i], loaded[i + 1]].map((dataUrl) =>
        dataUrl
          ? { image: dataUrl, width: PIN_IMAGE_WIDTH, margin: [0, 0, 0, 6] }
          : { text: '', width: PIN_IMAGE_WIDTH },
      ),
      columnGap: 20,
    });
  }
  if (failed > 0) {
    content.push({
      text: `${failed} image${failed === 1 ? '' : 's'} could not be loaded.`,
      fontSize: 8,
      italics: true,
      color: COLORS.warning,
      margin: [0, 0, 0, 6],
    });
  }
  return content;
}

async function buildContent(data: SiteDrawingData): Promise<Content[]> {
  const content: Content[] = [];

  content.push(createInfoTable(buildSiteDrawingInfo(data.generalInfo, data.pins.length).map((m) => [m.label, m.value] as [string, string])));

  // Only embed when it is a real raster dataURL — the canvas state can otherwise
  // be a Fabric toJSON() blob, which pdfmake cannot render as an image.
  if (data.drawingImageBase64?.startsWith('data:image')) {
    content.push(createSectionHeader('Site Drawing', 'primary'));
    content.push({ image: data.drawingImageBase64, width: CONTENT_WIDTH_PT - 20, alignment: 'center', margin: [0, 0, 0, 10] });
  }

  if (!data.pins.length) {
    content.push(createSectionHeader('Pins', 'primary'));
    content.push({ text: 'No pins recorded on this drawing.', italics: true, color: COLORS.textMuted, margin: [0, 4, 0, 0] });
    return content;
  }

  content.push(createSectionHeader('Pins Summary', 'primary'));
  content.push(
    createDataTable(
      [
        { header: '#', field: 'number', width: 30, alignment: 'center' },
        { header: 'Title', field: 'title', width: '*' },
        { header: 'Description', field: 'description', width: 220 },
        { header: 'Images', field: 'images', width: 50, alignment: 'center' },
      ],
      buildSiteDrawingPinRows(data.pins),
    ),
  );

  // Per-pin detail with embedded photos
  const orderedPins = [...data.pins].sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  for (const pin of orderedPins) {
    content.push(createSectionHeader(`Pin ${pin.number ?? '—'}: ${pin.title?.trim() || 'Untitled'}`, 'secondary'));
    if (pin.description?.trim()) {
      content.push({ text: pin.description.trim(), fontSize: 10, color: COLORS.textSecondary, margin: [0, 0, 0, 6] });
    }
    content.push(...(await buildPinImages(pin)));
  }

  return content;
}

export async function generateSiteDrawingPdf(data: SiteDrawingData): Promise<SiteDrawingPdfResult> {
  try {
    const branding = await loadCompanyBranding();
    const title = data.title || 'Site Drawing Inspection';
    const safeName = (data.subsectionName || 'Site_Drawing').replace(/[^a-zA-Z0-9_.-]/g, '_');

    const result = await generateReport({
      type: 'site-drawing',
      title,
      content: await buildContent(data),
      coverPage: {
        title,
        subtitle: data.subtitle || data.subsectionName || 'Site Drawing',
        siteName: data.siteName || '',
        reportType: 'Site Drawing Inspection',
        logoDataUrl: branding.logoDataUrl,
        organizationName: branding.organizationName,
        reportDate: new Date(),
      },
      options: {
        logoDataUrl: branding.logoDataUrl,
        organizationName: branding.organizationName,
        filename: `${safeName}_Site_Drawing_Inspection.pdf`,
      },
    });

    return { success: true, blob: result.blob, filename: result.filename, previewUrl: result.previewUrl };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[SiteDrawingReport] generation failed:', error);
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to generate report' };
  }
}
