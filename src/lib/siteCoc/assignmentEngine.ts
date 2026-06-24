import { normCert } from "./normalize";

export interface PoolFileLite { id: string; detected_cert_no: string | null; detected_kind: string | null; }
export interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null; }

export type AssignOutcome =
  | "assigned"
  | "ambiguous_cert"
  | "cert_has_no_subsection"
  | "cert_not_found"
  | "no_cert_detected";

export interface PoolClassification {
  poolId: string;
  outcome: AssignOutcome;
  certId?: string;
  subsectionId?: string;
  candidateCertIds?: string[];
  candidateSubsectionIds?: string[];
}

/** Classify every pooled file by how its detected cert number maps to the site's register certs. */
export function planPoolAssignment(files: PoolFileLite[], certs: CertRowLite[]): PoolClassification[] {
  return files.map((f): PoolClassification => {
    const key = f.detected_cert_no ? normCert(f.detected_cert_no) : "";
    if (!key) return { poolId: f.id, outcome: "no_cert_detected" };

    const matches = certs.filter((c) => c.cert_no_norm === key);
    if (matches.length === 0) return { poolId: f.id, outcome: "cert_not_found" };

    if (matches.length === 1) {
      const only = matches[0];
      return only.subsection_id
        ? { poolId: f.id, outcome: "assigned", certId: only.id, subsectionId: only.subsection_id }
        : { poolId: f.id, outcome: "cert_has_no_subsection", certId: only.id };
    }

    // >1 match: unambiguous only if every duplicate points to the SAME single subsection.
    const subs = Array.from(new Set(matches.map((c) => c.subsection_id).filter((x): x is string => !!x)));
    if (subs.length === 1 && matches.every((c) => c.subsection_id)) {
      return { poolId: f.id, outcome: "assigned", certId: matches[0].id, subsectionId: subs[0] };
    }
    return {
      poolId: f.id,
      outcome: "ambiguous_cert",
      candidateCertIds: matches.map((c) => c.id),
      candidateSubsectionIds: subs,
    };
  });
}
