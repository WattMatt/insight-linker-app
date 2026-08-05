export function normShop(s: string | null | undefined): string {
  // "&" -> "AND" (both sides) so "FISH & CHIPS" matches subsection "FISH AND CHIPS".
  return (s ?? "").toString().toUpperCase().replace(/&/g, " AND ").replace(/[\s\-_]+/g, " ").trim();
}

export function normCert(s: string | null | undefined): string {
  // Strip spaces AND hyphens so "B 1612744", "B-1612744" and "B1612744" all match.
  return (s ?? "").toString().toUpperCase().replace(/[\s-]+/g, "").trim();
}

export function normCertType(s: string | null | undefined): "Initial" | "Supplementary" | "Unclear" {
  const v = (s ?? "").toString().trim().toLowerCase();
  if (v === "i" || v === "initial") return "Initial";
  if (v === "s" || v === "supplementary") return "Supplementary";
  return "Unclear";
}

export function parseFilesCount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

// yyyy-mm-dd from LOCAL components. An issued date is a calendar date, and xlsx
// (cellDates:true) materialises a date cell as LOCAL midnight — toISOString() would
// shift that back a day everywhere east of Greenwich, South Africa included.
function localIsoDate(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseIssuedDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return localIsoDate(v);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : localIsoDate(dt);
}
