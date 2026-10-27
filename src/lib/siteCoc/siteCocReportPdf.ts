// Site COC report: data load + PDF build, hook-free. Shared by the COC tab (ReportSubTab / useSiteCoc)
// and the site "All reports" runner so both produce the same PDF from the same data.
import QRCode from "qrcode";
import { generatePdfBlob } from "@/lib/pdfMakeConfig";
import { generateDocumentFilename } from "@/lib/documentDesignStandards";
import { imageUrlToBase64 } from "@/lib/pdfBranding";
import { qrSiteRedirectUrl } from "@/lib/qrBaseUrl";
import { buildSiteCocReportDocDef } from "./siteCocReport";
import { buildSiteCocModel, type SiteCocReportInput } from "./siteCocData";

export { loadSiteCocData, buildSiteCocModel, type SiteCocData, type SiteCocReportInput } from "./siteCocData";

export async function generateSiteCocReportPdf(input: SiteCocReportInput): Promise<{ blob: Blob; filename: string }> {
  const { siteId, siteName, companyLogo } = input;
  const logoDataUrl = companyLogo ? await imageUrlToBase64(companyLogo).catch(() => null) : null;
  // Site-level verification QR for the report header — same stable qr-redirect
  // indirection as the Site Summary Report cover. See src/lib/qrBaseUrl.ts.
  const qrCodeDataUrl = siteId
    ? await QRCode.toDataURL(qrSiteRedirectUrl(siteId), {
        width: 500,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' },
        errorCorrectionLevel: 'H',
      }).catch(() => null)
    : null;
  const blob = await generatePdfBlob(buildSiteCocReportDocDef(buildSiteCocModel(input), logoDataUrl, qrCodeDataUrl));
  // Unified naming (F3): sanitised, LOCAL date stamp via the shared helper.
  return { blob, filename: generateDocumentFilename('Site_COC_Report', siteName) };
}
