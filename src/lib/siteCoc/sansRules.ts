export type RuleResult = "PASS" | "FAIL" | "CV" | "N/A";
export interface SansRule { code: string; label: string; group: "A" | "B" | "C"; }

export const COC_SANS_RULES: SansRule[] = [
  { code: "A1", label: "cert no", group: "A" },
  { code: "A2", label: "test report", group: "A" },
  { code: "A4", label: "date", group: "A" },
  { code: "A5", label: "reg no", group: "A" },
  { code: "A6", label: "signature", group: "A" },
  { code: "B1", label: "conductors", group: "B" },
  { code: "B2", label: "components", group: "B" },
  { code: "B3", label: "disconnect", group: "B" },
  { code: "B4", label: "labelling", group: "B" },
  { code: "C1", label: "bonding", group: "C" },
  { code: "C2", label: "ECC", group: "C" },
  { code: "C3", label: "ring", group: "C" },
  { code: "C7", label: "neutral elev", group: "C" },
  { code: "C8", label: "insulation", group: "C" },
  { code: "C9", label: "V no-load", group: "C" },
  { code: "C10", label: "V on-load", group: "C" },
  { code: "C11", label: "E/L trip", group: "C" },
  { code: "C12", label: "E/L button", group: "C" },
  { code: "C13", label: "polarity", group: "C" },
  { code: "C14", label: "phase rot", group: "C" },
  { code: "C15", label: "switching", group: "C" },
];

const KNOWN = new Set(COC_SANS_RULES.map(r => r.code));

/** Extract a rule code (e.g. "A1") from a Verification column header like "A1 cert no". */
export function ruleCodeFromHeader(header: string): string | null {
  const m = (header ?? "").trim().match(/^([abc]\d+)\b/i);
  if (!m) return null;
  return m[1].toUpperCase();
}

export function isKnownRuleCode(code: string): boolean { return KNOWN.has(code); }
