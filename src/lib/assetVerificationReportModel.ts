// Pure, testable model for the Asset Verification report. Mirrors the COC report's model/render
// split (src/lib/siteCoc/cocReportModel.ts → siteCocReport.ts): this module shapes the
// comparison data into a typed, I/O-free model; assetVerificationReport.ts renders it.

import {
  meterRowLabel,
  siteShopLabel,
  type ComparisonResult,
  type InspectionTenantMatch,
  type VerificationStats,
} from "./assetVerification";

export interface AvReportInput {
  siteName: string;
  clientName?: string | null;
  generatedAt: string; // pre-formatted date string
  referenceNumber: string;
  comparisonResults: ComparisonResult[];
  stats: Pick<VerificationStats, "total" | "verified" | "verifiedNoDiscrepancy" | "discrepancies" | "unverified" | "withImages"> &
    Partial<VerificationStats>;
  /** Meters found on site that no register row is tied to. */
  unregisteredMeters?: InspectionTenantMatch[];
}

export interface AvSummary {
  total: number;
  verified: number; // verified with no discrepancy
  discrepancies: number; // register rows with at least one discrepancy
  wrongMeter: number;
  unverified: number;
  withImages: number;
  unregistered: number;
  verificationPct: number;
}

export interface AvVerifiedRow {
  premisesId: string;
  tradeAs: string;
  mismatch: boolean;
  statusLabel: string;
  /** What the site says this premises is: shop · tenant, then board · meter row. */
  source: string;
  meterSerial: string;
  /** The serial found on site, when it differs from the register's. */
  siteSerial: string | null;
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

export interface AvUnregisteredRow {
  board: string;
  shopNumber: string;
  shopName: string;
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
  unregisteredRows: AvUnregisteredRow[];
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "—");

const STATUS_LABEL: Record<ComparisonResult["status"], string> = {
  verified: "Verified",
  mismatch: "Mismatch",
  wrong_meter: "Wrong meter",
  prev_meter: "Prev. meter",
  unverified: "Not verified",
};

function siteSource(r: ComparisonResult): string {
  if (r.belongsTo) return `On site: ${r.belongsTo.premisesId}'s meter`;
  const parts: string[] = [];
  if (r.siteShop) parts.push(siteShopLabel(r.siteShop));
  if (r.inspectionMatch) parts.push(meterRowLabel(r.inspectionMatch));
  return parts.join("\n") || "Inspection";
}

export function buildAssetVerificationReportModel(input: AvReportInput): AvReportModel {
  const { stats, comparisonResults } = input;
  const verificationPct = stats.total > 0 ? Math.round((stats.verifiedNoDiscrepancy / stats.total) * 100) : 0;
  const unregistered = input.unregisteredMeters ?? [];

  const summary: AvSummary = {
    total: stats.total,
    verified: stats.verifiedNoDiscrepancy,
    discrepancies: stats.discrepancies,
    wrongMeter: stats.wrongMeter ?? comparisonResults.filter((r) => r.status === "wrong_meter").length,
    unverified: stats.unverified,
    withImages: stats.withImages,
    unregistered: unregistered.length,
    verificationPct,
  };

  const verifiedRows: AvVerifiedRow[] = comparisonResults
    .filter((r) => r.verified)
    .map((r) => {
      // Photos of another premises' meter are not evidence for this one.
      const photos = r.status === "wrong_meter" ? null : r.inspectionMatch;
      return {
        premisesId: dash(r.asset.premises_id),
        tradeAs: dash(r.asset.trade_as),
        mismatch: r.hasDiscrepancy,
        statusLabel: STATUS_LABEL[r.status],
        source: siteSource(r),
        meterSerial: dash(r.asset.meter_serial_number),
        siteSerial: r.serialMatch === "mismatch" ? r.siteSerial : null,
        ctRatio: dash(r.asset.ct_ratio),
        ctMismatch: r.ctMatch === "mismatch",
        breaker: dash(r.asset.breaker_size),
        breakerMismatch: r.breakerMatch === "mismatch",
        meterImage: photos?.meterImage ?? null,
        ctRatioImage: photos?.ctRatioImage ?? null,
        breakerImage: photos?.breakerImage ?? null,
      };
    });

  const discrepancyRows: AvDiscrepancyRow[] = [];
  for (const r of comparisonResults) {
    if (!r.hasDiscrepancy || r.status === "prev_meter") continue;
    const premisesId = dash(r.asset.premises_id);
    if (r.belongsTo) {
      discrepancyRows.push({
        premisesId,
        field: "Meter",
        registerValue: dash(r.asset.meter_serial_number),
        inspectionValue: `on site this is ${r.belongsTo.premisesId}'s meter (${r.belongsTo.label})`,
      });
      continue;
    }
    if (r.serialMatch === "mismatch") {
      discrepancyRows.push({
        premisesId,
        field: "Meter serial",
        registerValue: dash(r.asset.meter_serial_number),
        inspectionValue: dash(r.siteSerial),
      });
    }
    if (r.ctMatch === "mismatch") {
      discrepancyRows.push({
        premisesId,
        field: "CT ratio",
        registerValue: dash(r.asset.ct_ratio),
        inspectionValue: dash(r.inspectionMatch?.ctSizeAndRatio),
      });
    }
    if (r.breakerMatch === "mismatch") {
      discrepancyRows.push({
        premisesId,
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

  const unregisteredRows: AvUnregisteredRow[] = unregistered.map((m) => ({
    board: dash(m.subsectionName),
    shopNumber: dash(m.shopNumber),
    shopName: dash(m.shopName),
    meterSerial: dash(m.meterSerialNumber),
    ctRatio: dash(m.ctSizeAndRatio),
    breaker: dash(m.breakerSize),
  }));

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const narrative =
    `${input.siteName} has ${plural(summary.total, "asset", "assets")} in the register. ` +
    `${summary.verified} ${summary.verified === 1 ? "is" : "are"} verified against what was found on site, ` +
    `${summary.discrepancies} ${summary.discrepancies === 1 ? "has a discrepancy" : "have discrepancies"}` +
    (summary.wrongMeter ? ` (${summary.wrongMeter} of them quote another premises' meter)` : "") +
    `, and ${summary.unverified} ${summary.unverified === 1 ? "has" : "have"} no matching site record. ` +
    (summary.unregistered ? `${plural(summary.unregistered, "meter was", "meters were")} found on site with no register entry. ` : "") +
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
    unregisteredRows,
  };
}
