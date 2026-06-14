import { describe, it, expect } from 'vitest';
import {
  progressLevel,
  buildFortressKpis,
  buildFortressItemRows,
  type FortressChecklistData,
  type FortressChecklistSection,
} from './fortressChecklistRows';

const data = (o: Partial<FortressChecklistData> = {}): FortressChecklistData => ({
  overallProgress: 0,
  sections: [],
  stats: { completed: 0, pending: 0, notApplicable: 0, total: 0 },
  ...o,
});

describe('progressLevel', () => {
  it('maps >=80 to success', () => {
    expect(progressLevel(80)).toBe('success');
    expect(progressLevel(100)).toBe('success');
  });
  it('maps 50..79 to warning', () => {
    expect(progressLevel(50)).toBe('warning');
    expect(progressLevel(79)).toBe('warning');
  });
  it('maps <50 to error', () => {
    expect(progressLevel(49)).toBe('error');
    expect(progressLevel(0)).toBe('error');
  });
});

describe('buildFortressKpis', () => {
  it('returns the four KPIs in order with stat values', () => {
    const kpis = buildFortressKpis(data({
      overallProgress: 75,
      stats: { completed: 6, pending: 2, notApplicable: 1, total: 8 },
    }));
    expect(kpis.map((k) => k.label)).toEqual(['Overall Progress', 'Completed', 'Pending', 'Not Applicable']);
    expect(kpis.map((k) => k.value)).toEqual(['75%', '6', '2', '1']);
    expect(kpis[0].level).toBe('warning'); // 75% -> amber
  });
});

describe('buildFortressItemRows', () => {
  const section = (items: FortressChecklistSection['items']): FortressChecklistSection => ({
    name: 'S', progress: 0, items,
  });

  it('marks N/A regardless of checked state, with no date', () => {
    const [row] = buildFortressItemRows(section([
      { label: 'X', isChecked: true, isNotApplicable: true, checkedAt: '2026-06-13' },
    ]));
    expect(row.status).toBe('N/A');
    expect(row.completed).toBe('—');
  });

  it('shows Done + formatted date for a checked item', () => {
    const [row] = buildFortressItemRows(section([
      { label: 'X', isChecked: true, isNotApplicable: false, checkedAt: '2026-06-13' },
    ]));
    expect(row.status).toBe('Done');
    expect(row.completed).toBe('13 June 2026');
  });

  it('shows Done with em-dash when checked but no date recorded', () => {
    const [row] = buildFortressItemRows(section([
      { label: 'X', isChecked: true, isNotApplicable: false },
    ]));
    expect(row.status).toBe('Done');
    expect(row.completed).toBe('—');
  });

  it('marks Pending for unchecked items', () => {
    const [row] = buildFortressItemRows(section([
      { label: 'X', isChecked: false, isNotApplicable: false },
    ]));
    expect(row.status).toBe('Pending');
    expect(row.completed).toBe('—');
  });

  it('falls back to em-dash for a blank label (no silent empty cell)', () => {
    const [row] = buildFortressItemRows(section([
      { label: '   ', isChecked: false, isNotApplicable: false },
    ]));
    expect(row.label).toBe('—');
  });

  it('preserves item order and count', () => {
    const rows = buildFortressItemRows(section([
      { label: 'A', isChecked: true, isNotApplicable: false },
      { label: 'B', isChecked: false, isNotApplicable: false },
      { label: 'C', isChecked: false, isNotApplicable: true },
    ]));
    expect(rows.map((r) => r.label)).toEqual(['A', 'B', 'C']);
    expect(rows.map((r) => r.status)).toEqual(['Done', 'Pending', 'N/A']);
  });
});
