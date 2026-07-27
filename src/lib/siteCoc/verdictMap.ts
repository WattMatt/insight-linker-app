/**
 * Map an imported register verdict (coc_certificates.verdict, from the
 * Verification workbook) to a per-document COC status. The register is the
 * single source of truth: PASS→Pass, FAIL→Fail, anything else (CV / blank /
 * unknown) → Pending ("awaiting verification"). Matches verdictTone() prefixes.
 */
export function docStatusFromVerdict(verdict: string | null | undefined): "Pass" | "Fail" | "Pending" {
  const v = (verdict ?? "").trim().toUpperCase();
  if (v.startsWith("PASS")) return "Pass";
  if (v.startsWith("FAIL")) return "Fail";
  return "Pending";
}
