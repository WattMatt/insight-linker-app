import { planPoolAssignment, type PoolFileLite, type CertRowLite } from "./assignmentEngine";

export type { PoolFileLite, CertRowLite } from "./assignmentEngine";

export interface AutoAssign { poolId: string; subsectionId: string; kind: "coc" | "eval"; }

/** Auto-assign only files the engine classifies as `assigned`. */
export function planPoolAutoAssign(files: PoolFileLite[], certRows: CertRowLite[]): AutoAssign[] {
  const byId = new Map(files.map((f) => [f.id, f]));
  return planPoolAssignment(files, certRows)
    .filter((c) => c.outcome === "assigned")
    .map((c) => {
      const f = byId.get(c.poolId)!;
      return { poolId: c.poolId, subsectionId: c.subsectionId as string, kind: f.detected_kind === "eval" ? "eval" : "coc" };
    });
}
