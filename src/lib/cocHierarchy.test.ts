import { describe, it, expect } from 'vitest';
import {
  normalizeCocType, normalizeCocDocStatus, cocDocFails, rollupStatus, groupCocDocuments, toCocDoc, CocDoc,
  isCocCertificateCategory, buildCocCardLines,
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

describe('cocDocFails (register-truth: expiry is display-only)', () => {
  it('Fail fails', () => expect(cocDocFails(doc({ cocStatus: 'Fail' }), today)).toBe(true));
  it('Pass with future expiry does not fail', () =>
    expect(cocDocFails(doc({ cocStatus: 'Pass', cocExpiryDate: '2027-01-01' }), today)).toBe(false));
  it('Pass with past expiry does NOT fail — expiry no longer drives status', () =>
    expect(cocDocFails(doc({ cocStatus: 'Pass', cocExpiryDate: '2025-01-01' }), today)).toBe(false));
  it('Pass with no expiry does not fail', () =>
    expect(cocDocFails(doc({ cocStatus: 'Pass' }), today)).toBe(false));
  it('Pending does not fail', () => expect(cocDocFails(doc({ cocStatus: 'Pending' }), today)).toBe(false));
});

describe('rollupStatus', () => {
  it('no docs => Missing', () => expect(rollupStatus([], today)).toBe('Missing'));
  it('any fail => Fail', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pass' }), doc({ cocStatus: 'Fail' })], today)).toBe('Fail'));
  it('expired pass still rolls up as Pass (re-verification, not expiry, invalidates)', () =>
    expect(rollupStatus([doc({ cocStatus: 'Pass', cocExpiryDate: '2025-01-01' })], today)).toBe('Pass'));
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

describe('isCocCertificateCategory', () => {
  it('accepts the COC certificate category', () => {
    expect(isCocCertificateCategory('01 COC')).toBe(true);
  });
  it("rejects the evaluation-reports category (contains 'report')", () => {
    expect(isCocCertificateCategory('07 COC Evaluation Reports')).toBe(false);
  });
  it('rejects the old validation-reports category', () => {
    expect(isCocCertificateCategory('COC Validation Reports')).toBe(false);
  });
  it('rejects unrelated categories', () => {
    expect(isCocCertificateCategory('04 Metering')).toBe(false);
  });
});

describe('buildCocCardLines', () => {
  it('no documents => single "I — Missing" line', () => {
    const lines = buildCocCardLines([]);
    expect(lines).toEqual([{ label: 'I', number: 'Missing', status: 'Missing', missing: true }]);
  });

  it('initial present => I line carries its number and status', () => {
    const lines = buildCocCardLines([
      doc({ id: 'a', cocType: 'Initial', cocNumber: 'COC-1', cocStatus: 'Pass' }),
    ]);
    expect(lines).toEqual([{ label: 'I', number: 'COC-1', status: 'Pass', missing: false }]);
  });

  it('initial + supplementaries => I then S lines, issue-date ascending', () => {
    const lines = buildCocCardLines([
      doc({ id: 's2', cocType: 'Supplementary', cocNumber: 'COC-30', cocIssueDate: '2026-03-01', cocStatus: 'Pending' }),
      doc({ id: 'i', cocType: 'Initial', cocNumber: 'COC-10', cocIssueDate: '2026-01-01', cocStatus: 'Pass' }),
      doc({ id: 's1', cocType: 'Supplementary', cocNumber: 'COC-20', cocIssueDate: '2026-02-01', cocStatus: 'Pass' }),
    ]);
    expect(lines).toEqual([
      { label: 'I', number: 'COC-10', status: 'Pass', missing: false },
      { label: 'S', number: 'COC-20', status: 'Pass', missing: false },
      { label: 'S', number: 'COC-30', status: 'Pending', missing: false },
    ]);
  });

  it('supplementary present but NO initial => still emits "I — Missing" first', () => {
    const lines = buildCocCardLines([
      doc({ id: 's', cocType: 'Supplementary', cocNumber: 'COC-99', cocStatus: 'Pass' }),
    ]);
    expect(lines).toEqual([
      { label: 'I', number: 'Missing', status: 'Missing', missing: true },
      { label: 'S', number: 'COC-99', status: 'Pass', missing: false },
    ]);
  });

  it('Temporary docs are listed as supplementary (S)', () => {
    const lines = buildCocCardLines([
      doc({ id: 'i', cocType: 'Initial', cocNumber: 'COC-10', cocStatus: 'Pass' }),
      doc({ id: 't', cocType: 'Temporary', cocNumber: 'COC-T', cocStatus: 'Pending' }),
    ]);
    expect(lines.map(l => l.label)).toEqual(['I', 'S']);
    expect(lines[1].number).toBe('COC-T');
  });

  it('uploaded initial without a number => "—" placeholder, not Missing', () => {
    const lines = buildCocCardLines([
      doc({ id: 'i', cocType: 'Initial', cocNumber: null, cocStatus: 'Pending' }),
    ]);
    expect(lines).toEqual([{ label: 'I', number: '—', status: 'Pending', missing: false }]);
  });
});
