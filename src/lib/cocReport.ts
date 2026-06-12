import type { Content } from "@/lib/pdfMakeConfig";
import { createBaseDocDefinition, generatePdfBlob } from "@/lib/pdfMakeConfig";

export interface CocReportData {
  subsectionName: string;
  siteName?: string;
  coc_status: string;
  coc_number?: string | null;
  coc_issue_date?: string | null;
  coc_expiry_date?: string | null;
  coc_failure_reasons?: string | null;
}

/**
 * Per-COC report. On a Fail it lists the recorded reasons (a summary of the items in the
 * COC that caused it to fail); on a Pass it is a plain certificate summary.
 */
export async function generateCocReport(d: CocReportData): Promise<Blob> {
  const reasons = (d.coc_failure_reasons || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const content: Content[] = [
    { text: "Certificate of Compliance — Report", fontSize: 18, bold: true, margin: [0, 0, 0, 8] },
    { text: `${d.siteName ? d.siteName + " · " : ""}${d.subsectionName}`, margin: [0, 0, 0, 12] },
    {
      table: {
        widths: ["35%", "65%"],
        body: [
          ["Verdict", d.coc_status],
          ["COC number", d.coc_number || "—"],
          ["Issue date", d.coc_issue_date || "—"],
          ["Expiry date", d.coc_expiry_date || "—"],
        ],
      },
      layout: "lightHorizontalLines",
      margin: [0, 0, 0, 16],
    },
    ...(d.coc_status === "Fail"
      ? [
          { text: "Reasons for failure", fontSize: 14, bold: true, margin: [0, 8, 0, 6] } as Content,
          reasons.length
            ? ({ ul: reasons } as Content)
            : ({ text: "No reasons recorded.", italics: true } as Content),
        ]
      : []),
  ];

  const docDefinition = createBaseDocDefinition(content, {
    title: `COC Report — ${d.subsectionName}`,
    subject: "Certificate of Compliance",
  });

  return generatePdfBlob(docDefinition);
}
