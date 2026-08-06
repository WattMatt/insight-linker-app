import { describe, it, expect, beforeEach, vi } from 'vitest';

const { createSignedUrlSpy, downloadSpy, fromSpy } = vi.hoisted(() => {
  const createSignedUrlSpy = vi.fn();
  const downloadSpy = vi.fn();
  const fromSpy = vi.fn(() => ({ createSignedUrl: createSignedUrlSpy, download: downloadSpy }));
  return { createSignedUrlSpy, downloadSpy, fromSpy };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: fromSpy } },
}));

import {
  parseDocumentFileRef,
  getDocumentSignedUrl,
  resolveDocumentUrl,
  downloadDocumentBlob,
  DOCUMENTS_BUCKET,
  DOCUMENT_SIGNED_URL_TTL_SECONDS,
} from './documentUrl';

const PROJECT = 'https://abcdefgh.supabase.co';

describe('parseDocumentFileRef', () => {
  it('parses a legacy public URL (rows written while the bucket was public)', () => {
    expect(
      parseDocumentFileRef(`${PROJECT}/storage/v1/object/public/documents/site-1/Reports/123-report.pdf`),
    ).toEqual({ bucket: 'documents', path: 'site-1/Reports/123-report.pdf' });
  });

  it('parses a signed URL and strips the token query', () => {
    expect(
      parseDocumentFileRef(`${PROJECT}/storage/v1/object/sign/documents/site-1/a.pdf?token=abc`),
    ).toEqual({ bucket: 'documents', path: 'site-1/a.pdf' });
  });

  it('parses an authenticated-variant URL', () => {
    expect(
      parseDocumentFileRef(`${PROJECT}/storage/v1/object/authenticated/documents/subsections/sub-1/b.pdf`),
    ).toEqual({ bucket: 'documents', path: 'subsections/sub-1/b.pdf' });
  });

  it('decodes percent-encoded path segments in legacy URLs', () => {
    expect(
      parseDocumentFileRef(`${PROJECT}/storage/v1/object/public/documents/site-1/My%20Report.pdf`),
    ).toEqual({ bucket: 'documents', path: 'site-1/My Report.pdf' });
  });

  it('keeps the original bucket for legacy URLs from other buckets', () => {
    expect(
      parseDocumentFileRef(`${PROJECT}/storage/v1/object/public/inspection-photos/site-1/p.jpg`),
    ).toEqual({ bucket: 'inspection-photos', path: 'site-1/p.jpg' });
  });

  it('treats a bare path as a documents-bucket reference (new rows)', () => {
    expect(parseDocumentFileRef('site-1/Site_Summary_Reports/1730-file.pdf')).toEqual({
      bucket: DOCUMENTS_BUCKET,
      path: 'site-1/Site_Summary_Reports/1730-file.pdf',
    });
  });

  it('strips a leading slash from bare paths', () => {
    expect(parseDocumentFileRef('/subsections/sub-1/Cat/1-file.pdf')).toEqual({
      bucket: DOCUMENTS_BUCKET,
      path: 'subsections/sub-1/Cat/1-file.pdf',
    });
  });

  it('returns null for blob:, data:, external URLs and empty values', () => {
    expect(parseDocumentFileRef('blob:https://app.example/x-y-z')).toBeNull();
    expect(parseDocumentFileRef('data:application/pdf;base64,AAAA')).toBeNull();
    expect(parseDocumentFileRef('https://example.com/some/file.pdf')).toBeNull();
    expect(parseDocumentFileRef('//cdn.example.com/file.pdf')).toBeNull();
    expect(parseDocumentFileRef('')).toBeNull();
    expect(parseDocumentFileRef('   ')).toBeNull();
    expect(parseDocumentFileRef(null)).toBeNull();
    expect(parseDocumentFileRef(undefined)).toBeNull();
  });
});

describe('getDocumentSignedUrl', () => {
  beforeEach(() => {
    fromSpy.mockClear();
    createSignedUrlSpy.mockReset();
  });

  it('signs a bare path against the documents bucket with the default TTL', async () => {
    createSignedUrlSpy.mockResolvedValue({ data: { signedUrl: 'https://signed/x' }, error: null });
    const url = await getDocumentSignedUrl('site-1/Reports/1-a.pdf');
    expect(url).toBe('https://signed/x');
    expect(fromSpy).toHaveBeenCalledWith(DOCUMENTS_BUCKET);
    expect(createSignedUrlSpy).toHaveBeenCalledWith('site-1/Reports/1-a.pdf', DOCUMENT_SIGNED_URL_TTL_SECONDS);
  });

  it('parses the path out of a legacy public URL before signing', async () => {
    createSignedUrlSpy.mockResolvedValue({ data: { signedUrl: 'https://signed/y' }, error: null });
    const url = await getDocumentSignedUrl(
      `${PROJECT}/storage/v1/object/public/documents/subsections/sub-9/Cat/2-b.pdf`,
    );
    expect(url).toBe('https://signed/y');
    expect(createSignedUrlSpy).toHaveBeenCalledWith('subsections/sub-9/Cat/2-b.pdf', DOCUMENT_SIGNED_URL_TTL_SECONDS);
  });

  it('returns null when the value is not a storage reference', async () => {
    expect(await getDocumentSignedUrl('blob:https://app/abc')).toBeNull();
    expect(createSignedUrlSpy).not.toHaveBeenCalled();
  });

  it('returns null when signing fails (e.g. anonymous visitor)', async () => {
    createSignedUrlSpy.mockResolvedValue({ data: null, error: { message: 'denied' } });
    expect(await getDocumentSignedUrl('site-1/a.pdf')).toBeNull();
  });

  it('honours a custom TTL', async () => {
    createSignedUrlSpy.mockResolvedValue({ data: { signedUrl: 'https://signed/z' }, error: null });
    await getDocumentSignedUrl('site-1/a.pdf', 60);
    expect(createSignedUrlSpy).toHaveBeenCalledWith('site-1/a.pdf', 60);
  });
});

describe('resolveDocumentUrl', () => {
  beforeEach(() => createSignedUrlSpy.mockReset());

  it('returns the signed URL when signing succeeds', async () => {
    createSignedUrlSpy.mockResolvedValue({ data: { signedUrl: 'https://signed/ok' }, error: null });
    expect(await resolveDocumentUrl('site-1/a.pdf')).toBe('https://signed/ok');
  });

  it('falls back to the original value when signing fails', async () => {
    createSignedUrlSpy.mockResolvedValue({ data: null, error: { message: 'denied' } });
    expect(await resolveDocumentUrl('site-1/a.pdf')).toBe('site-1/a.pdf');
  });

  it('passes non-storage values through untouched without calling storage', async () => {
    expect(await resolveDocumentUrl('blob:https://app/abc')).toBe('blob:https://app/abc');
    expect(createSignedUrlSpy).not.toHaveBeenCalled();
  });
});

describe('downloadDocumentBlob', () => {
  beforeEach(() => downloadSpy.mockReset());

  it('downloads via the SDK for a bare path', async () => {
    const blob = new Blob(['%PDF-fake']);
    downloadSpy.mockResolvedValue({ data: blob, error: null });
    expect(await downloadDocumentBlob('site-1/a.pdf')).toBe(blob);
    expect(downloadSpy).toHaveBeenCalledWith('site-1/a.pdf');
  });

  it('returns null on failure or non-storage values', async () => {
    downloadSpy.mockResolvedValue({ data: null, error: { message: 'nope' } });
    expect(await downloadDocumentBlob('site-1/a.pdf')).toBeNull();
    expect(await downloadDocumentBlob('data:x')).toBeNull();
  });
});
