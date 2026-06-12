import { describe, it, expect } from 'vitest';
import {
  normalizeCocType, normalizeCocDocStatus, cocDocFails, rollupStatus, groupCocDocuments, toCocDoc, CocDoc,
} from './cocHierarchy';

const doc = (over: Partial<CocDoc>): CocDoc => ({
  id: 'x', cocType: 'Supplementary', cocNumber: null, cocIssueDate: null,
  cocExpiryDate: null, cocStatus: 'Pending', fileName: 'f.pdf', fileUrl: 'u', ...over,
});
const today = '2026-06-12';

describe('normalizeCocType', () => {
  it('maps case/variants', () => {
    expect(normalizeCocType('initial')).toBe('Initial');
    expect(normalizeCocType('Initial')).toBe('Initial');
    expect(normalizeCocType('Supplementary')).toBe('Supplementary');
    expect(normalizeCocType('Temporary')).toBe('Temporary');
  });
  it('unknown/blank/null => Supplementary (grouping promotes earliest to Initial)', () => {
    expect(normalizeCocType('Not Marked')).toBe('Supplementary');
    expect(normalizeCocType(null)).toBe('Supplementary');
  });
});

describe('normalizeCocDocStatus', () => {
  it('maps both vocabularies', () => {
    expect(normalizeCocDocStatus('approved')).toBe('Pass');
    expect(normalizeCocDocStatus('Approved')).toBe('Pass');
    expect(normalizeCocDocStatus('rejected')).toBe('Fail');
    expect(normalizeCocDocStatus('Failed')).toBe('Fail');
    expect(normalizeCocDocStatus('pending')).toBe('Pending');
  });
  it('null/unknown => Pending (doc exists, unmarked)', () => {
    expect(normalizeCocDocStatus(null)).toBe('Pending');
    expect(normalizeCocDocStatus('')).toBe('Pending');
  });
});

describe('cocDocFails', () => {
  it('Fail fails', () => expect(cocDocFails(doc({ cocStatus: 'Fail' }), today)).toBe(true));
  it('Pass with future expiry does not fail', () =>
    expect(cocDocFails(doc({ cocStatus: 'Pass', cocExpiryDate: '2027-01-01' }), today)).toBe(false));
  it('Pass with past expiry fails', () =>
    expect(cocDocFails(doc({ cocStatus: 'Pass', cocExpiryDate: '2025-01-01' }), today)).toBe(true));
  it('Pass with no expiry does not fail', () =>
    expect(cocDocFails(doc({ cocStatus: 'Pass' }), today)).toBe(false));
  it('Pending does not fail', () => expect(cocDocFails(doc({ cocStatus: 'Pending' }), today)).toBe(false));
});

describe('rollupStatus', () => {
  it('no docs => Missing', () => expect(rollupStatus([], today)).toBe('Missing'));
  it('any fail => Fail', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pass' }), doc({ cocStatus: 'Fail' })], today)).toBe('Fail'));
  it('expired pass => Fail', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pass', cocExpiryDate: '2025-01-01' })], today)).toBe('Fail'));
  it('pass with no fail => Pass', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pass' }), doc({ cocStatus: 'Pending' })], today)).toBe('Pass'));
  it('only pending => Pending', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pending' })], today)).toBe('Pending'));
});

describe('groupCocDocuments', () => {
  it('picks the Initial-typed doc and orders supplementaries by issue date', () => {
    const g = groupCocDocuments([
      doc({ id: 's2', cocType: 'Supplementary', cocIssueDate: '2025-05-01' }),
      doc({ id: 'init', cocType: 'Initial', cocIssueDate: '2025-01-01' }),
      doc({ id: 's1', cocType: 'Supplementary', cocIssueDate: '2025-03-01' }),
    ], today);
    expect(g.initial?.id).toBe('init');
    expect(g.supplementaries.map(d => d.id)).toEqual(['s1', 's2']);
    expect(g.rollup).toBe('Pending');
  });
  it('with no Initial-typed doc, promotes the earliest by issue date', () => {
    const g = groupCocDocuments([
      doc({ id: 'b', cocType: 'Supplementary', cocIssueDate: '2025-04-01' }),
      doc({ id: 'a', cocType: 'Supplementary', cocIssueDate: '2025-02-01' }),
    ], today);
    expect(g.initial?.id).toBe('a');
    expect(g.supplementaries.map(d => d.id)).toEqual(['b']);
  });
  it('empty => null initial, Missing rollup', () => {
    const g = groupCocDocuments([], today);
    expect(g.initial).toBeNull();
    expect(g.supplementaries).toEqual([]);
    expect(g.rollup).toBe('Missing');
  });
});

describe('toCocDoc', () => {
  it('maps a raw subsection_documents row', () => {
    const d = toCocDoc({ id: '1', file_name: 'c.pdf', file_url: 'u', coc_number: 'COC-1',
      coc_issue_date: '2025-01-01', coc_expiry_date: null, coc_type: 'initial', coc_status: 'approved' });
    expect(d).toMatchObject({ id: '1', cocType: 'Initial', cocNumber: 'COC-1', cocStatus: 'Pass' });
  });
});
