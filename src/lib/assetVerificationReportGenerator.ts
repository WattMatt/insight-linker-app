/**
 * Asset Verification Report Generator
 *
 * Builds a COC-caliber PDF (branded cover, executive summary with narrative + tinted KPI cards +
 * rate gauge, an Issues & exceptions section, and styled detail tables) from the
 * asset-register-vs-inspection comparison.
 *
 * Model / render split, mirroring the COC report:
 *   buildAssetVerificationReportModel (pure)  →  buildAssetVerificationReportDocDef (renderer)
 * This module only orchestrates branding + generation.
 */

import { generateDocumentFilename } from "./documentDesignStandards";
import { generatePdfBlob } from "./pdfMakeConfig";
import { loadCompanyBranding, imageUrlToBase64, formatPdfDate, generateReferenceNumber } from "./pdfBranding";
import { PDFComplianceCheck, createComplianceResult } from "./pdfTemplates";
import type { ComparisonResult } from "./assetVerification";
import { buildAssetVerificationReportModel } from "./assetVerificationReportModel";
import { buildAssetVerificationReportDocDef } from "./assetVerificationReport";

export interface InspectionGeneratorOptions {
  siteName: string;
  clientName?: string;
  comparisonResults: ComparisonResult[];
  stats: {
    total: number;
    verified: number;
    verifiedNoDiscrepancy: number;
    discrepancies: number;
    unverified: number;
    withImages: number;
  };
  companyLogoUrl?: string | null;
}

/**
 * Generate the Asset Verification report PDF.
 * Returns the blob + filename + compliance checks for the preview dialog.
 */
export async function generateInspectionBasedReport(
  options: InspectionGeneratorOptions
): Promise<{ blob: Blob; filename: string; complianceChecks: PDFComplianceCheck }> {
  const { siteName, clientName, comparisonResults, stats, companyLogoUrl } = options;

  // Branding: explicit logo override, else the company branding logo, else the renderer's text fallback.
  const logoDataUrl = companyLogoUrl
    ? await imageUrlToBase64(companyLogoUrl)
    : (await loadCompanyBranding()).logoDataUrl;

  const model = buildAssetVerificationReportModel({
    siteName,
    clientName: clientName ?? null,
    generatedAt: formatPdfDate(new Date()),
    referenceNumber: generateReferenceNumber("AVR"),
    comparisonResults,
    stats,
  });

  const blob = await generatePdfBlob(buildAssetVerificationReportDocDef(model, logoDataUrl));
  const filename = generateDocumentFilename("Asset_Verification", siteName);

  const complianceChecks = createComplianceResult({
    hasCoverPage: true,
    logoPlacement: !!logoDataUrl,
    standardMargins: true,
    typographyScale: true,
    brandColors: true,
    pageHeaders: true,
    pageFooters: true,
    tableStyles: true,
    pageBreaks: true,
  });

  return { blob, filename, complianceChecks };
}
