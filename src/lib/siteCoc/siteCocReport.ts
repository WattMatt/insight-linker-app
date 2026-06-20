import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { COC_SANS_RULES } from "./sansRules";
import type { CocReportModel, ReportCert, ReportTenant, VerdictKind } from "./cocReportModel";

const FILL = { pass: "#E1F5EE", fail: "#FCEBEB", review: "#FAEEDA", cv: "#FAEEDA", pending: "#F1EFE8", na: "#F1EFE8" };
const TEXT: Record<VerdictKind, string> = { pass: "#0F6E56", fail: "#A32D2D", review: "#854F0B", cv: "#854F0B", pending: "#5F5E5A" };
const verdictLabel: Record<VerdictKind, string> = { pass: "Pass", fail: "Fail", review: "Review", cv: "CV", pending: "Pending" };
const glyph = (v: string) => { const t = (v || "").toUpperCase(); return t === "PASS" ? "P" : t === "FAIL" ? "F" : t === "CV" ? "CV" : t === "N/A" ? "N/A" : t ? t : "·"; };
const ruleFill = (v: string) => { const t = (v || "").toUpperCase(); return t === "FAIL" ? FILL.fail : t === "CV" ? FILL.cv : t === "N/A" ? FILL.na : FILL.pass; };

function sansGrid(c: ReportCert): Content {
  const codes = COC_SANS_RULES.map(r => ({ text: r.code, fontSize: 6, alignment: "center" as const, fillColor: "#F1EFE8" }));
  const marks = COC_SANS_RULES.map(r => { const v = c.rules?.[r.code] ?? ""; return { text: glyph(v), fontSize: 6, alignment: "center" as const, fillColor: ruleFill(v) }; });
  return { table: { widths: Array(COC_SANS_RULES.length).fill("*"), body: [codes, marks] }, layout: "noBorders", margin: [0, 2, 0, 4] };
}

function tenantSection(t: ReportTenant, first: boolean): Content[] {
  const out: Content[] = [];
  out.push({
    columns: [
      { text: [{ text: t.name, bold: true }, { text: t.shopNo ? `   ${t.shopNo}` : "", fontSize: 8, color: "#5F5E5A" }] },
      { text: t.noCoc ? "No COC on file" : verdictLabel[t.coverage.verdictKind], alignment: "right", color: t.noCoc ? TEXT.fail : TEXT[t.coverage.verdictKind] },
    ],
    margin: [0, first ? 0 : 8, 0, 2],
    pageBreak: first ? undefined : "before",
  });
  out.push({ text: `Coverage: COC ${t.coverage.hasCoc ? "yes" : "—"} · Evaluation ${t.coverage.hasEval ? "yes" : "—"}`, fontSize: 8, color: "#5F5E5A", margin: [0, 0, 0, 2] });
  out.push({ text: `Register expects — Initial: ${t.registerInitial || "—"}   Supplementary: ${t.registerSupp || "—"}`, fontSize: 8, color: "#5F5E5A", margin: [0, 0, 0, 4] });

  if (t.certs.length) {
    out.push({
      table: {
        headerRows: 1, widths: ["auto", "auto", "auto", "auto", "auto"], body: [
          [{ text: "Cert no", bold: true }, { text: "Type", bold: true }, { text: "Verdict", bold: true }, { text: "Issued", bold: true }, { text: "Files", bold: true }],
          ...t.certs.map(c => [
            { text: c.certNo }, { text: c.type },
            { text: verdictLabel[c.verdictKind], color: TEXT[c.verdictKind] },
            { text: c.issuedDate ?? "—" },
            { text: `${c.hasCoc ? "COC" : ""}${c.hasCoc && c.hasEval ? " + " : ""}${c.hasEval ? "Eval" : ""}` || "—" },
          ]),
        ],
      }, layout: "lightHorizontalLines", fontSize: 9, margin: [0, 0, 0, 4],
    });
    for (const c of t.certs) out.push(sansGrid(c));
  }
  if (t.actions.length) {
    out.push({ text: "Outstanding actions", bold: true, fontSize: 9, margin: [0, 2, 0, 2] });
    out.push({ ul: t.actions, fontSize: 9, color: "#A32D2D" });
  } else {
    out.push({ text: "No outstanding items.", fontSize: 9, color: "#0F6E56" });
  }
  return out;
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

  const tenantsBlock: Content[] = [
    { text: "Tenant detail", fontSize: 12, bold: true, pageBreak: "before", margin: [0, 0, 0, 6] },
    ...model.tenants.flatMap((t, i) => tenantSection(t, i === 0)),
  ];

  return {
    pageOrientation: "landscape",
    content: [...cover, ...summary, ...tenantsBlock],
    defaultStyle: { fontSize: 9 },
  };
}
