import { describe, it, expect } from 'vitest';
import { buildCocValidationRows, buildInspectionRows } from './siteSummaryRows';

describe('buildCocValidationRows', () => {
  it('includes ALL rows — no 20-row cap', () => {
    const subs = Array.from({ length: 23 }, (_, i) => ({
      name: `Sub ${i}`, coc_number: `C${i}`, coc_status: 'Valid', coc_issue_date: '2026-06-13',
    }));
    expect(buildCocValidationRows(subs)).toHaveLength(23);
  });
  it('formats the issue date day-first and guards missing dates', () => {
    const rows = buildCocValidationRows([
      { name: 'A', coc_number: 'C1', coc_status: 'Valid', coc_issue_date: '2026-06-13' },
      { name: 'B', coc_number: null, coc_status: null, coc_issue_date: null },
    ]);
    expect(rows[0].date).toBe('13 June 2026');
    expect(rows[0].cocNumber).toBe('C1');
    expect(rows[1].date).toBe('—');
    expect(rows[1].cocNumber).toBe('-');
    expect(rows[1].status).toBe('Missing');
  });
});

describe('buildInspectionRows', () => {
  it('includes ALL rows — no 20-row cap', () => {
    const insp = Array.from({ length: 25 }, (_, i) => ({
      title: `T${i}`, status: 'Completed', inspector_name: 'Sam', inspection_date: '2026-06-13',
    }));
    expect(buildInspectionRows(insp)).toHaveLength(25);
  });
  it('guards missing fields', () => {
    const rows = buildInspectionRows([{ title: null, status: null, inspector_name: null, inspection_date: null }]);
    expect(rows[0].title).toBe('Untitled');
    expect(rows[0].status).toBe('Unknown');
    expect(rows[0].inspector).toBe('-');
    expect(rows[0].date).toBe('—');
  });
});
