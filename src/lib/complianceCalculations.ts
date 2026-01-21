/**
 * Unified Compliance Calculation Utilities
 * 
 * This module provides consistent compliance calculation logic across the application.
 * All compliance-related calculations should use these functions to ensure consistency
 * between the Overview, Compliance Dashboard, and main Dashboard views.
 * 
 * Based on SANS 10142-1 compliance requirements.
 */

import { supabase } from "@/integrations/supabase/client";

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
 * Valid COC statuses that indicate compliance
 */
export const VALID_COC_STATUSES = ['Approved', 'Valid', 'Pass'] as const;

/**
 * Failed validation statuses that indicate non-compliance
 */
export const FAILED_VALIDATION_STATUSES = ['Fail', 'Failed', 'Incomplete'] as const;

/**
 * Fetch the set of subsection IDs that have failed validations.
 * Only considers the MOST RECENT validation per subsection.
 * 
 * @param subsectionIds - Array of subsection IDs to check
 * @returns Set of subsection IDs with failed validations
 */
export async function fetchFailedValidationsBySubsection(
  subsectionIds: string[]
): Promise<Set<string>> {
  if (subsectionIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from('coc_validations')
    .select('subsection_id, status, validated_at')
    .in('subsection_id', subsectionIds)
    .order('validated_at', { ascending: false });

  if (error) {
    console.error("Error fetching COC validations:", error);
    return new Set();
  }

  // Only consider the MOST RECENT validation per subsection
  const latestBySubsection = new Map<string, string>();
  data?.forEach(validation => {
    if (!latestBySubsection.has(validation.subsection_id)) {
      latestBySubsection.set(validation.subsection_id, validation.status);
    }
  });

  const failedSet = new Set<string>();
  latestBySubsection.forEach((status, subsectionId) => {
    if (FAILED_VALIDATION_STATUSES.includes(status as typeof FAILED_VALIDATION_STATUSES[number])) {
      failedSet.add(subsectionId);
    }
  });

  return failedSet;
}

/**
 * Check if a subsection has a valid COC status
 * 
 * @param cocStatus - The COC status string
 * @returns true if the status indicates valid compliance
 */
export function hasValidCocStatus(cocStatus: string | null | undefined): boolean {
  if (!cocStatus) return false;
  return VALID_COC_STATUSES.includes(cocStatus as typeof VALID_COC_STATUSES[number]);
}

/**
 * Check if a subsection is COC compliant.
 * A subsection is compliant if:
 * 1. COC is not required, OR
 * 2. COC is required AND has a valid status AND no failed validations
 * 
 * @param subsection - The subsection to check
 * @param failedValidationsBySubsection - Set of subsection IDs with failed validations
 * @returns true if compliant
 */
export function isSubsectionCocCompliant(
  subsection: SubsectionForCompliance,
  failedValidationsBySubsection: Set<string>
): boolean {
  // If COC not required, it's compliant by default
  if (!subsection.is_coc_required) return true;
  
  // If there's a failed validation, not compliant
  if (failedValidationsBySubsection.has(subsection.id)) return false;
  
  // Check if the primary COC status is valid
  return hasValidCocStatus(subsection.coc_status);
}

/**
 * Calculate COC compliance statistics for a set of subsections.
 * This is the SINGLE SOURCE OF TRUTH for compliance calculations.
 * 
 * @param subsections - Array of subsections to analyze
 * @param failedValidationsBySubsection - Set of subsection IDs with failed validations
 * @returns Compliance statistics
 */
export function calculateCocComplianceStats(
  subsections: SubsectionForCompliance[],
  failedValidationsBySubsection: Set<string>
): ComplianceStats {
  const totalSubsections = subsections.length;
  
  // Count subsections that require COC
  const cocRequiredSubsections = subsections.filter(s => s.is_coc_required);
  const cocRequiredCount = cocRequiredSubsections.length;
  
  // Count subsections with approved COC (and no failed validations)
  const cocApprovedCount = cocRequiredSubsections.filter(s => {
    if (failedValidationsBySubsection.has(s.id)) return false;
    return hasValidCocStatus(s.coc_status);
  }).length;
  
  // Count subsections with metering installed
  const meteringInstalledCount = subsections.filter(s => 
    s.metering_status === 'Installed' || !!s.meter_serial_number
  ).length;
  
  // Calculate rates
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

/**
 * Full compliance calculation including fetching validation data.
 * Use this for one-off calculations when you don't already have validation data.
 * 
 * @param subsections - Array of subsections to analyze
 * @returns Promise resolving to compliance statistics and failed validations set
 */
export async function calculateComplianceWithValidations(
  subsections: SubsectionForCompliance[]
): Promise<{ stats: ComplianceStats; failedValidationsBySubsection: Set<string> }> {
  const subsectionIds = subsections.map(s => s.id);
  const failedValidationsBySubsection = await fetchFailedValidationsBySubsection(subsectionIds);
  const stats = calculateCocComplianceStats(subsections, failedValidationsBySubsection);
  
  return { stats, failedValidationsBySubsection };
}
