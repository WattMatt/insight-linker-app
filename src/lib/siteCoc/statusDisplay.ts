export type Tone = "green" | "red" | "amber" | "slate";

/** Schedule "Status" text → semantic tone (OK / MISSING+FAIL / FLAG / N/A·blank). */
export function scheduleStatusTone(status: string | null | undefined): Tone {
  const s = (status ?? "").toUpperCase();
  if (s.startsWith("OK")) return "green";
  if (s.startsWith("MISSING") || s.startsWith("FAIL")) return "red";
  if (s.startsWith("FLAG")) return "amber";
  return "slate";
}

/** Certificate verdict text → semantic tone (PASS / FAIL / CV / N/A·blank). */
export function verdictTone(verdict: string | null | undefined): Tone {
  const s = (verdict ?? "").toUpperCase();
  if (s.startsWith("PASS")) return "green";
  if (s.startsWith("FAIL")) return "red";
  if (s.startsWith("CV")) return "amber";
  return "slate";
}

/** A single SANS rule cell value → tone. */
export function ruleTone(v: string | null | undefined): Tone {
  const t = (v ?? "").toUpperCase();
  if (t === "PASS") return "green";
  if (t === "FAIL") return "red";
  if (t === "CV") return "amber";
  return "slate";
}

/** Pill (badge) classes per tone — bordered, soft fill. */
export const TONE_PILL: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  red: "bg-red-50 text-red-700 border-red-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  slate: "bg-muted text-muted-foreground border-border",
};

/** Compact grid-cell classes per tone (for the dense verification grid). */
export const TONE_CELL: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-100 text-red-700 font-semibold",
  amber: "bg-amber-50 text-amber-700",
  slate: "text-muted-foreground/60",
};
