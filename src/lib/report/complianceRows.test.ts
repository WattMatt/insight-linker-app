import { describe, it, expect } from 'vitest';
import { buildComplianceSummaryRows, type ComplianceStats } from './complianceRows';

const stats = (o: Partial<ComplianceStats> = {}): ComplianceStats => ({
  total: 0, compliant: 0, nonCompliant: 0, expiringSoon: 0, expired: 0, pendingReview: 0, ...o,
});

describe('buildComplianceSummaryRows', () => {
  it('computes rounded percentages for a normal dataset', () => {
    const rows = buildComplianceSummaryRows(stats({ total: 4, compliant: 1, nonCompliant: 3 }));
    const compliant = rows.find(r => r.metric === 'Compliant')!;
    expect(compliant.count).toBe(1);
    expect(compliant.percentage).toBe('25%');
  });
  it('never produces NaN% when total is 0', () => {
    const rows = buildComplianceSummaryRows(stats({ total: 0 }));
    for (const r of rows) {
      expect(r.percentage).not.toContain('NaN');
    }
    expect(rows.find(r => r.metric === 'Non-Compliant')!.percentage).toBe('0%');
  });
  it('always shows the Total Items row at 100% when there are items, 0% when none', () => {
    expect(buildComplianceSummaryRows(stats({ total: 4, compliant: 4 })).find(r => r.metric === 'Total Items')!.percentage).toBe('100%');
    expect(buildComplianceSummaryRows(stats({ total: 0 })).find(r => r.metric === 'Total Items')!.percentage).toBe('0%');
  });
});
