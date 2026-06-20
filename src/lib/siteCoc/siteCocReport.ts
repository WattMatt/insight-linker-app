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

function miniBar(pct: number, color: string): Content {
  const w = 120, p = Math.max(0, Math.min(100, pct));
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
function kpiCell(label: string, value: string, sub: string, bar?: Content): Content {
  const stack: Content[] = [
    { text: label, fontSize: 8, color: "#5F5E5A" },
    { text: value, fontSize: 16, bold: true },
    { text: sub, fontSize: 7, color: "#5F5E5A" },
  ];
  if (bar) stack.push(bar);
  return { stack, margin: [0, 0, 8, 0] } as Content;
}

export function buildSiteCocReportDocDef(model: CocReportModel): TDocumentDefinitions {
  const s = model.summary, k = model.kpis, cov = model.cover;

  const cover: Content[] = [
    { text: "WATSON MATTHEUS", fontSize: 13, bold: true, color: "#185FA5", characterSpacing: 2 },
    { text: "CONSULTING ELECTRICAL ENGINEERS", fontSize: 9, color: "#5F5E5A", margin: [0, 0, 0, 60] },
    { text: "Certificate of Compliance", fontSize: 30, bold: true },
    { text: "Status report", fontSize: 18, color: "#5F5E5A", margin: [0, 0, 0, 24] },
    { text: model.siteName, fontSize: 18, bold: true },
    { text: cov.address || "", fontSize: 10, color: "#5F5E5A", margin: [0, 0, 0, 20] },
    { table: { widths: ["auto", "*"], body: [
      [{ text: "Prepared for", color: "#5F5E5A" }, { text: cov.clientName || "—" }],
      [{ text: "Prepared by", color: "#5F5E5A" }, { text: "Watson Mattheus Consulting Electrical Engineers" }],
      [{ text: "Generated", color: "#5F5E5A" }, { text: `${model.generatedAt}${model.lastImport ? ` · data as of ${model.lastImport}` : ""}` }],
    ] }, layout: "noBorders", fontSize: 10, margin: [0, 0, 0, 26] },
    { text: `${s.compliantPct}% compliant`, fontSize: 26, bold: true },
    { text: `${s.noCoc} shops with no COC · ${s.failed} failed`, fontSize: 12, color: TEXT.fail, pageBreak: "after" },
  ];

  const narrative = `${model.siteName} has ${s.required} COC-required shops. ${s.clear} are clear (Pass), ${s.noCoc} have no COC on file, and ${s.failed} ${s.failed === 1 ? "has a failed certificate" : "have failed certificates"}. Overall compliance is ${s.compliantPct}%, with ${k.outstanding} outstanding ${k.outstanding === 1 ? "action" : "actions"}. COC documents are on record for ${k.cocCoveragePct}% of required shops and evaluation reports for ${k.evalCoveragePct}%.`;

  const tone = (pct: number) => (pct >= 80 ? "#1D9E75" : pct >= 50 ? "#EF9F27" : "#E24B4A");
  const verdictCell = (): Content => ({ stack: [
    { text: "Verdict mix", fontSize: 8, color: "#5F5E5A" },
    verdictBar(k.verdict, 120),
    { text: `P${k.verdict.pass} · R/CV${k.verdict.review + k.verdict.cv} · ${k.verdict.pending}pend · F${k.verdict.fail}`, fontSize: 7, color: "#5F5E5A", margin: [0, 2, 0, 0] },
  ], margin: [0, 0, 8, 0] } as Content);

  const sk = model.siteKpis;
  const kpiSection: Content[] = sk ? [
    { columns: [
      kpiCell("Compliance", `${s.compliantPct}%`, `${s.clear} of ${s.required} clear`, miniBar(s.compliantPct, tone(s.compliantPct))),
      kpiCell("COC coverage", `${k.cocCoveragePct}%`, "have a COC", miniBar(k.cocCoveragePct, tone(k.cocCoveragePct))),
      kpiCell("Eval coverage", `${k.evalCoveragePct}%`, "have an eval", miniBar(k.evalCoveragePct, tone(k.evalCoveragePct))),
      verdictCell(),
      kpiCell("COC expiry", `${sk.expiry.expired}/${sk.expiry.within30}/${sk.expiry.within90}`, "exp · ≤30d · ≤90d"),
    ], columnGap: 10, margin: [0, 0, 0, 10] },
    { columns: [
      kpiCell("Open snags", `${sk.snagsOpen}`, `${sk.snagsHighRisk} high-risk`),
      kpiCell("Oldest snag", sk.oldestOpenDays != null ? `${sk.oldestOpenDays}d` : "—", "open ageing"),
      kpiCell("Inspection pass", `${sk.inspectionPassPct}%`, `${sk.inspectionPass}/${sk.inspectionPass + sk.inspectionFail} items`, miniBar(sk.inspectionPassPct, tone(sk.inspectionPassPct))),
      kpiCell("Site readiness", `${sk.readinessPct}%`, "deliverables", miniBar(sk.readinessPct, tone(sk.readinessPct))),
      kpiCell("Metering", `${sk.meteringDone}/${sk.meteringTotal}`, "subsections", miniBar(sk.meteringTotal ? Math.round((sk.meteringDone / sk.meteringTotal) * 100) : 100, tone(sk.meteringTotal ? Math.round((sk.meteringDone / sk.meteringTotal) * 100) : 100))),
    ], columnGap: 10, margin: [0, 0, 0, 12] },
  ] : [
    { columns: [
      kpiCell("Compliance", `${s.compliantPct}%`, `${s.clear} of ${s.required} clear`, miniBar(s.compliantPct, "#1D9E75")),
      kpiCell("COC coverage", `${k.cocCoveragePct}%`, "shops with a COC", miniBar(k.cocCoveragePct, "#185FA5")),
      kpiCell("Eval coverage", `${k.evalCoveragePct}%`, "shops with an eval", miniBar(k.evalCoveragePct, "#185FA5")),
      kpiCell("Outstanding", `${k.outstanding}`, "no-COC + failed"),
    ], margin: [0, 0, 0, 12] },
    { text: "Certificate verdict breakdown", fontSize: 9, color: "#5F5E5A" },
    verdictBar(k.verdict),
    { text: `Pass ${k.verdict.pass} · Review/CV ${k.verdict.review + k.verdict.cv} · Pending ${k.verdict.pending} · Fail ${k.verdict.fail}`, fontSize: 8, color: "#5F5E5A", margin: [0, 0, 0, 12] },
  ];

  const summary: Content[] = [
    { text: "Executive summary", fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
    { text: narrative, fontSize: 11, margin: [0, 0, 0, 12] },
    ...kpiSection,
    { text: "Issues & exceptions", fontSize: 12, bold: true, margin: [0, 0, 0, 4] },
    { text: `No COC on file (${model.issues.noCoc.length})`, fontSize: 9, color: TEXT.fail },
    { text: model.issues.noCoc.map(i => i.name).join(" · ") || "—", fontSize: 9, margin: [0, 0, 0, 6] },
    { text: `Failed verdict / SANS rules (${model.issues.failed.length})`, fontSize: 9, color: TEXT.fail },
    model.issues.failed.length
      ? { ul: model.issues.failed.map(f => `${f.name} — ${f.certNo} — failed ${f.failedRules.join(", ") || "(see verdict)"}`), fontSize: 9 }
      : { text: "—", fontSize: 9 },
  ];

  const tablesBlock: Content[] = [
    { text: "DB / COC Schedule", fontSize: 14, bold: true, pageBreak: "before", margin: [0, 0, 0, 6] },
    scheduleTableContent(model.scheduleTable),
    { text: "COC Verification vs SANS 10142-1", fontSize: 14, bold: true, pageBreak: "before", margin: [0, 0, 0, 2] },
    { text: "P Pass · F Fail · CV Cannot verify · N/A not applicable · · not captured", fontSize: 7, color: "#5F5E5A", margin: [0, 0, 0, 4] },
    verificationContent(model.verificationRows),
    { text: "File register", fontSize: 14, bold: true, pageBreak: "before", margin: [0, 0, 0, 6] },
    fileRegisterContent(model.fileRegister),
  ];

  return {
    pageOrientation: "landscape",
    content: [...cover, ...summary, ...tablesBlock],
    defaultStyle: { fontSize: 9 },
  };
}
