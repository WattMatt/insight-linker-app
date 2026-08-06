import { describe, it, expect } from 'vitest';
import { storagePathFromUrl, splitNameExt, sanitizeSegment, buildRenamePath, buildMovePath } from './paths';

describe('storagePathFromUrl', () => {
  it('extracts the path after /documents/ and strips query', () => {
    expect(storagePathFromUrl('https://x.supabase.co/storage/v1/object/public/documents/site-1/02%20Manuals/123-a.pdf?token=z'))
      .toBe('site-1/02%20Manuals/123-a.pdf');
  });
  it('returns null when not a documents-bucket URL', () => {
    expect(storagePathFromUrl('https://example.com/whatever.pdf')).toBeNull();
  });
  it('accepts a bare storage path (private-bucket rows) as-is', () => {
    expect(storagePathFromUrl('site-1/Reports/123-a.pdf')).toBe('site-1/Reports/123-a.pdf');
    expect(storagePathFromUrl('subsections/sub-1/Cat/1-b.pdf')).toBe('subsections/sub-1/Cat/1-b.pdf');
  });
  it('strips a leading slash from bare paths', () => {
    expect(storagePathFromUrl('/site-1/Reports/123-a.pdf')).toBe('site-1/Reports/123-a.pdf');
  });
  it('returns null for blob: and data: URLs', () => {
    expect(storagePathFromUrl('blob:https://app/xyz')).toBeNull();
    expect(storagePathFromUrl('data:application/pdf;base64,AAAA')).toBeNull();
  });
});

describe('splitNameExt', () => {
  it('splits base and extension', () => {
    expect(splitNameExt('Switchgear O&M Manual.pdf')).toEqual({ base: 'Switchgear O&M Manual', ext: '.pdf' });
  });
  it('handles no extension', () => {
    expect(splitNameExt('README')).toEqual({ base: 'README', ext: '' });
  });
});

describe('sanitizeSegment', () => {
  it('replaces unsafe chars with underscores', () => {
    expect(sanitizeSegment('A B/C?.pdf')).toBe('A_B_C_.pdf');
  });
});

describe('buildRenamePath', () => {
  it('keeps the old directory, swaps in a fresh timestamped sanitized filename + preserved ext', () => {
    const p = buildRenamePath('site-1/02 Manuals/111-old.pdf', 'New Name', '.pdf', 999);
    expect(p).toBe('site-1/02 Manuals/999-New_Name.pdf');
  });
});

describe('buildMovePath', () => {
  it('site: {siteId}/{sanitized category}/{ts}-{sanitized file}', () => {
    expect(buildMovePath({ source: 'site', siteId: 's1', subsectionId: null, targetCategoryId: 'c2', targetCategoryName: '04 Metering', fileName: 'a b.pdf', timestamp: 5 }))
      .toBe('s1/04_Metering/5-a_b.pdf');
  });
  it('subsection: subsections/{subsectionId}/{categoryId}/{ts}-{sanitized file}', () => {
    expect(buildMovePath({ source: 'subsection', siteId: null, subsectionId: 'ss1', targetCategoryId: 'c9', targetCategoryName: 'x', fileName: 'a b.pdf', timestamp: 5 }))
      .toBe('subsections/ss1/c9/5-a_b.pdf');
  });
});
