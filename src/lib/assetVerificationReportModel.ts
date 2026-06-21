// Pure, testable model for the Asset Verification report. Mirrors the COC report's model/render
// split (src/lib/siteCoc/cocReportModel.ts → siteCocReport.ts): this module shapes the
// comparison data into a typed, I/O-free model; assetVerificationReport.ts renders it.

import type { ComparisonResult } from "./assetVerification";

export interface AvReportInput {
  siteName: string;
  clientName?: string | null;
  generatedAt: string; // pre-formatted date string
  referenceNumber: string;
  comparisonResults: ComparisonResult[];
  stats: {
    total: number;
    verified: number;
    verifiedNoDiscrepancy: number;
    discrepancies: number;
    unverified: number;
    withImages: number;
  };
}

export interface AvSummary {
  total: number;
  verified: number; // verified with no discrepancy
  discrepancies: number;
  unverified: number;
  withImages: number;
  verificationPct: number;
}

export interface AvVerifiedRow {
  premisesId: string;
  tradeAs: string;
  mismatch: boolean;
  source: string;
  meterSerial: string;
  ctRatio: string;
  ctMismatch: boolean;
  breaker: string;
  breakerMismatch: boolean;
  // Inspection image URLs (resolved to compressed thumbnails at render time). Null when absent.
  meterImage: string | null;
  ctRatioImage: string | null;
  breakerImage: string | null;
}

export interface AvDiscrepancyRow {
  premisesId: string;
  field: string;
  registerValue: string;
  inspectionValue: string;
}

export interface AvUnverifiedRow {
  premisesId: string;
  tradeAs: string;
  meterSerial: string;
  ctRatio: string;
  breaker: string;
}

export interface AvReportModel {
  cover: { siteName: string; clientName: string | null; generatedAt: string; referenceNumber: string };
  summary: AvSummary;
  narrative: string;
  verifiedRows: AvVerifiedRow[];
  discrepancyRows: AvDiscrepancyRow[];
  unverifiedRows: AvUnverifiedRow[];
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

export function buildAssetVerificationReportModel(input: AvReportInput): AvReportModel {
  const { stats, comparisonResults } = input;
  const verificationPct = stats.total > 0 ? Math.round((stats.verifiedNoDiscrepancy / stats.total) * 100) : 0;

  const summary: AvSummary = {
    total: stats.total,
    verified: stats.verifiedNoDiscrepancy,
    discrepancies: stats.discrepancies,
    unverified: stats.unverified,
    withImages: stats.withImages,
    verificationPct,
  };

  const verifiedRows: AvVerifiedRow[] = comparisonResults
    .filter((r) => r.verified)
    .map((r) => ({
      premisesId: dash(r.asset.premises_id),
      tradeAs: dash(r.asset.trade_as),
      mismatch: r.hasDiscrepancy,
      source: r.inspectionMatch?.subsectionName || r.inspectionMatch?.shopName || "Inspection",
      meterSerial: dash(r.asset.meter_serial_number),
      ctRatio: dash(r.asset.ct_ratio),
      ctMismatch: r.ctMatch === "mismatch",
      breaker: dash(r.asset.breaker_size),
      breakerMismatch: r.breakerMatch === "mismatch",
      meterImage: r.inspectionMatch?.meterImage ?? null,
      ctRatioImage: r.inspectionMatch?.ctRatioImage ?? null,
      breakerImage: r.inspectionMatch?.breakerImage ?? null,
    }));

  const discrepancyRows: AvDiscrepancyRow[] = [];
  for (const r of comparisonResults) {
    if (!r.hasDiscrepancy) continue;
    if (r.ctMatch === "mismatch") {
      discrepancyRows.push({
        premisesId: dash(r.asset.premises_id),
        field: "CT ratio",
        registerValue: dash(r.asset.ct_ratio),
        inspectionValue: dash(r.inspectionMatch?.ctSizeAndRatio),
      });
    }
    if (r.breakerMatch === "mismatch") {
      discrepancyRows.push({
        premisesId: dash(r.asset.premises_id),
        field: "Breaker size",
        registerValue: dash(r.asset.breaker_size),
        inspectionValue: dash(r.inspectionMatch?.breakerSize),
      });
    }
  }

  const unverifiedRows: AvUnverifiedRow[] = comparisonResults
    .filter((r) => !r.verified)
    .map((r) => ({
      premisesId: dash(r.asset.premises_id),
      tradeAs: dash(r.asset.trade_as),
      meterSerial: dash(r.asset.meter_serial_number),
      ctRatio: dash(r.asset.ct_ratio),
      breaker: dash(r.asset.breaker_size),
    }));

  const narrative =
    `${input.siteName} has ${summary.total} ${summary.total === 1 ? "asset" : "assets"} in the register. ` +
    `${summary.verified} ${summary.verified === 1 ? "is" : "are"} verified against inspection data, ` +
    `${summary.discrepancies} ${summary.discrepancies === 1 ? "has a value mismatch" : "have value mismatches"}, and ` +
    `${summary.unverified} ${summary.unverified === 1 ? "has" : "have"} no matching inspection. ` +
    `Overall verification is ${verificationPct}%.`;

  return {
    cover: {
      siteName: input.siteName,
      clientName: input.clientName ?? null,
      generatedAt: input.generatedAt,
      referenceNumber: input.referenceNumber,
    },
    summary,
    narrative,
    verifiedRows,
    discrepancyRows,
    unverifiedRows,
  };
}
