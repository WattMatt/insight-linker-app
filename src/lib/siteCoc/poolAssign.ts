import { normCert } from "./normalize";

export interface PoolFileLite { id: string; detected_cert_no: string | null; detected_kind: string | null; }
export interface CertRowLite { id: string; cert_no_norm: string; subsection_id: string | null; }
export interface AutoAssign { poolId: string; subsectionId: string; kind: "coc" | "eval"; }

/** Auto-assign only files whose detected number maps to exactly one register cert with a subsection. */
export function planPoolAutoAssign(files: PoolFileLite[], certRows: CertRowLite[]): AutoAssign[] {
  const out: AutoAssign[] = [];
  for (const f of files) {
    const key = f.detected_cert_no ? normCert(f.detected_cert_no) : "";
    if (!key) continue;
    const matches = certRows.filter(c => c.cert_no_norm === key && c.subsection_id);
    if (matches.length !== 1) continue;
    out.push({ poolId: f.id, subsectionId: matches[0].subsection_id as string, kind: f.detected_kind === "eval" ? "eval" : "coc" });
  }
  return out;
}
