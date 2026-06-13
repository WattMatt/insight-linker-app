import { percent } from './reportKernel';

export interface ComplianceStats {
  total: number;
  compliant: number;
  nonCompliant: number;
  expiringSoon: number;
  expired: number;
  pendingReview: number;
}

export interface ComplianceSummaryRow {
  metric: string;
  count: number;
  percentage: string;
}

/** Build the compliance summary table rows with divide-by-zero-safe percentages. */
export function buildComplianceSummaryRows(stats: ComplianceStats): ComplianceSummaryRow[] {
  const t = stats.total;
  return [
    { metric: 'Total Items', count: t, percentage: percent(t, t) },
    { metric: 'Compliant', count: stats.compliant, percentage: percent(stats.compliant, t) },
    { metric: 'Non-Compliant', count: stats.nonCompliant, percentage: percent(stats.nonCompliant, t) },
    { metric: 'Expiring Within 90 Days', count: stats.expiringSoon, percentage: percent(stats.expiringSoon, t) },
    { metric: 'Expired', count: stats.expired, percentage: percent(stats.expired, t) },
    { metric: 'Pending Review', count: stats.pendingReview, percentage: percent(stats.pendingReview, t) },
  ];
}
