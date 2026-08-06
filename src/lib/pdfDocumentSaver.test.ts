import { describe, it, expect, beforeEach, vi } from 'vitest';

// Hoisted spies so the vi.mock factory (also hoisted) can close over them.
const { removeSpy, insertSpy, insertResult } = vi.hoisted(() => {
  const insertResult = { error: null as null | { message: string } };
  return {
    removeSpy: vi.fn(() => Promise.resolve({ error: null })),
    insertSpy: vi.fn(() => Promise.resolve({ error: insertResult.error })),
    insertResult,
  };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'site_document_categories') {
        // Existing category found → no category insert path.
        return { select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ id: 'cat-1' }] }) }) }) };
      }
      if (table === 'site_documents') {
        return { insert: insertSpy };
      }
      return {};
    },
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: { path: 'sites/site-1/cat/123-file.pdf' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://x/storage/file.pdf' } }),
        remove: removeSpy,
      }),
    },
  },
}));

import { savePDFToDocuments, getReportCategoryName } from './pdfDocumentSaver';

describe('getReportCategoryName', () => {
  it('maps site-coc to "Site COC Reports"', () => {
    expect(getReportCategoryName('site-coc')).toBe('Site COC Reports');
  });
});

const opts = () => ({
  blob: new Blob(['pdf'], { type: 'application/pdf' }),
  fileName: 'Report.pdf',
  siteId: 'site-1',
  categoryName: 'Site Summary Reports',
});

describe('savePDFToDocuments — fail-closed + no orphan blob (#5)', () => {
  beforeEach(() => {
    removeSpy.mockClear();
    insertSpy.mockClear();
    insertResult.error = null;
  });

  it('stores the STORAGE PATH in file_url, never a public URL (private bucket)', async () => {
    const result = await savePDFToDocuments(opts());
    expect(result.success).toBe(true);
    expect(result.documentUrl).toBe('sites/site-1/cat/123-file.pdf');
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ file_url: 'sites/site-1/cat/123-file.pdf' }),
    );
  });

  it('removes the uploaded blob and reports failure when the DB insert fails', async () => {
    insertResult.error = { message: 'insert boom' };
    const result = await savePDFToDocuments(opts());
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledWith(['sites/site-1/cat/123-file.pdf']);
  });

  it('does NOT remove the blob on a successful save', async () => {
    insertResult.error = null;
    const result = await savePDFToDocuments(opts());
    expect(result.success).toBe(true);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
