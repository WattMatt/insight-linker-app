// Renderer for the Asset Verification report. Mirrors the COC report (src/lib/siteCoc/siteCocReport.ts):
// landscape, branded cover, executive summary with narrative + tinted KPI cards + a rate gauge,
// an "Issues & exceptions" section, and consistently-styled detail tables. All bars/cards come from
// the shared, canvas-free src/lib/pdfBars.ts (pdf.js mis-renders canvas-in-table-cell).

import type { Content, TDocumentDefinitions } from "./pdfMakeConfig";
import { createBaseDocDefinition } from "./pdfMakeConfig";
import { createPageFooter } from "./pdfMakeUtils";
import { tintedKpiCard, gaugeBar, toneForPct } from "./pdfBars";
import type { AvReportModel } from "./assetVerificationReportModel";

const STRIPE = "#FAFAF8";
const FILL_OK = "#E1F5EE";
const FILL_WARN = "#FAEEDA";
const TEXT_OK = "#0F6E56";
const TEXT_WARN = "#854F0B";
const FILL_BAD = "#FCEBEB";
const TEXT_BAD = "#A32D2D";

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

export function buildAssetVerificationReportDocDef(
  model: AvReportModel,
  logoDataUrl?: string | null,
  images?: Map<string, string>,
): TDocumentDefinitions {
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
        { text: `${s.discrepancies} with discrepancies`, color: "#854F0B" },
        { text: "      ·      ", color: "#B4B2A9" },
        { text: `${s.unverified} not found on site`, color: "#A32D2D" },
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
          tintedKpiCard({ label: "Discrepancies", value: String(s.discrepancies), sub: s.wrongMeter ? `incl. ${s.wrongMeter} wrong meter${s.wrongMeter === 1 ? "" : "s"}` : "serial, CT or breaker", tone: s.discrepancies ? "amber" : "green", contentWidth: 146 }),
          tintedKpiCard({ label: "Not verified", value: String(s.unverified), sub: "not found on site", tone: s.unverified ? "red" : "green", contentWidth: 146 }),
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
    {
      text: `Discrepancies (${model.discrepancyRows.length} ${model.discrepancyRows.length === 1 ? "item" : "items"} across ${s.discrepancies} ${s.discrepancies === 1 ? "asset" : "assets"})`,
      fontSize: 9,
      color: "#A32D2D",
    },
    model.discrepancyRows.length
      ? {
          ul: model.discrepancyRows.map((d) => `${d.premisesId} — ${d.field}: register ${d.registerValue} vs site ${d.inspectionValue}`),
          fontSize: 9,
          margin: [0, 0, 0, 6],
        }
      : { text: "—", fontSize: 9, margin: [0, 0, 0, 6] },
    { text: `Assets not found on site (${model.unverifiedRows.length})`, fontSize: 9, color: "#A32D2D" },
    { text: model.unverifiedRows.map((u) => u.premisesId).join(" · ") || "—", fontSize: 9, margin: [0, 0, 0, 6] },
    { text: `Meters on site not in the register (${model.unregisteredRows.length})`, fontSize: 9, color: "#A32D2D" },
    {
      text: model.unregisteredRows.map((u) => `${u.board} ${u.shopName} (${u.meterSerial})`).join(" · ") || "—",
      fontSize: 9,
    },
  ];

  // Reference thumbnails (already fetched + compressed by the generator and keyed by source URL).
  // Each is a small labeled image; missing/failed images are simply skipped (best-effort).
  const img = images ?? new Map<string, string>();
  const thumb = (url: string | null, label: string): Content | null => {
    if (!url) return null;
    const data = img.get(url);
    if (!data) return null;
    return { stack: [{ image: data, fit: [40, 30] }, { text: label, fontSize: 5, color: "#5F5E5A", alignment: "center", margin: [0, 1, 0, 0] }], width: "auto" } as Content;
  };
  const imagesCell = (r: AvReportModel["verifiedRows"][number]): any => {
    const thumbs = [thumb(r.meterImage, "Meter"), thumb(r.ctRatioImage, "CT"), thumb(r.breakerImage, "Breaker")].filter(Boolean) as Content[];
    return thumbs.length ? { columns: thumbs, columnGap: 4 } : { text: "—", fontSize: 7, color: "#B4B2A9" };
  };

  const verifiedTable = (): Content => {
    const head = ["Premises ID", "Trade as", "Status", "Found on site", "Meter serial", "CT ratio", "Breaker", "Reference images"].map(hcell);
    const statusStyle = (r: AvReportModel["verifiedRows"][number]) =>
      r.statusLabel === "Wrong meter"
        ? { color: TEXT_BAD, fillColor: FILL_BAD }
        : r.mismatch
          ? { color: TEXT_WARN, fillColor: FILL_WARN }
          : { color: TEXT_OK, fillColor: FILL_OK };
    const body = model.verifiedRows.map((r) => [
      { text: r.premisesId, fontSize: 7 },
      { text: r.tradeAs, fontSize: 7 },
      { text: r.statusLabel, fontSize: 7, ...statusStyle(r) },
      { text: r.source, fontSize: 7, color: r.statusLabel === "Wrong meter" ? TEXT_BAD : undefined },
      r.siteSerial
        ? { text: [{ text: `${r.meterSerial}\n` }, { text: `site ${r.siteSerial}`, bold: true }], fontSize: 7, fillColor: FILL_WARN, color: TEXT_WARN }
        : { text: r.meterSerial, fontSize: 7 },
      { text: r.ctRatio, fontSize: 7, fillColor: r.ctMismatch ? FILL_WARN : null, color: r.ctMismatch ? TEXT_WARN : undefined },
      { text: r.breaker, fontSize: 7, fillColor: r.breakerMismatch ? FILL_WARN : null, color: r.breakerMismatch ? TEXT_WARN : undefined },
      imagesCell(r),
    ]);
    if (!body.length) body.push([{ text: "No assets verified against inspection data.", fontSize: 7, colSpan: 8 } as any, {}, {}, {}, {}, {}, {}, {}]);
    return { table: { headerRows: 1, widths: [64, "*", 54, 96, 78, 62, 62, 138], body: [head, ...body] }, layout: stripeLayout(1), margin: [0, 0, 0, 4] };
  };

  const discrepancyTable = (): Content => {
    const head = ["Premises ID", "Field", "Register value", "Found on site"].map(hcell);
    const body = model.discrepancyRows.map((d) => [
      { text: d.premisesId, fontSize: 7 },
      { text: d.field, fontSize: 7 },
      { text: d.registerValue, fontSize: 7 },
      { text: d.inspectionValue, fontSize: 7, color: TEXT_WARN },
    ]);
    if (!body.length) body.push([{ text: "No discrepancies.", fontSize: 7, colSpan: 4 } as any, {}, {}, {}]);
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
    if (!body.length) body.push([{ text: "Every register asset was found on site.", fontSize: 7, colSpan: 5 } as any, {}, {}, {}, {}]);
    return { table: { headerRows: 1, widths: [90, "*", 100, 80, 80], body: [head, ...body] }, layout: stripeLayout(1), margin: [0, 0, 0, 8] };
  };

  const unregisteredTable = (): Content => {
    const head = ["Board", "Shop number", "Shop name", "Meter serial", "CT ratio", "Breaker"].map(hcell);
    const body = model.unregisteredRows.map((u) => [
      { text: u.board, fontSize: 7 },
      { text: u.shopNumber, fontSize: 7 },
      { text: u.shopName, fontSize: 7 },
      { text: u.meterSerial, fontSize: 7 },
      { text: u.ctRatio, fontSize: 7 },
      { text: u.breaker, fontSize: 7 },
    ]);
    if (!body.length) body.push([{ text: "Every meter found on site is in the register.", fontSize: 7, colSpan: 6 } as any, {}, {}, {}, {}, {}]);
    return { table: { headerRows: 1, widths: [110, 80, "*", 100, 70, 70], body: [head, ...body] }, layout: stripeLayout(1), margin: [0, 0, 0, 8] };
  };

  const tablesBlock: Content[] = [
    { text: "Checked against what was found on site", fontSize: 14, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    verifiedTable(),
    { text: "Reference images are low-resolution thumbnails — log in to the app for the full-size meter, CT and breaker photos.", fontSize: 7, italics: true, color: "#5F5E5A", margin: [0, 0, 0, 8] },
    { text: "Discrepancies", fontSize: 14, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    discrepancyTable(),
    { text: "Assets not found on site", fontSize: 14, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    unverifiedTable(),
    { text: "Meters on site not in the register", fontSize: 14, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    unregisteredTable(),
  ];

  // Built through createBaseDocDefinition for the same reason as the COC report:
  // shared PDF metadata, style dictionary, standard margins and the standard
  // confidentiality wording instead of a hand-rolled definition.
  return createBaseDocDefinition([...cover, ...summary, ...tablesBlock], {
    title: `Asset Verification — ${model.cover.siteName}`,
    subject: "Asset verification report",
    pageOrientation: "landscape",
    defaultStyle: { fontSize: 9 },
    // Cover is the first content block, not an engine-drawn cover page.
    footer: createPageFooter(false, model.cover.siteName),
    // Start each section on a fresh page, but only when content already sits on the current page —
    // avoids pdfmake inserting a blank page when a table happened to fill the page.
    pageBreakBefore: (current: any, opts: any) => current.headlineLevel === 1 && opts.getPreviousNodesOnPage().length > 0,
  });
}
