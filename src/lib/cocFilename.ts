/**
 * Extract a COC number from a filename. The number is the letter prefix
 * immediately in front of a digit run (not hardcoded to "B"), normalised to
 * `PREFIX-DIGITS` (e.g. "B-1612744"). A leading PASS/FAIL verdict token is
 * ignored. Returns null when no letter+digit token is present.
 */
export function extractCocNumber(fileName: string): string | null {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const stripped = base.replace(/^(pass|fail)[-_\s]+/i, "");
  const m = stripped.match(/([A-Za-z]+)[-_\s]?(\d+)/);
  if (!m) return null;
  return `${m[1].toUpperCase()}-${m[2]}`;
}

/**
 * Read a Pass/Fail verdict from a leading PASS-/FAIL- filename token.
 * Used only to pre-select the eval verdict; the value stays editable.
 */
export function extractEvalVerdict(fileName: string): "Pass" | "Fail" | null {
  const base = fileName.replace(/^.*[\\/]/, "");
  if (/^pass[-_\s]/i.test(base)) return "Pass";
  if (/^fail[-_\s]/i.test(base)) return "Fail";
  return null;
}
