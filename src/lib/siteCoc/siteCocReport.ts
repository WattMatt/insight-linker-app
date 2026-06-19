import type { TDocumentDefinitions } from "pdfmake/interfaces";
import { COC_SANS_RULES } from "./sansRules";
import type { CocScheduleRow, CocCertRow, CocBatch } from "@/views/site-coc/useSiteCoc";

export interface SiteCocReportInput {
  siteName: string;
  schedule: CocScheduleRow[];
  certificates: CocCertRow[];
  batch: CocBatch | null;
}

const startsWith = (s: string, p: string) => (s ?? "").toUpperCase().startsWith(p);

export function buildSiteCocReportDocDef(input: SiteCocReportInput): TDocumentDefinitions {
  const { siteName, schedule, certificates, batch } = input;
  const certPass = certificates.filter(c => startsWith(c.verdict, "PASS")).length;
  const certFail = certificates.filter(c => startsWith(c.verdict, "FAIL")).length;
  const certCV = certificates.filter(c => startsWith(c.verdict, "CV")).length;
  const matchedShops = schedule.filter(s => s.match_status === "matched").length;
  const failedCodes = (c: CocCertRow) =>
    COC_SANS_RULES.filter(r => (c.rules?.[r.code] ?? "").toUpperCase() === "FAIL").map(r => r.code).join(", ");

  return {
    pageOrientation: "landscape",
    content: [
      { text: `${siteName} — Site COC Report`, style: "h1" },
      { text: batch ? `Imported ${new Date(batch.created_at).toLocaleString()} · ${batch.unmatched_count} unmatched` : "No import yet", style: "muted" },
      { text: "Summary", style: "h2", margin: [0, 10, 0, 4] },
      { ul: [
        `Shops: ${schedule.length} (${matchedShops} matched)`,
        `Certificates: ${certificates.length} — PASS ${certPass}, FAIL ${certFail}, CV ${certCV}`,
      ] },
      { text: "Schedule", style: "h2", margin: [0, 10, 0, 4] },
      { table: { headerRows: 1, widths: ["auto", "*", "auto", "auto", "*"], body: [
        ["Shop", "Trading", "COC Req.", "Files", "Status"],
        ...schedule.map(s => [s.shop_no_raw, s.trading_name, s.coc_required, String(s.files_count ?? ""), s.status]),
      ] }, layout: "lightHorizontalLines" },
      { text: "Verification", style: "h2", margin: [0, 10, 0, 4] },
      { table: { headerRows: 1, widths: ["auto", "auto", "auto", "auto", "*"], body: [
        ["Shop", "Cert No", "Type", "Verdict", "Failed rules"],
        ...certificates.map(c => [c.shop_no_raw, c.cert_no, c.cert_type, c.verdict, failedCodes(c) || "—"]),
      ] }, layout: "lightHorizontalLines" },
    ],
    styles: {
      h1: { fontSize: 16, bold: true },
      h2: { fontSize: 12, bold: true },
      muted: { fontSize: 9, color: "#666666" },
    },
    defaultStyle: { fontSize: 8 },
  };
}
