export function normShop(s: string | null | undefined): string {
  return (s ?? "").toString().toUpperCase().replace(/[\s\-_]+/g, " ").trim();
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

export function parseIssuedDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
