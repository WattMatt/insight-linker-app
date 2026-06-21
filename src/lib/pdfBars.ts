import type { Content } from "./pdfMakeConfig";

/**
 * Shared, canvas-free PDF bar/card primitives.
 *
 * Lifted from the COC site report (src/lib/siteCoc/siteCocReport.ts) — the best-engineered PDF
 * in the codebase. Every primitive here is built ONLY from pdfmake `table` nodes with
 * `fillColor`, never `canvas`.
 *
 * Why no canvas: pdf.js — the in-app document viewer — mis-positions canvas elements inside
 * table cells (it pushes them to the bottom and stretches the row), and bumps a standalone
 * canvas block to the next page during pagination. Tables flow reliably inline in both pdf.js
 * and native viewers. See the originating comments in siteCocReport.ts.
 *
 * These functions are pure and additive: they do NOT touch createKpiRow / createKpiDashboard.
 * New reports (e.g. the Fortress Asset Register) call them directly.
 */

/** Semantic status tone — the single colour vocabulary shared across reports. */
export type Tone = "green" | "amber" | "red" | "slate";

/** Tint palette per tone: card background, accent bar, label text, value text, bar track. */
export const TONE_TINT: Record<Tone, { bg: string; accent: string; label: string; value: string; track: string }> = {
  green: { bg: "#E1F5EE", accent: "#1D9E75", label: "#0F6E56", value: "#085041", track: "#C3E7DA" },
  amber: { bg: "#FAEEDA", accent: "#EF9F27", label: "#854F0B", value: "#633806", track: "#F0DCB4" },
  red: { bg: "#FCEBEB", accent: "#E24B4A", label: "#A32D2D", value: "#791F1F", track: "#F4D2D2" },
  slate: { bg: "#F1EFE8", accent: "#B4B2A9", label: "#5F5E5A", value: "#44413E", track: "#DEDBCF" },
};

/** Map a 0–100 percentage to a tone: >=80 green, >=50 amber, else red. */
export function toneForPct(pct: number): Tone {
  return pct >= 80 ? "green" : pct >= 50 ? "amber" : "red";
}

const NO_BORDER = {
  defaultBorder: false,
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

/**
 * A single horizontal progress bar: a filled segment over a track, both as table cells.
 * @param pct 0–100 (clamped)
 */
export function miniBar(pct: number, color: string, opts?: { width?: number; track?: string }): Content {
  const width = opts?.width ?? 108;
  const track = opts?.track ?? "#ECECEC";
  const p = Math.max(0, Math.min(100, pct));
  const fw = Math.max(1, Math.round((width * p) / 100));
  const rest = Math.max(1, width - fw);
  return {
    table: { widths: [fw, rest], heights: [5], body: [[{ text: "", fillColor: color }, { text: "", fillColor: track }]] },
    layout: NO_BORDER,
    margin: [0, 5, 0, 0],
  } as Content;
}

/**
 * A stacked, proportional bar of coloured segments (e.g. pass / review / pending / fail).
 * Zero-value segments are dropped; an all-zero input renders a single grey track.
 */
export function segmentedBar(segments: Array<{ value: number; color: string }>, opts?: { width?: number; height?: number }): Content {
  const width = opts?.width ?? 104;
  const height = opts?.height ?? 10;
  const visible = segments.filter((s) => s.value > 0);
  const total = Math.max(1, visible.reduce((sum, s) => sum + s.value, 0));
  const widths = visible.length ? visible.map((s) => Math.max(2, Math.round((width * s.value) / total))) : [width];
  const cells = visible.length ? visible.map((s) => ({ text: "", fillColor: s.color })) : [{ text: "", fillColor: "#ECECEC" }];
  return {
    table: { widths, heights: [height], body: [cells] },
    layout: NO_BORDER,
    margin: [0, 5, 0, 3],
  } as Content;
}

/**
 * A wide gauge bar (e.g. an overall-compliance cover-page gauge): filled segment over a track.
 * @param pct 0–100 (clamped)
 */
export function gaugeBar(pct: number, color: string, opts?: { width?: number; height?: number }): Content {
  const width = opts?.width ?? 320;
  const height = opts?.height ?? 9;
  const p = Math.max(0, Math.min(100, pct));
  const fw = Math.max(2, Math.round((width * p) / 100));
  const rest = Math.max(2, width - fw);
  return {
    table: { widths: [fw, rest], heights: [height], body: [[{ text: "", fillColor: color }, { text: "", fillColor: "#ECECEC" }]] },
    layout: NO_BORDER,
    margin: [0, 12, 0, 10],
  } as Content;
}

/**
 * A tinted KPI card: a left accent bar beside a label / big value / optional bar / sub-text,
 * all on a tinted background. Built as a nested table so pdf.js sizes it to content reliably
 * (a fixed outer height makes pdf.js stretch the row and float content — see siteCocReport.ts).
 */
export function tintedKpiCard(opts: { label: string; value: string; sub?: string; tone: Tone; barPct?: number }): Content {
  const { label, value, sub, tone, barPct } = opts;
  const tint = TONE_TINT[tone];
  const stack: Content[] = [
    { text: label, fontSize: 9, color: tint.label },
    { text: value, fontSize: 19, bold: true, color: tint.value, margin: [0, 3, 0, 0] },
  ];
  if (barPct != null) stack.push(miniBar(barPct, tint.accent, { width: 108, track: tint.track }));
  if (sub != null) stack.push({ text: sub, fontSize: 7, color: tint.label, margin: [0, barPct != null ? 4 : 6, 0, 0] });
  return {
    fillColor: tint.bg,
    table: { widths: [4, 130], body: [[{ text: "", fillColor: tint.accent }, { stack, margin: [9, 9, 8, 9] }]] },
    layout: NO_BORDER,
  } as Content;
}
