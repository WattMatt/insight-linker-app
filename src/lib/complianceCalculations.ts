/**
 * Unified Compliance Calculation Utilities
 *
 * COC compliance is derived directly from the subsection's manual `coc_status` verdict.
 * The old auto-validation engine was removed; there is no longer a separate validation
 * record — `coc_status` IS the verdict. These pure helpers are the single source of truth
 * for COC compliance counts across Overview, Compliance Dashboard, and the main Dashboard.
 *
 * Based on SANS 10142-1 compliance requirements.
 */

export interface SubsectionForCompliance {
  id: string;
  is_coc_required?: boolean | null;
  coc_status?: string | null;
  metering_status?: string | null;
  meter_serial_number?: string | null;
}

export interface ComplianceStats {
  totalSubsections: number;
  cocRequiredCount: number;
  cocApprovedCount: number;
  meteringInstalledCount: number;
  cocComplianceRate: number;
  meteringComplianceRate: number;
}

/**
 * COC statuses that indicate a passing certificate. Vocab-tolerant: the new manual flow
 * writes 'Pass', legacy data may still carry 'Approved'/'Valid'.
 */
export const VALID_COC_STATUSES = ['Approved', 'Valid', 'Pass'] as const;

/**
 * COC statuses that indicate a failed certificate.
 */
export const FAILED_COC_STATUSES = ['Fail', 'Failed', 'Rejected'] as const;

/**
 * Check if a subsection has a passing COC status.
 */
export function hasValidCocStatus(cocStatus: string | null | undefined): boolean {
  if (!cocStatus) return false;
  return VALID_COC_STATUSES.includes(cocStatus as typeof VALID_COC_STATUSES[number]);
}

/**
 * Check if a subsection's COC verdict is a failure.
 */
export function hasFailedCocStatus(cocStatus: string | null | undefined): boolean {
  if (!cocStatus) return false;
  return FAILED_COC_STATUSES.includes(cocStatus as typeof FAILED_COC_STATUSES[number]);
}

/**
 * Check if a subsection is COC compliant.
 * Compliant when COC is not required, or its manual verdict is a pass.
 */
export function isSubsectionCocCompliant(subsection: SubsectionForCompliance): boolean {
  if (!subsection.is_coc_required) return true;
  return hasValidCocStatus(subsection.coc_status);
}

/**
 * Calculate COC + metering compliance statistics for a set of subsections, derived purely
 * from each subsection's `coc_status` verdict. SINGLE SOURCE OF TRUTH for COC counts.
 */
export function calculateCocComplianceStats(
  subsections: SubsectionForCompliance[]
): ComplianceStats {
  const totalSubsections = subsections.length;

  const cocRequiredSubsections = subsections.filter(s => s.is_coc_required);
  const cocRequiredCount = cocRequiredSubsections.length;

  const cocApprovedCount = cocRequiredSubsections.filter(s =>
    hasValidCocStatus(s.coc_status)
  ).length;

  const meteringInstalledCount = subsections.filter(s =>
    s.metering_status === 'Installed' || !!s.meter_serial_number
  ).length;

  const cocComplianceRate = cocRequiredCount > 0
    ? Math.round((cocApprovedCount / cocRequiredCount) * 100)
    : 100;

  const meteringComplianceRate = cocRequiredCount > 0
    ? Math.round((meteringInstalledCount / cocRequiredCount) * 100)
    : 100;

  return {
    totalSubsections,
    cocRequiredCount,
    cocApprovedCount,
    meteringInstalledCount,
    cocComplianceRate,
    meteringComplianceRate,
  };
}
