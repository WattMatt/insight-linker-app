import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  calculateCategoryHealth,
  calculateDocumentMetrics,
  type SubsectionData,
} from './siteSummaryRenderSpec';

const sub = (over: Partial<SubsectionData>): SubsectionData => ({
  id: 'x',
  name: 'Sub',
  category: 'Kiosk',
  cocStatus: null,
  meteringStatus: null,
  meterSerialNumber: null,
  ctRatio: null,
  snagCount: 0,
  isCompliant: true,
  isCocRequired: true,
  ...over,
});

const abbr = (c: string) => c.slice(0, 3).toUpperCase();

describe('calculateMetrics — COC compliance is required-only (≤ 100%)', () => {
  it('numerator counts only required + approved; a NOT-required approved sub does not inflate it', () => {
    const subs = [
      sub({ id: 'a', isCocRequired: true, cocStatus: 'Approved' }),   // required + approved
      sub({ id: 'b', isCocRequired: true, cocStatus: 'Missing' }),    // required, not approved
      sub({ id: 'c', isCocRequired: false, cocStatus: 'Approved' }),  // NOT required (e.g. generator)
    ];
    // cocRequiredCount provided by caller = number of is_coc_required subsections = 2
    const m = calculateMetrics(subs, 2);
    expect(m.cocRequired).toBe(2);
    expect(m.cocCompliant).toBe(1);       // only sub 'a'
    expect(m.cocCompliance).toBe(50);     // 1/2, never > 100 from the non-required one
  });

  it('no required COCs => 0% (no divide-by-zero)', () => {
    const m = calculateMetrics([sub({ isCocRequired: false, cocStatus: 'Approved' })], 0);
    expect(m.cocCompliance).toBe(0);
  });
});

describe('calculateCategoryHealth — shows ALL categories (no silent truncation)', () => {
  it('returns one entry per category even when there are more than four', () => {
    const subs = [
      sub({ category: 'Kiosk', isCompliant: true }),
      sub({ category: 'Shop', isCompliant: false }),
      sub({ category: 'Generator', isCompliant: true }),
      sub({ category: 'Substation', isCompliant: true }),
      sub({ category: 'Lighting', isCompliant: false }),
      sub({ category: 'Metering', isCompliant: true }),
    ];
    const result = calculateCategoryHealth(subs, abbr);
    expect(result.length).toBe(6); // previously capped at 4
    expect(result.map(r => r.category).sort()).toEqual(
      ['Generator', 'Kiosk', 'Lighting', 'Metering', 'Shop', 'Substation'],
    );
  });

  it('computes percentage as compliant / total per category', () => {
    const subs = [
      sub({ category: 'Kiosk', isCompliant: true }),
      sub({ category: 'Kiosk', isCompliant: false }),
      sub({ category: 'Shop', isCompliant: true }),
    ];
    const result = calculateCategoryHealth(subs, abbr);
    const kiosk = result.find(r => r.category === 'Kiosk')!;
    const shop = result.find(r => r.category === 'Shop')!;
    expect(kiosk.percentage).toBe(50);
    expect(shop.percentage).toBe(100);
  });
});

describe('calculateDocumentMetrics — lists every filename per category', () => {
  it('groups site + subsection document filenames under their category names', () => {
    const siteDocs = [
      { category: 'Reports', file_name: 'Summary.pdf', site_document_categories: { name: 'Reports' } },
      { category: 'Reports', file_name: 'Compliance.pdf', site_document_categories: { name: 'Reports' } },
    ];
    const subDocs = [
      { category_id: '1', file_name: 'COC-10.pdf', document_categories: { name: '01 COC' } },
    ];
    const m = calculateDocumentMetrics(siteDocs, subDocs);

    expect(m.totalDocuments).toBe(3);
    const reports = m.categories.find(c => c.categoryName === 'Reports')!;
    expect(reports.fileCount).toBe(2);
    expect(reports.files).toEqual(['Compliance.pdf', 'Summary.pdf']); // sorted
    const coc = m.categories.find(c => c.categoryName === '01 COC')!;
    expect(coc.files).toEqual(['COC-10.pdf']);
  });

  it('falls back to a placeholder name for documents without a filename', () => {
    const m = calculateDocumentMetrics(
      [{ category: 'Misc', file_name: undefined, site_document_categories: null }],
      [],
    );
    expect(m.categories[0].files).toEqual(['(unnamed file)']);
  });
});
