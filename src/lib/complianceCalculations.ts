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
 * COC compliance rate from counts. Shared by every surface that shows a COC percentage
 * (compliance dashboard, site summary report) so the number can never drift between them.
 * An empty scope (nothing requires a COC) is vacuously compliant → 100, matching the
 * empty-denominator convention in siteHealth.ts, inspectionScore.ts and buildingCompliance.ts.
 */
export function cocComplianceRate(approvedCount: number, requiredCount: number): number {
  return requiredCount > 0 ? Math.round((approvedCount / requiredCount) * 100) : 100;
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

  const isMetered = (s: SubsectionForCompliance) =>
    s.metering_status === 'Installed' || !!s.meter_serial_number;

  // Site-wide count (what the site header shows); metering is tracked on every subsection.
  const meteringInstalledCount = subsections.filter(isMetered).length;

  // The rate is scoped to the COC-required subsections so it shares a denominator with
  // cocComplianceRate and stays bounded by 100 — counting site-wide installs against the
  // COC-required count lets the percentage run past 100.
  const meteringRequiredCount = cocRequiredSubsections.filter(isMetered).length;

  return {
    totalSubsections,
    cocRequiredCount,
    cocApprovedCount,
    meteringInstalledCount,
    cocComplianceRate: cocComplianceRate(cocApprovedCount, cocRequiredCount),
    meteringComplianceRate: cocComplianceRate(meteringRequiredCount, cocRequiredCount),
  };
}
