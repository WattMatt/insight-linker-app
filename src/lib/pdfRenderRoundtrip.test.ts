/**
 * G1 render round-trip tests (PDF-STANDARD §4.G1): every major generator
 * builds its document definition from minimal fixture data and pdfmake must
 * produce a REAL PDF (magic bytes) with a sane page count, in plain Node.
 * This is the layer the audit found missing — ~114 PDF tests but none that
 * proved a binary render.
 *
 * Fixtures deliberately include hostile user-controlled strings (Ω, em-dash,
 * angle brackets, emoji) — a render that throws on them is a failure.
 *
 * They also include hostile IMAGE BYTES. Until the "Unknown image format" bug,
 * every test here forced `logoDataUrl: null` and `photos: []`, so not one byte of
 * image data reached pdfmake and the entire image path was untested — which is
 * how a WebP logo came to break every report in production.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  VALID_PNG_DATA_URL,
  VALID_JPEG_DATA_URL,
  WEBP_DATA_URL,
  HEIC_DATA_URL,
  SVG_DATA_URL,
  REMOTE_URL,
} from './pdf/imageFixtures';

/**
 * What the (mocked) image loaders return, mutable per test. Lets one file cover
 * "images resolved fine", "loader returned nothing" and "an unusable payload
 * reached the document definition anyway".
 */
const imageMocks: { logo: string | null; byUrl: Map<string, string> } = {
  logo: null,
  byUrl: new Map(),
};

// ── Network/DB isolation ────────────────────────────────────────────────────
// Branding, template-gateway and the supabase client are mocked so renders
// are pure functions of the fixtures (A4/B1: renderer gets plain data).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
    storage: {
      from: () => ({
        download: () => Promise.resolve({ data: null, error: { message: 'not in tests' } }),
        createSignedUrl: () => Promise.resolve({ data: null, error: { message: 'not in tests' } }),
      }),
    },
  },
}));

// Only the network-touching entry points are replaced; date/reference helpers stay
// real so generators that use them are exercised rather than stubbed.
vi.mock('@/lib/pdfBranding', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/pdfBranding')>();
  return {
    ...actual,
    loadCompanyBranding: () =>
      Promise.resolve({ logoDataUrl: imageMocks.logo, organizationName: 'Test Organization' }),
    imageUrlToBase64: (url: string) => Promise.resolve(imageMocks.byUrl.get(url) ?? null),
  };
});

// The single image loader. Mocked at this one module because every other loader
// now delegates here — simpleImageLoader, pdfBranding and pdfEngine included.
vi.mock('@/lib/pdf/loadReportImage', () => ({
  loadReportImage: (url: string | null | undefined) =>
    Promise.resolve(url ? imageMocks.byUrl.get(url) ?? null : null),
  loadReportImages: (urls: Array<string | null | undefined>) =>
    Promise.resolve(
      new Map(
        urls
          .filter((u): u is string => !!u && imageMocks.byUrl.has(u))
          .map((u) => [u, imageMocks.byUrl.get(u)!]),
      ),
    ),
  toPdfSafeBlob: () => Promise.resolve(null),
  MAX_IMAGE_PX: 1004,
}));

vi.mock('@/hooks/usePDFTemplateGateway', () => ({
  fetchPDFTemplate: () =>
    Promise.resolve({
      customization: {
        coverTitle: 'Floor Plan Inspection Report',
        coverSubtitle: '',
        accentColor: 'blue',
        includeDate: true,
      },
      // Every section enabled — exercises the full docdef.
      sections: [
        { id: 'pins-summary', title: 'Pins Summary', type: 'kpi', enabled: true, order: 0, editable: true },
        { id: 'floor-plan-image', title: 'Floor Plan', type: 'chart', enabled: true, order: 1, editable: true },
        { id: 'pins-table', title: 'Pins Table', type: 'table', enabled: true, order: 2, editable: true },
      ],
      accentColors: { primary: '#3182ce', light: '#EBF8FF', dark: '#2C5282', rgb: '49, 130, 206' },
    }),
}));

import { generateInspectionReportPdf } from './pdfmakeInspectionReport';
import { generateReport, createKpiRow, createSectionHeader, createDataTable, createInfoTable } from './pdfEngine';
import { buildSiteCocReportDocDef } from './siteCoc/siteCocReport';
import { buildCocReportModel } from './siteCoc/cocReportModel';
import { generatePdfBlob } from './pdfMakeConfig';
import { generateFloorPlanReport } from './floorPlanReportGenerator';
import { generateFortressChecklistPdf } from './fortressChecklistReportGenerator';
import { generateCalendarPdf } from './calendarReportGenerator';
import { generateInspectionTemplatePdf } from './inspectionTemplateReportGenerator';

const HOSTILE = 'Ω/km — <script>alert(1)</script> “quotes” 🔥';

async function pdfInfo(blob: Blob): Promise<{ magic: string; pages: number; size: number; title?: string }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const magic = String.fromCharCode(...bytes.slice(0, 5));
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return { magic, pages: doc.getPageCount(), size: bytes.length, title: doc.getTitle() };
}

beforeEach(() => {
  imageMocks.logo = null;
  imageMocks.byUrl = new Map();
});

describe('G1 render round-trips — %PDF- magic bytes + page counts', () => {
  it('inspection report renders a real PDF', async () => {
    const result = await generateInspectionReportPdf({
      inspection: {
        inspectionId: 'ins-1',
        templateName: `EMB Monthly ${HOSTILE}`,
        inspectorName: 'Test Inspector',
        inspectionDate: '2026-08-06',
        status: 'completed',
        subsectionName: 'Shop 1',
        sections: [
          {
            title: 'Distribution Board',
            items: [
              { label: `Breaker label ${HOSTILE}`, value: 'pass', notes: 'ok' },
              { label: 'Earth continuity', value: 'fail', notes: 'loose lug' },
            ],
          },
        ],
        snags: [{ title: 'Loose lug', description: 'Retighten and re-test', status: 'open', riskLevel: 'high', photos: [] }],
      },
      siteName: 'Test Site',
      clientName: 'Test Client',
    });

    expect(result.success).toBe(true);
    expect(result.blob).toBeTruthy();
    const info = await pdfInfo(result.blob as Blob);
    expect(info.magic).toBe('%PDF-');
    expect(info.pages).toBeGreaterThanOrEqual(2); // cover + content
  });

  it('site summary (engine builder) renders a real PDF with cover + content pages', async () => {
    const result = await generateReport({
      type: 'site-summary',
      title: `Site Summary ${HOSTILE}`,
      content: [
        createKpiRow([
          { value: '12', label: 'Subsections' },
          { value: '83%', label: 'Compliance' },
          { value: '3', label: 'Open snags' },
        ]),
        createSectionHeader('Health metrics', 'primary'),
        createInfoTable([
          ['Site', 'Test Site'],
          ['Client', HOSTILE],
        ]),
        createSectionHeader('Subsections', 'primary'),
        createDataTable(
          [
            { header: 'Name', field: 'name', width: '*' },
            { header: 'Status', field: 'status', width: 80 },
          ],
          Array.from({ length: 40 }, (_, i) => ({ name: `Shop ${i + 1} ${HOSTILE}`, status: i % 2 ? 'Pass' : 'Pending' })),
        ),
      ],
      coverPage: {
        title: 'Site Summary',
        subtitle: 'Test Site',
        siteName: 'Test Site',
        reportType: 'Site Summary',
        organizationName: 'Test Organization',
        reportDate: new Date(),
      },
    });

    const info = await pdfInfo(result.blob);
    expect(info.magic).toBe('%PDF-');
    expect(info.pages).toBeGreaterThanOrEqual(2); // cover + spilled table
    expect(result.filename.endsWith('.pdf')).toBe(true);
  });

  it('site COC report docdef renders a real PDF and grows with tenants', async () => {
    const subs = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        name: `TENANT ${i} ${HOSTILE}`,
        tenant_name: `TENANT ${i}`,
        is_coc_required: true,
      }));
    const model = (n: number) =>
      buildCocReportModel({
        siteName: `Test Site ${HOSTILE}`,
        generatedAt: '2026-08-06',
        lastImport: '2026-08-06',
        subsections: subs(n),
        // Every tenant carries a certificate + schedule row so each renders a
        // populated register entry — page count must grow with tenant count.
        certificates: Array.from({ length: n }, (_, i) => ({
          subsection_id: `s${i}`,
          cert_no: `B${i + 1}`,
          cert_type: 'Initial',
          verdict: i % 3 === 0 ? 'PASS' : i % 3 === 1 ? 'FAIL' : 'REVIEW — confirm',
          rules: (i % 3 === 1 ? { C8: 'FAIL' } : {}) as Record<string, string>,
          issued_date: '2026-01-01',
          coc_document_id: `d${i}`,
          eval_document_id: `e${i}`,
        })),
        schedule: Array.from({ length: n }, (_, i) => ({
          subsection_id: `s${i}`,
          shop_no_raw: `SHOP ${i + 1}`,
          initial_cert_nos: `B${i + 1}`,
          supplementary_cert_nos: '',
        })),
      });

    const small = await pdfInfo(await generatePdfBlob(buildSiteCocReportDocDef(model(2))));
    expect(small.magic).toBe('%PDF-');
    expect(small.pages).toBeGreaterThanOrEqual(2);

    // Page-count sanity: 40 tenants must need at least as many pages as 2.
    const large = await pdfInfo(await generatePdfBlob(buildSiteCocReportDocDef(model(40))));
    expect(large.magic).toBe('%PDF-');
    expect(large.pages).toBeGreaterThan(small.pages);
  });

  it('floor plan report renders a real PDF', async () => {
    const result = await generateFloorPlanReport({
      projectName: 'Test Project',
      siteName: 'Test Site',
      subsectionName: `Shop 9 ${HOSTILE}`,
      floorPlanUrl: '',
      pins: [
        { pin_number: 1, pin_type: 'snag', status: 'open', title: HOSTILE, notes: 'note', priority: 'high' },
        { pin_number: 2, pin_type: 'observation', status: 'resolved', title: 'Observation', notes: '' },
      ] as never,
    });

    const info = await pdfInfo(result.blob);
    expect(info.magic).toBe('%PDF-');
    expect(info.pages).toBeGreaterThanOrEqual(1);
    expect(result.fileName.endsWith('.pdf')).toBe(true);
  });

  it('fortress checklist renders a real PDF', async () => {
    const result = await generateFortressChecklistPdf({
      siteName: `Test Site ${HOSTILE}`,
      overallProgress: 50,
      stats: { completed: 1, pending: 1, notApplicable: 0, total: 2 },
      sections: [
        {
          name: `Marking ${HOSTILE}`,
          progress: 50,
          items: [
            { label: 'Labels installed', completed: true } as never,
            { label: 'Schedules on boards', completed: false } as never,
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
    const info = await pdfInfo(result.blob as Blob);
    expect(info.magic).toBe('%PDF-');
    expect(info.pages).toBeGreaterThanOrEqual(2); // cover + checklist
  });

  it('calendar report renders a real PDF (incl. empty-state copy)', async () => {
    const withEvents = await generateCalendarPdf({
      year: 2026,
      events: [
        { id: 'e1', title: `Annual COC renewal ${HOSTILE}`, siteName: 'Test Site', startDate: '2026-03-01', status: 'pending', priority: 'high', eventType: 'compliance' },
        { id: 'e2', title: 'Fire inspection', siteName: 'Test Site', startDate: '2026-09-15', status: 'completed', priority: 'medium', eventType: 'inspection' },
      ],
    });
    expect(withEvents.success).toBe(true);
    const info = await pdfInfo(withEvents.blob as Blob);
    expect(info.magic).toBe('%PDF-');
    expect(info.pages).toBeGreaterThanOrEqual(2);

    // Explicit empty state must still render a valid document (B1).
    const empty = await generateCalendarPdf({ year: 2026, events: [] });
    expect(empty.success).toBe(true);
    expect((await pdfInfo(empty.blob as Blob)).magic).toBe('%PDF-');
  });

  it('inspection template export renders a real PDF', async () => {
    const result = await generateInspectionTemplatePdf({
      templateName: `EMB Template ${HOSTILE}`,
      category: 'Electrical',
      description: 'Fixture template',
      sections: [
        { title: 'General', items: [{ label: `Item ${HOSTILE}`, type: 'checkbox', required: true }] },
        { title: 'Metering', items: [{ label: 'Meter serial', type: 'text' }] },
      ],
    });

    expect(result.success).toBe(true);
    const info = await pdfInfo(result.blob as Blob);
    expect(info.magic).toBe('%PDF-');
    expect(info.pages).toBeGreaterThanOrEqual(2);
  });
});

// ── G1b: the image path ──────────────────────────────────────────────────────
// Reproduces, at the generator level, the failure that took report generation
// down: "Invalid image: Error: Unknown image format. Images dictionary should
// contain dataURL entries (or local file paths in node.js)". pdfkit embeds JPEG
// and PNG only; WebP, GIF, SVG, HEIC and non-image error bodies all land in its
// throw branch.

const PHOTO_A = 'https://example.invalid/storage/v1/object/public/inspection-photos/a.jpg';
const PHOTO_B = 'https://example.invalid/storage/v1/object/public/inspection-photos/b.jpg';
const LOGO_URL = 'https://example.invalid/storage/v1/object/public/client-logos/logo.png';

function inspectionFixture(photos: string[]) {
  return {
    inspection: {
      inspectionId: 'ins-img',
      templateName: 'EMB Monthly',
      inspectorName: 'Test Inspector',
      inspectionDate: '2026-08-17',
      status: 'completed',
      sections: [
        { title: 'Distribution Board', items: [{ label: 'Breaker label', value: 'pass', notes: 'ok', photos }] },
      ],
      snags: [{ title: 'Loose lug', description: 'Retighten', status: 'open', riskLevel: 'high', photos }],
      tenants: [
        { shopName: 'Shop 1', meterImage: photos[0], breakerImage: photos[0], ctRatioImage: photos[0] },
      ],
    },
    siteName: 'Test Site',
    clientName: 'Test Client',
    siteLogoUrl: LOGO_URL,
  };
}

describe('G1b image path — valid images embed', () => {
  it('embeds photos and a logo, producing a materially larger PDF', async () => {
    const withoutImages = await generateInspectionReportPdf(inspectionFixture([]));
    const bare = await pdfInfo(withoutImages.blob as Blob);

    imageMocks.logo = VALID_PNG_DATA_URL;
    imageMocks.byUrl = new Map([
      [PHOTO_A, VALID_JPEG_DATA_URL],
      [PHOTO_B, VALID_PNG_DATA_URL],
      [LOGO_URL, VALID_PNG_DATA_URL],
    ]);

    const withImages = await generateInspectionReportPdf(inspectionFixture([PHOTO_A, PHOTO_B]));
    expect(withImages.success).toBe(true);
    const rich = await pdfInfo(withImages.blob as Blob);

    expect(rich.magic).toBe('%PDF-');
    // Proof the bytes actually reached the document rather than being skipped.
    expect(rich.size).toBeGreaterThan(bare.size);
  });

  it('accepts a JPEG cover logo on an engine-built report', async () => {
    imageMocks.logo = VALID_JPEG_DATA_URL;
    const result = await generateCalendarPdf({
      year: 2026,
      events: [
        { id: 'e1', title: 'Annual COC renewal', siteName: 'Test Site', startDate: '2026-03-01', status: 'pending', priority: 'high', eventType: 'compliance' },
      ],
    });
    expect(result.success).toBe(true);
    expect((await pdfInfo(result.blob as Blob)).magic).toBe('%PDF-');
  });
});

describe('G1b image path — unusable images degrade, they do not abort', () => {
  let warnings: string[] = [];
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnings = [];
    warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
    });
  });
  afterEach(() => warnSpy.mockRestore());

  // Each of these payloads, reaching a docDefinition, previously threw and killed
  // the whole report. They now become placeholders plus a diagnostic.
  const hostile: Array<[string, string]> = [
    ['WebP logo', WEBP_DATA_URL],
    ['HEIC photo', HEIC_DATA_URL],
    ['SVG logo', SVG_DATA_URL],
  ];

  for (const [label, payload] of hostile) {
    it(`inspection report still renders with a ${label}`, async () => {
      // Simulate a loader handing back an unusable payload — exactly what the old
      // "return the original blob on decode failure" fallbacks did.
      imageMocks.logo = payload;
      imageMocks.byUrl = new Map([
        [PHOTO_A, payload],
        [LOGO_URL, payload],
      ]);

      const result = await generateInspectionReportPdf(inspectionFixture([PHOTO_A]));

      expect(result.success).toBe(true);
      const info = await pdfInfo(result.blob as Blob);
      expect(info.magic).toBe('%PDF-');
      expect(warnings.join('\n')).toContain('could not be embedded');
    });
  }

  it('site summary still renders when the company logo is a WebP', async () => {
    imageMocks.logo = WEBP_DATA_URL;
    const result = await generateReport({
      type: 'site-summary',
      title: 'Site Summary',
      content: [createSectionHeader('Health metrics', 'primary'), createInfoTable([['Site', 'Test Site']])],
      coverPage: {
        title: 'Site Summary',
        siteName: 'Test Site',
        reportType: 'Site Summary',
        logoDataUrl: WEBP_DATA_URL,
        reportDate: new Date('2026-08-17'),
      },
    });

    const info = await pdfInfo(result.blob);
    expect(info.magic).toBe('%PDF-');
    expect(warnings.join('\n')).toContain('could not be embedded');
  });

  it('appends the warning panel as an extra page', async () => {
    const clean = await generateReport({
      type: 'generic',
      title: 'Clean',
      content: [{ text: 'body' }],
    });
    const dirty = await generateReport({
      type: 'generic',
      title: 'Dirty',
      content: [{ text: 'body' }, { image: HEIC_DATA_URL, width: 120 } as never],
    });

    expect((await pdfInfo(dirty.blob)).pages).toBe((await pdfInfo(clean.blob)).pages + 1);
  });

  it('survives a remote URL used inline, which pdfmake never fetches', async () => {
    // The floor-plan generator shipped this for every pin photo.
    const result = await generateReport({
      type: 'generic',
      title: 'Inline URL',
      content: [{ text: 'body' }, { image: REMOTE_URL, width: 200 } as never],
    });

    expect((await pdfInfo(result.blob)).magic).toBe('%PDF-');
    expect(warnings.join('\n')).toContain('never fetches inline URLs');
  });

  it('floor plan report renders with pin photos that fail to resolve', async () => {
    const result = await generateFloorPlanReport({
      projectName: 'Test Project',
      siteName: 'Test Site',
      subsectionName: 'Shop 9',
      floorPlanUrl: '',
      pins: [
        { pin_number: 1, pin_type: 'snag', status: 'open', title: 'Snag', photo_url: PHOTO_A, rectification_photo_url: PHOTO_B },
      ] as never,
    });

    expect((await pdfInfo(result.blob)).magic).toBe('%PDF-');
  });

  it('floor plan report embeds pin photos once they resolve', async () => {
    imageMocks.byUrl = new Map([
      [PHOTO_A, VALID_JPEG_DATA_URL],
      [PHOTO_B, VALID_PNG_DATA_URL],
    ]);

    const result = await generateFloorPlanReport({
      projectName: 'Test Project',
      siteName: 'Test Site',
      subsectionName: 'Shop 9',
      floorPlanUrl: '',
      pins: [
        { pin_number: 1, pin_type: 'snag', status: 'open', title: 'Snag', photo_url: PHOTO_A, rectification_photo_url: PHOTO_B },
      ] as never,
    });

    const info = await pdfInfo(result.blob);
    expect(info.magic).toBe('%PDF-');
    expect(warnings.join('\n')).not.toContain('could not be embedded');
  });
});

// ── G1c: PDF structure ───────────────────────────────────────────────────────

describe('G1c structure — the landscape registers use the shared base definition', () => {
  it('site COC report carries PDF metadata', async () => {
    const model = buildCocReportModel({
      siteName: 'Test Site',
      generatedAt: '2026-08-17',
      lastImport: '2026-08-17',
      subsections: [{ id: 's0', name: 'TENANT 0', tenant_name: 'TENANT 0', is_coc_required: true }],
      certificates: [],
      schedule: [],
    });

    // Previously hand-built: no info dictionary, so the PDF had no title at all.
    const info = await pdfInfo(await generatePdfBlob(buildSiteCocReportDocDef(model)));
    expect(info.title).toContain('Test Site');
  });
});
