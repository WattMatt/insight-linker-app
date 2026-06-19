import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";
import { COC_SANS_RULES } from "./sansRules";
import type { CocReportModel, ReportCert, ReportTenant, VerdictKind } from "./cocReportModel";

const FILL = { pass: "#E1F5EE", fail: "#FCEBEB", review: "#FAEEDA", cv: "#FAEEDA", pending: "#F1EFE8", na: "#F1EFE8" };
const TEXT: Record<VerdictKind, string> = { pass: "#0F6E56", fail: "#A32D2D", review: "#854F0B", cv: "#854F0B", pending: "#5F5E5A" };
const verdictLabel: Record<VerdictKind, string> = { pass: "Pass", fail: "Fail", review: "Review", cv: "CV", pending: "Pending" };
const glyph = (v: string) => { const t = (v || "").toUpperCase(); return t === "PASS" ? "✓" : t === "FAIL" ? "✗" : t === "CV" ? "CV" : t === "N/A" ? "–" : t ? t : "·"; };
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

export function buildSiteCocReportDocDef(model: CocReportModel): TDocumentDefinitions {
  const s = model.summary;
  const dashboard: Content[] = [
    { text: `${model.siteName} — Site COC report`, fontSize: 16, bold: true },
    { text: `Generated ${model.generatedAt}${model.lastImport ? ` · imported ${model.lastImport}` : ""}`, fontSize: 9, color: "#5F5E5A", margin: [0, 0, 0, 8] },
    {
      columns: [
        { text: [{ text: `${s.required}\n`, fontSize: 16, bold: true }, { text: "COC required", fontSize: 8, color: "#5F5E5A" }] },
        { text: [{ text: `${s.clear}\n`, fontSize: 16, bold: true, color: TEXT.pass }, { text: "Clear (Pass)", fontSize: 8, color: "#5F5E5A" }] },
        { text: [{ text: `${s.noCoc}\n`, fontSize: 16, bold: true, color: TEXT.fail }, { text: "No COC on file", fontSize: 8, color: "#5F5E5A" }] },
        { text: [{ text: `${s.failed}\n`, fontSize: 16, bold: true, color: TEXT.fail }, { text: "Failed", fontSize: 8, color: "#5F5E5A" }] },
        { text: [{ text: `${s.compliantPct}%\n`, fontSize: 16, bold: true }, { text: "Compliant", fontSize: 8, color: "#5F5E5A" }] },
      ], margin: [0, 0, 0, 10],
    },
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
    content: [...dashboard, ...tenantsBlock],
    defaultStyle: { fontSize: 9 },
  };
}
