import { extractCocNumber } from "@/lib/cocFilename";
import { normCert } from "./normalize";

export type FileKind = "coc" | "eval";

export function classifyCocFile(fileName: string): FileKind {
  const base = fileName.replace(/^.*[\\/]/, "");
  if (/^(pass|fail)[-_\s]/i.test(base)) return "eval";
  if (/\.html?$/i.test(base)) return "eval";
  return "coc";
}

export interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null; }
export interface RoutePlanItem {
  name: string; kind: FileKind; certNo: string | null;
  subsectionId: string | null; certRowId: string | null;
  status: "routed" | "unmatched" | "ambiguous";
}

export function planRouting(files: { name: string }[], certRows: CertRowLite[]): RoutePlanItem[] {
  const plan: RoutePlanItem[] = files.map(f => {
    const kind = classifyCocFile(f.name);
    const certNo = extractCocNumber(f.name);
    const key = certNo ? normCert(certNo) : "";
    const matches = key ? certRows.filter(r => r.cert_no_norm === key && r.subsection_id) : [];
    if (matches.length === 1) return { name: f.name, kind, certNo, subsectionId: matches[0].subsection_id, certRowId: matches[0].id, status: "routed" };
    if (matches.length === 0) return { name: f.name, kind, certNo, subsectionId: null, certRowId: null, status: "unmatched" };
    return { name: f.name, kind, certNo, subsectionId: null, certRowId: null, status: "ambiguous" };
  });
  return plan.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "coc" ? -1 : 1));
}
