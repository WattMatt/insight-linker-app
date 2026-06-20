import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { COC_SANS_RULES } from "./sansRules";
import type { CocReportModel, VerdictKind, ScheduleTableRow, VerificationRow, FileRegisterRow } from "./cocReportModel";
import { scheduleStatusTone, verdictTone, type Tone } from "./statusDisplay";

const FILL = { pass: "#E1F5EE", fail: "#FCEBEB", review: "#FAEEDA", cv: "#FAEEDA", pending: "#F1EFE8", na: "#F1EFE8" };
const TEXT: Record<VerdictKind, string> = { pass: "#0F6E56", fail: "#A32D2D", review: "#854F0B", cv: "#854F0B", pending: "#5F5E5A" };
const TONE: Record<Tone, { fill: string; text: string }> = {
  green: { fill: "#E1F5EE", text: "#0F6E56" },
  red: { fill: "#FCEBEB", text: "#A32D2D" },
  amber: { fill: "#FAEEDA", text: "#854F0B" },
  slate: { fill: "#FFFFFF", text: "#5F5E5A" },
};
const shortVerdict = (v: string) => (v || "—").split("—")[0].trim() || "—";
const glyph = (v: string) => { const t = (v || "").toUpperCase(); return t === "PASS" ? "P" : t === "FAIL" ? "F" : t === "CV" ? "CV" : t === "N/A" ? "N/A" : t ? t : "·"; };
const ruleFill = (v: string) => { const t = (v || "").toUpperCase(); return t === "FAIL" ? FILL.fail : t === "CV" ? FILL.cv : t === "N/A" ? FILL.na : FILL.pass; };

const hcell = (t: string) => ({ text: t, bold: true, fontSize: 7, color: "#FFFFFF", fillColor: "#0C447C" });

function scheduleTableContent(rows: ScheduleTableRow[]): Content {
  const head = ["Shop No", "Trading name", "Req", "Initial COC(s)", "Supplementary COC(s)", "Files", "Status", "Notes"].map(hcell);
  const body = rows.map(r => {
    const t = TONE[scheduleStatusTone(r.status)];
    return [
      { text: r.shopNo || "—", fontSize: 7 },
      { text: r.trading || "—", fontSize: 7 },
      { text: r.req || "—", fontSize: 7, alignment: "center" as const },
      { text: r.initial || "—", fontSize: 7 },
      { text: r.supplementary || "—", fontSize: 7 },
      { text: r.files != null ? String(r.files) : "—", fontSize: 7, alignment: "center" as const },
      { text: r.status || "—", fontSize: 7, fillColor: t.fill, color: t.text },
      { text: r.notes || "", fontSize: 6, color: "#5F5E5A" },
    ];
  });
  if (!rows.length) body.push([{ text: "No schedule imported.", fontSize: 7, colSpan: 8 } as any, {}, {}, {}, {}, {}, {}, {}]);
  return { table: { headerRows: 1, widths: [42, 110, 18, 92, 100, 22, 86, "*"], body: [head, ...body] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 8] };
}

function verificationContent(rows: VerificationRow[]): Content {
  const A = COC_SANS_RULES.filter(r => r.group === "A");
  const B = COC_SANS_RULES.filter(r => r.group === "B");
  const C = COC_SANS_RULES.filter(r => r.group === "C");
  const all = [...A, ...B, ...C];
  const blanks = (n: number) => Array.from({ length: n }, () => ({ text: "" }));
  const meta = (t: string) => ({ text: t, bold: true, fontSize: 7, color: "#FFFFFF", fillColor: "#0C447C", rowSpan: 2 });
  const band = (t: string, span: number) => ({ text: t, bold: true, fontSize: 7, color: "#FFFFFF", fillColor: "#185FA5", colSpan: span, alignment: "center" as const });
  const head1 = [
    meta("Shop"), meta("Cert no"), meta("Type"), meta("Verdict"),
    band("Admin", A.length), ...blanks(A.length - 1),
    band("Install", B.length), ...blanks(B.length - 1),
    band("Tests", C.length), ...blanks(C.length - 1),
  ];
  const head2 = [
    ...blanks(4),
    ...all.map(r => ({ text: r.code, bold: true, fontSize: 5, alignment: "center" as const, fillColor: "#E6F1FB" })),
  ];
  const body = rows.map(r => {
    const vt = TONE[verdictTone(r.verdict)];
    return [
      { text: r.shop || "—", fontSize: 6 },
      { text: r.certNo || "—", fontSize: 6 },
      { text: (r.type || "").slice(0, 1), fontSize: 6, alignment: "center" as const },
      { text: shortVerdict(r.verdict), fontSize: 6, fillColor: vt.fill, color: vt.text },
      ...all.map(rule => { const v = r.rules?.[rule.code] ?? ""; return { text: glyph(v), fontSize: 6, alignment: "center" as const, fillColor: ruleFill(v) }; }),
    ];
  });
  return { table: { headerRows: 2, widths: [42, 58, 14, 58, ...Array(all.length).fill("*")], body: [head1, head2, ...body] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 8] };
}

function fileRegisterContent(rows: FileRegisterRow[]): Content {
  const head = ["File", "Matched", "Doc type", "Cert no", "Type", "9(2)", "Issued", "Conf", "Notes"].map(hcell);
  const confColor = (c: string) => { const v = (c || "").toLowerCase(); return v === "high" ? "#0F6E56" : v === "med" ? "#854F0B" : v === "low" ? "#A32D2D" : "#5F5E5A"; };
  const body = rows.map(r => {
    const isCoc = r.docType === "electrical_coc";
    return [
      { text: r.file || "—", fontSize: 6 },
      { text: r.matched || "—", fontSize: 6 },
      { text: r.docType || "—", fontSize: 6, fillColor: isCoc ? TONE.green.fill : "#F1EFE8", color: isCoc ? TONE.green.text : "#5F5E5A" },
      { text: r.certNo || "—", fontSize: 6 },
      { text: r.type || "—", fontSize: 6 },
      { text: (r.clause92 || "").toUpperCase() || "—", fontSize: 6, alignment: "center" as const },
      { text: r.issued ?? "—", fontSize: 6 },
      { text: r.conf || "—", fontSize: 6, color: confColor(r.conf) },
      { text: r.notes || "", fontSize: 5, color: "#5F5E5A" },
    ];
  });
  return { table: { headerRows: 1, widths: ["*", 42, 64, 56, 40, 22, 48, 30, "*"], body: [head, ...body] }, layout: "lightHorizontalLines", margin: [0, 0, 0, 8] };
}

function miniBar(pct: number, color: string, w = 78): Content {
  const p = Math.max(0, Math.min(100, pct));
  return { canvas: [
    { type: "rect", x: 0, y: 0, w, h: 5, r: 2, color: "#ECECEC" },
    { type: "rect", x: 0, y: 0, w: (w * p) / 100, h: 5, r: 2, color },
  ], margin: [0, 3, 0, 0] };
}
function verdictBar(v: { pass: number; fail: number; review: number; cv: number; pending: number }, W = 340): Content {
  const total = Math.max(1, v.pass + v.fail + v.review + v.cv + v.pending);
  const rects: { type: "rect"; x: number; y: number; w: number; h: number; color: string }[] = [];
  let x = 0;
  const push = (n: number, c: string) => { if (n) { rects.push({ type: "rect", x, y: 0, w: (W * n) / total, h: 12, color: c }); x += (W * n) / total; } };
  push(v.pass, "#1D9E75"); push(v.review + v.cv, "#EF9F27"); push(v.pending, "#B4B2A9"); push(v.fail, "#E24B4A");
  return { canvas: rects, margin: [0, 4, 0, 2] };
}
export function buildSiteCocReportDocDef(model: CocReportModel, logoDataUrl?: string | null): TDocumentDefinitions {
  const s = model.summary, k = model.kpis, cov = model.cover, sk = model.siteKpis;
  const tone = (pct: number) => (pct >= 80 ? "#1D9E75" : pct >= 50 ? "#EF9F27" : "#E24B4A");

  const brand: Content = logoDataUrl
    ? { image: logoDataUrl, fit: [180, 52] }
    : { stack: [
        { text: "WATSON MATTHEUS", fontSize: 13, bold: true, color: "#185FA5", characterSpacing: 2 },
        { text: "CONSULTING ELECTRICAL ENGINEERS", fontSize: 9, color: "#5F5E5A" },
      ] };

  const cover: Content[] = [
    brand,
    { canvas: [{ type: "rect", x: 0, y: 0, w: 760, h: 3, color: "#185FA5" }], margin: [0, 8, 0, 26] },
    { text: "Certificate of Compliance", fontSize: 28, bold: true, color: "#0C447C" },
    { text: "Status report", fontSize: 16, color: "#5F5E5A", margin: [0, 2, 0, 22] },
    { text: model.siteName, fontSize: 18, bold: true },
    { text: cov.address || "", fontSize: 11, color: "#5F5E5A", margin: [0, 1, 0, 16] },
    { table: { widths: ["auto", "*"], body: [
      [{ text: "Prepared for", color: "#5F5E5A" }, { text: cov.clientName || "—", bold: true }],
      [{ text: "Prepared by", color: "#5F5E5A" }, { text: "Watson Mattheus Consulting Electrical Engineers" }],
      [{ text: "Generated", color: "#5F5E5A" }, { text: `${model.generatedAt}${model.lastImport ? ` · data as of ${model.lastImport}` : ""}` }],
    ] }, layout: "noBorders", fontSize: 10, margin: [0, 0, 0, 26] },
    { columns: [
      { width: "auto", stack: [
        { text: `${s.compliantPct}%`, fontSize: 34, bold: true, color: tone(s.compliantPct) },
        { text: "compliant", fontSize: 11, color: "#5F5E5A", margin: [2, 0, 0, 0] },
      ] },
      { width: "*", text: `${s.required} COC-required shops\n${s.clear} clear · ${s.noCoc} no COC · ${s.failed} failed`, fontSize: 11, color: "#5F5E5A", margin: [22, 8, 0, 0] },
    ] },
  ];

  const narrative = `${model.siteName} has ${s.required} COC-required shops. ${s.clear} are clear (Pass), ${s.noCoc} have no COC on file, and ${s.failed} ${s.failed === 1 ? "has a failed certificate" : "have failed certificates"}. Overall compliance is ${s.compliantPct}%, with ${k.outstanding} outstanding ${k.outstanding === 1 ? "action" : "actions"}. COC documents are on record for ${k.cocCoveragePct}% of required shops and evaluation reports for ${k.evalCoveragePct}%.`;

  const cardLayout = {
    hLineWidth: () => 0.7, vLineWidth: () => 0.7,
    hLineColor: () => "#E2E2DD", vLineColor: () => "#E2E2DD",
    paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 6, paddingBottom: () => 7,
  };
  const card = (label: string, value: string, sub: string, opts?: { color?: string; bar?: Content }): any => ({
    fillColor: "#FFFFFF",
    stack: [
      { text: label, fontSize: 8, color: "#5F5E5A" },
      { text: value, fontSize: 14, bold: true, color: opts?.color ?? "#1A1A1A", margin: [0, 2, 0, 0] },
      ...(opts?.bar ? [opts.bar] : []),
      { text: sub, fontSize: 6.5, color: "#888780", margin: [0, 2, 0, 0] },
    ],
  });
  const verdictCard = (): any => ({
    fillColor: "#FFFFFF",
    stack: [
      { text: "Verdict mix", fontSize: 8, color: "#5F5E5A" },
      { text: "", fontSize: 4 },
      verdictBar(k.verdict, 78),
      { text: `P ${k.verdict.pass} · R/CV ${k.verdict.review + k.verdict.cv} · ${k.verdict.pending}pd · F ${k.verdict.fail}`, fontSize: 6, color: "#5F5E5A", margin: [0, 4, 0, 0] },
    ],
  });
  const mPct = sk && sk.meteringTotal ? Math.round((sk.meteringDone / sk.meteringTotal) * 100) : 100;
  const kpiRows: any[][] = sk ? [
    [
      card("Compliance", `${s.compliantPct}%`, `${s.clear} of ${s.required} clear`, { color: tone(s.compliantPct), bar: miniBar(s.compliantPct, tone(s.compliantPct)) }),
      card("COC coverage", `${k.cocCoveragePct}%`, "have a COC", { color: tone(k.cocCoveragePct), bar: miniBar(k.cocCoveragePct, tone(k.cocCoveragePct)) }),
      card("Eval coverage", `${k.evalCoveragePct}%`, "have an eval", { color: tone(k.evalCoveragePct), bar: miniBar(k.evalCoveragePct, tone(k.evalCoveragePct)) }),
      verdictCard(),
      card("COC expiry", `${sk.expiry.expired} / ${sk.expiry.within30} / ${sk.expiry.within90}`, "expired · ≤30d · ≤90d"),
    ],
    [
      card("Open snags", `${sk.snagsOpen}`, `${sk.snagsHighRisk} high-risk`, { color: sk.snagsHighRisk ? TEXT.fail : "#1A1A1A" }),
      card("Oldest snag", sk.oldestOpenDays != null ? `${sk.oldestOpenDays}d` : "—", "open ageing"),
      card("Inspection pass", `${sk.inspectionPassPct}%`, `${sk.inspectionPass}/${sk.inspectionPass + sk.inspectionFail} items`, { color: tone(sk.inspectionPassPct), bar: miniBar(sk.inspectionPassPct, tone(sk.inspectionPassPct)) }),
      card("Site readiness", `${sk.readinessPct}%`, "deliverables", { color: tone(sk.readinessPct), bar: miniBar(sk.readinessPct, tone(sk.readinessPct)) }),
      card("Metering", sk.meteringTotal ? `${sk.meteringDone}/${sk.meteringTotal}` : "—", "subsections", { color: tone(mPct), bar: miniBar(mPct, tone(mPct)) }),
    ],
  ] : [
    [
      card("Compliance", `${s.compliantPct}%`, `${s.clear} of ${s.required} clear`, { color: tone(s.compliantPct), bar: miniBar(s.compliantPct, tone(s.compliantPct)) }),
      card("COC coverage", `${k.cocCoveragePct}%`, "have a COC", { color: tone(k.cocCoveragePct), bar: miniBar(k.cocCoveragePct, tone(k.cocCoveragePct)) }),
      card("Eval coverage", `${k.evalCoveragePct}%`, "have an eval", { color: tone(k.evalCoveragePct), bar: miniBar(k.evalCoveragePct, tone(k.evalCoveragePct)) }),
      verdictCard(),
      card("Outstanding", `${k.outstanding}`, "no-COC + failed"),
    ],
  ];
  // Explicit equal widths (not "*") — pdf.js (the in-app preview renderer) mis-distributes star
  // columns that contain canvas cells, blowing the first column to full width. Fixed widths render
  // identically in pdfmake, pdf.js and pdfium. 5×138 + padding fits the ~762pt landscape content area.
  const kpiGrid: Content = { table: { widths: [138, 138, 138, 138, 138], body: kpiRows }, layout: cardLayout, margin: [0, 0, 0, 14] };

  const summary: Content[] = [
    { text: "Executive summary", fontSize: 18, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    { text: narrative, fontSize: 11, margin: [0, 0, 0, 14] },
    kpiGrid,
    { text: "Issues & exceptions", fontSize: 12, bold: true, margin: [0, 4, 0, 4] },
    { text: `No COC on file (${model.issues.noCoc.length})`, fontSize: 9, color: TEXT.fail },
    { text: model.issues.noCoc.map(i => i.name).join(" · ") || "—", fontSize: 9, margin: [0, 0, 0, 6] },
    { text: `Failed verdict / SANS rules (${model.issues.failed.length})`, fontSize: 9, color: TEXT.fail },
    model.issues.failed.length
      ? { ul: model.issues.failed.map(f => `${f.name} — ${f.certNo} — failed ${f.failedRules.join(", ") || "(see verdict)"}`), fontSize: 9 }
      : { text: "—", fontSize: 9 },
  ];

  const tablesBlock: Content[] = [
    { text: "DB / COC Schedule", fontSize: 14, bold: true, headlineLevel: 1, margin: [0, 0, 0, 6] },
    scheduleTableContent(model.scheduleTable),
    { text: "COC Verification vs SANS 10142-1", fontSize: 14, bold: true, headlineLevel: 1, margin: [0, 0, 0, 2] },
    { text: "P Pass · F Fail · CV Cannot verify · N/A not applicable · · not captured", fontSize: 7, color: "#5F5E5A", margin: [0, 0, 0, 4] },
    verificationContent(model.verificationRows),
    { text: "File register", fontSize: 14, bold: true, margin: [0, 8, 0, 6] },
    fileRegisterContent(model.fileRegister),
  ];

  return {
    pageOrientation: "landscape",
    content: [...cover, ...summary, ...tablesBlock],
    defaultStyle: { fontSize: 9 },
    // Start each section on a fresh page, but only when content already sits on the current page —
    // this avoids pdfmake inserting a blank page when the previous table happened to fill the page.
    pageBreakBefore: (current: any, opts: any) =>
      current.headlineLevel === 1 && opts.getPreviousNodesOnPage().length > 0,
  };
}
