// Presentation mapping for the public QR verdict card.
// Register-truth rule: expiry is DISPLAY-ONLY — it can add a hint to a Pass,
// never change the verdict. Raw failure reasons are never shown publicly.
export interface PublicVerdict {
  coc_required: boolean;
  status: string | null;
  cert_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
}

export type VerdictKind = "pass" | "pass-expiring" | "fail" | "pending" | "missing" | "none";

export interface VerdictPresentation {
  kind: VerdictKind;
  headline: string;
  sub: string | null;
}

const PASS = new Set(["Pass", "Approved", "Valid"]);
const FAIL = new Set(["Fail", "Failed", "Rejected"]);
const EXPIRY_HINT_DAYS = 30;

export function presentVerdict(v: PublicVerdict | null, today: Date): VerdictPresentation {
  if (!v || !v.coc_required || v.status === "N/A" || v.status == null) {
    return { kind: "none", headline: "", sub: null };
  }
  if (FAIL.has(v.status)) {
    return { kind: "fail", headline: "Not compliant", sub: "Certificate of Compliance — remedial work in progress" };
  }
  if (PASS.has(v.status)) {
    if (v.expiry_date) {
      const days = (new Date(v.expiry_date).getTime() - today.getTime()) / 86_400_000;
      if (days < EXPIRY_HINT_DAYS) {
        return { kind: "pass-expiring", headline: "Compliant", sub: "COC expiry date approaching — re-verification pending" };
      }
    }
    return { kind: "pass", headline: "Compliant", sub: null };
  }
  if (v.status === "Missing") {
    return { kind: "missing", headline: "No COC on record yet", sub: null };
  }
  return { kind: "pending", headline: "Verification in progress", sub: null };
}
