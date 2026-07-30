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
const MS_PER_DAY = 86_400_000;

/**
 * Whole calendar days from `today` until `expiryDate`, negative once it has passed, or
 * null when the stored value is not a parseable date. Calendar days rather than raw
 * millisecond arithmetic, so the hint boundary cannot shift with the hour of the day the
 * card happens to be scanned. expiry_date is a date-only column (parses as UTC midnight);
 * `today` is a local clock reading, so its local calendar date is the one that counts.
 */
function daysUntil(expiryDate: string, today: Date): number | null {
  const expiry = new Date(expiryDate);
  if (Number.isNaN(expiry.getTime())) return null;
  const expiryDay = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiryDay - todayDay) / MS_PER_DAY);
}

export function presentVerdict(v: PublicVerdict | null, today: Date): VerdictPresentation {
  if (!v || !v.coc_required || v.status === "N/A" || v.status == null) {
    return { kind: "none", headline: "", sub: null };
  }
  if (FAIL.has(v.status)) {
    return { kind: "fail", headline: "Not compliant", sub: "Certificate of Compliance — remedial work in progress" };
  }
  if (PASS.has(v.status)) {
    const days = v.expiry_date ? daysUntil(v.expiry_date, today) : null;
    if (days !== null && days < 0) {
      // A lapsed expiry may not flip the register verdict to Fail, but it may not keep
      // asserting compliance either: the card drops to the neutral state instead.
      return { kind: "pending", headline: "COC expired", sub: "Certificate of Compliance has lapsed — re-verification pending" };
    }
    if (days !== null && days < EXPIRY_HINT_DAYS) {
      return { kind: "pass-expiring", headline: "Compliant", sub: "COC expiry date approaching — re-verification pending" };
    }
    return { kind: "pass", headline: "Compliant", sub: null };
  }
  if (v.status === "Missing") {
    return { kind: "missing", headline: "No COC on record yet", sub: null };
  }
  return { kind: "pending", headline: "Verification in progress", sub: null };
}
