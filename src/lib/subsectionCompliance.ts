import { CocDoc, cocDocFails } from "./cocHierarchy";

export interface SubsectionVerdict {
  installation: boolean;
  documentationRequired: boolean;
  documentation: boolean; // true also when not required
  overall: boolean;
}

export interface VerdictInput {
  isCocRequired: boolean;
  openSnagCount: number;
  meteringStatus: string | null | undefined;
  meterSerialNumber: string | null | undefined;
  cocDocs: CocDoc[];
  today: string; // YYYY-MM-DD
}

/**
 * Two-dimension subsection compliance.
 *
 * - Installation Review: physical health — no open snags AND metering not explicitly
 *   "Missing" without a serial. COC plays no part.
 * - Documentation: COC paperwork — when not required, compliant; otherwise compliant only
 *   when an Initial-typed COC document exists and is Pass (register verdict; expiry is
 *   display-only). Same source as the I/S card line (cocHierarchy), so the two never disagree.
 * - Overall: both pass.
 */
export function computeSubsectionVerdict(input: VerdictInput): SubsectionVerdict {
  const installation =
    input.openSnagCount === 0 &&
    !(input.meteringStatus === "Missing" && !input.meterSerialNumber);

  const documentationRequired = input.isCocRequired;
  let documentation = true;
  if (documentationRequired) {
    const initial = input.cocDocs.find(d => d.cocType === "Initial");
    documentation = !!initial && initial.cocStatus === "Pass" && !cocDocFails(initial, input.today);
  }

  return { installation, documentationRequired, documentation, overall: installation && documentation };
}
