/**
 * Read-only rendering of the health score's weighted factors — the shared visual for
 * every surface that explains WHAT the % is made of (admin dashboard, client portal).
 * Pure presentation: callers compute the breakdown via healthBreakdown() so the rows
 * always reconcile with the canonical score.
 */
import { getHealthBand, type FactorBreakdown } from "@/lib/siteHealth";

/** 1-decimal points formatter: 32.55 → "32.6", 25.0000004 → "25". */
export const fmtPts = (p: number): string => {
  const r1 = Math.round(p * 10) / 10;
  return Number.isInteger(r1) ? String(r1) : r1.toFixed(1);
};

/** Plain-English list of what closes the gap to 100%, e.g. "resolve 7 snags (+40 pts)". */
export function describeHealthGaps(breakdown: FactorBreakdown[]): string[] {
  const by = Object.fromEntries(breakdown.map((f) => [f.key, f]));
  const gaps: string[] = [];
  const snagGap = by.snags.total - by.snags.done;
  if (snagGap > 0) gaps.push(`resolve ${snagGap} snag${snagGap === 1 ? "" : "s"} (+${fmtPts(by.snags.maxPoints - by.snags.points)} pts)`);
  const inspGap = by.inspections.total - by.inspections.done;
  if (inspGap > 0) gaps.push(`add photos to ${inspGap} inspection${inspGap === 1 ? "" : "s"} (+${fmtPts(by.inspections.maxPoints - by.inspections.points)} pts)`);
  const meterGap = by.metering.total - by.metering.done;
  if (meterGap > 0) gaps.push(`meter ${meterGap} subsection${meterGap === 1 ? "" : "s"} (+${fmtPts(by.metering.maxPoints - by.metering.points)} pts)`);
  return gaps;
}

interface HealthFactorRowsProps {
  breakdown: FactorBreakdown[];
  /** When set, each row becomes a button (admin dashboard deep-links); omit for read-only surfaces. */
  onFactorClick?: (key: FactorBreakdown["key"]) => void;
  className?: string;
}

export const HealthFactorRows = ({ breakdown, onFactorClick, className }: HealthFactorRowsProps) => (
  <div className={className ?? "space-y-3"}>
    {breakdown.map((f) => {
      const band = getHealthBand(f.factor);
      const barColor = band === "success" ? "bg-green-500" : band === "warning" ? "bg-yellow-500" : "bg-red-500";
      const row = (
        <>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className={`text-sm ${onFactorClick ? "group-hover:underline" : ""}`}>{f.label}</span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {f.done}/{f.total} · <span className="font-medium text-foreground">{fmtPts(f.points)}</span>/{f.maxPoints} pts
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${f.factor}%` }} />
          </div>
        </>
      );
      return onFactorClick ? (
        <button key={f.key} type="button" onClick={() => onFactorClick(f.key)} className="w-full text-left group">
          {row}
        </button>
      ) : (
        <div key={f.key}>{row}</div>
      );
    })}
  </div>
);
