// Renderer for the Asset Verification report. Mirrors the COC report (src/lib/siteCoc/siteCocReport.ts):
// landscape, branded cover, executive summary with narrative + tinted KPI cards + a rate gauge,
// an "Issues & exceptions" section, and consistently-styled detail tables. All bars/cards come from
// the shared, canvas-free src/lib/pdfBars.ts (pdf.js mis-renders canvas-in-table-cell).

import type { Content, TDocumentDefinitions } from "./pdfMakeConfig";
import { tintedKpiCard, gaugeBar, toneForPct } from "./pdfBars";
import type { AvReportModel } from "./assetVerificationReportModel";

const STRIPE = "#FAFAF8";
const FILL_OK = "#E1F5EE";
const FILL_WARN = "#FAEEDA";
const TEXT_OK = "#0F6E56";
const TEXT_WARN = "#854F0B";

const hcell = (t: string): any => ({ text: t, bold: true, fontSize: 7, color: "#FFFFFF", fillColor: "#0C447C" });

// Zebra-striped, borderless-vertical table (matches the COC report). Cells keep their own
// fillColor; other body rows alternate a faint tint.
const stripeLayout = (headerRows: number) => ({
  hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  hLineColor: () => "#EAEAE5",
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 2.2,
  paddingBottom: () => 2.2,
  fillColor: (rowIndex: number) => (rowIndex >= headerRows && (rowIndex - headerRows) % 2 === 1 ? STRIPE : null),
});

// White gaps between KPI cards (matches the COC report's card row).
const cardGap = {
  hLineWidth: () => 3,
  vLineWidth: () => 3,
  hLineColor: () => "#FFFFFF",
  vLineColor: () => "#FFFFFF",
  paddingLeft: () => 0,
  paddingRight: () => 0,
  paddingTop: () => 0,
  paddingBottom: () => 0,
};

const tone = (pct: number) => (pct >= 80 ? "#1D9E75" : pct >= 50 ? "#EF9F27" : "#E24B4A");

export function buildAssetVerificationReportDocDef(model: AvReportModel, logoDataUrl?: string | null): TDocumentDefinitions {
  const s = model.summary;
  const rateColor = tone(s.verificationPct);

  const brand: Content = logoDataUrl
    ? { image: logoDataUrl, fit: [180, 52] }
    : {
        stack: [
          { text: "WATSON MATTHEUS", fontSize: 13, bold: true, color: "#185FA5", characterSpacing: 2 },
          { text: "CONSULTING ELECTRICAL ENGINEERS", fontSize: 9, color: "#5F5E5A" },
        ],
      };

  const cover: Content[] = [
    brand,
    { canvas: [{ type: "rect", x: 0, y: 0, w: 760, h: 3, color: "#185FA5" }], margin: [0, 8, 0, 26] },
    { text: "Asset Verification Report", fontSize: 28, bold: true, color: "#0C447C" },
    { text: "Asset register vs inspection data", fontSize: 16, color: "#5F5E5A", margin: [0, 2, 0, 22] },
    { text: model.cover.siteName, fontSize: 18, bold: true },
    {
      table: {
        widths: ["auto", "*"],
        body: [
          [{ text: "Prepared for", color: "#5F5E5A" }, { text: model.cover.clientName || "—", bold: true }],
          [{ text: "Prepared by", color: "#5F5E5A" }, { text: "Watson Mattheus Consulting Electrical Engineers" }],
          [{ text: "Generated", color: "#5F5E5A" }, { text: model.cover.generatedAt }],
          [{ text: "Reference", color: "#5F5E5A" }, { text: model.cover.referenceNumber }],
        ],
      },
      layout: "noBorders",
      fontSize: 10,
      margin: [0, 14, 0, 24],
    },
    { text: `${s.verificationPct}% verified`, fontSize: 26, bold: true, color: rateColor, margin: [0, 6, 0, 0] },
    gaugeBar(s.verificationPct, rateColor),
    { text: `${s.total} ${s.total === 1 ? "asset" : "assets"} in register`, fontSize: 11, color: "#5F5E5A", margin: [0, 2, 0, 8] },
    {
      text: [
        { text: `${s.verified} verified`, color: "#0F6E56" },
        { text: "      ·      ", color: "#B4B2A9" },
        { text: `${s.discrepancies} mismatches`, color: "#854F0B" },
        { text: "      ·      ", color: "#B4B2A9" },
        { text: `${s.unverified} no inspection`, color: "#A32D2D" },
      ],
      fontSize: 11,
    },
  ];

  const kpiRow: Content = {
    table: {
      widths: [150, 150, 150, 150],
      body: [
        [
          tintedKpiCard({ label: "Total assets", value: String(s.total), sub: "in register", tone: "slate", contentWidth: 146 }),
          tintedKpiCard({ label: "Verified", value: String(s.verified), sub: `${s.verificationPct}% of total`, tone: toneForPct(s.verificationPct), barPct: s.verificationPct, contentWidth: 146 }),
          tintedKpiCard({ label: "Discrepancies", value: String(s.discrepancies), sub: "value mismatches", tone: s.discrepancies ? "amber" : "green", contentWidth: 146 }),
          tintedKpiCard({ label: "Not verified", value: String(s.unverified), sub: "no inspection match", tone: s.unverified ? "red" : "green", contentWidth: 146 }),
        ],
      ],
    },
    layout: cardGap,
    margin: [0, 0, 0, 12],
  };

  const summary: Content[] = [
    { text: "Executive summary", fontSize: 18, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    { text: model.narrative, fontSize: 11, margin: [0, 0, 0, 12] },
    kpiRow,
    { text: "Issues & exceptions", fontSize: 12, bold: true, margin: [0, 4, 0, 4] },
    { text: `Value mismatches (${model.discrepancyRows.length})`, fontSize: 9, color: "#A32D2D" },
    model.discrepancyRows.length
      ? {
          ul: model.discrepancyRows.map((d) => `${d.premisesId} — ${d.field}: register ${d.registerValue} vs inspection ${d.inspectionValue}`),
          fontSize: 9,
          margin: [0, 0, 0, 6],
        }
      : { text: "—", fontSize: 9, margin: [0, 0, 0, 6] },
    { text: `Assets without matching inspection (${model.unverifiedRows.length})`, fontSize: 9, color: "#A32D2D" },
    { text: model.unverifiedRows.map((u) => u.premisesId).join(" · ") || "—", fontSize: 9 },
  ];

  const verifiedTable = (): Content => {
    const head = ["Premises ID", "Trade as", "Status", "Inspection source", "Meter serial", "CT ratio", "Breaker"].map(hcell);
    const body = model.verifiedRows.map((r) => [
      { text: r.premisesId, fontSize: 7 },
      { text: r.tradeAs, fontSize: 7 },
      { text: r.mismatch ? "Mismatch" : "Verified", fontSize: 7, color: r.mismatch ? TEXT_WARN : TEXT_OK, fillColor: r.mismatch ? FILL_WARN : FILL_OK },
      { text: r.source, fontSize: 7 },
      { text: r.meterSerial, fontSize: 7 },
      { text: r.ctRatio, fontSize: 7, fillColor: r.ctMismatch ? FILL_WARN : null, color: r.ctMismatch ? TEXT_WARN : undefined },
      { text: r.breaker, fontSize: 7, fillColor: r.breakerMismatch ? FILL_WARN : null, color: r.breakerMismatch ? TEXT_WARN : undefined },
    ]);
    if (!body.length) body.push([{ text: "No assets verified against inspection data.", fontSize: 7, colSpan: 7 } as any, {}, {}, {}, {}, {}, {}]);
    return { table: { headerRows: 1, widths: [70, "*", 56, 110, 90, 72, 72], body: [head, ...body] }, layout: stripeLayout(1), margin: [0, 0, 0, 8] };
  };

  const discrepancyTable = (): Content => {
    const head = ["Premises ID", "Field", "Register value", "Inspection value"].map(hcell);
    const body = model.discrepancyRows.map((d) => [
      { text: d.premisesId, fontSize: 7 },
      { text: d.field, fontSize: 7 },
      { text: d.registerValue, fontSize: 7 },
      { text: d.inspectionValue, fontSize: 7, color: TEXT_WARN },
    ]);
    if (!body.length) body.push([{ text: "No value mismatches.", fontSize: 7, colSpan: 4 } as any, {}, {}, {}]);
    return { table: { headerRows: 1, widths: [90, 90, "*", "*"], body: [head, ...body] }, layout: stripeLayout(1), margin: [0, 0, 0, 8] };
  };

  const unverifiedTable = (): Content => {
    const head = ["Premises ID", "Trade as", "Meter serial", "CT ratio", "Breaker"].map(hcell);
    const body = model.unverifiedRows.map((u) => [
      { text: u.premisesId, fontSize: 7 },
      { text: u.tradeAs, fontSize: 7 },
      { text: u.meterSerial, fontSize: 7 },
      { text: u.ctRatio, fontSize: 7 },
      { text: u.breaker, fontSize: 7 },
    ]);
    if (!body.length) body.push([{ text: "Every register asset has a matching inspection.", fontSize: 7, colSpan: 5 } as any, {}, {}, {}, {}]);
    return { table: { headerRows: 1, widths: [90, "*", 100, 80, 80], body: [head, ...body] }, layout: stripeLayout(1), margin: [0, 0, 0, 8] };
  };

  const tablesBlock: Content[] = [
    { text: "Verified against inspection data", fontSize: 14, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    verifiedTable(),
    { text: "Value mismatches", fontSize: 14, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    discrepancyTable(),
    { text: "Assets without matching inspection", fontSize: 14, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    unverifiedTable(),
  ];

  return {
    pageOrientation: "landscape",
    content: [...cover, ...summary, ...tablesBlock],
    defaultStyle: { fontSize: 9 },
    footer: (currentPage: number, pageCount: number): Content => ({
      margin: [40, 6, 40, 0],
      columns: [
        { text: "Watson Mattheus · Confidential", fontSize: 7, color: "#A9A9A3" },
        { text: `${model.cover.siteName} · Page ${currentPage} of ${pageCount}`, fontSize: 7, color: "#A9A9A3", alignment: "right" },
      ],
    }),
    // Start each section on a fresh page, but only when content already sits on the current page —
    // avoids pdfmake inserting a blank page when a table happened to fill the page.
    pageBreakBefore: (current: any, opts: any) => current.headlineLevel === 1 && opts.getPreviousNodesOnPage().length > 0,
  };
}
