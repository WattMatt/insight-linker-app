import { describe, it, expect } from "vitest";
import { buildAssetVerificationReportModel } from "./assetVerificationReportModel";
import type { ComparisonResult } from "./assetVerification";

const asset = (over: Partial<ComparisonResult["asset"]> = {}): ComparisonResult["asset"] => ({
  id: "a1",
  premises_id: "P1",
  trade_as: "Shop 1",
  meter_serial_number: "M-100",
  ct_ratio: "100/5",
  breaker_size: "60A",
  asset_category: "electrical",
  ...over,
});

const result = (over: Partial<ComparisonResult> = {}): ComparisonResult => ({
  asset: asset(),
  inspectionMatch: null,
  verified: false,
  ctMatch: "na",
  breakerMatch: "na",
  hasDiscrepancy: false,
  ...over,
});

const stats = (over: Partial<Parameters<typeof buildAssetVerificationReportModel>[0]["stats"]> = {}) => ({
  total: 0,
  verified: 0,
  verifiedNoDiscrepancy: 0,
  discrepancies: 0,
  unverified: 0,
  withImages: 0,
  ...over,
});

describe("buildAssetVerificationReportModel", () => {
  it("computes verification percentage from verifiedNoDiscrepancy / total", () => {
    const m = buildAssetVerificationReportModel({
      siteName: "Site A", generatedAt: "2026-06-21", referenceNumber: "AVR-1",
      comparisonResults: [], stats: stats({ total: 4, verifiedNoDiscrepancy: 3, discrepancies: 1 }),
    });
    expect(m.summary.verificationPct).toBe(75);
    expect(m.summary.verified).toBe(3);
    expect(m.narrative).toContain("75%");
  });

  it("returns 0% (not NaN) when there are no assets", () => {
    const m = buildAssetVerificationReportModel({
      siteName: "Site A", generatedAt: "d", referenceNumber: "r", comparisonResults: [], stats: stats(),
    });
    expect(m.summary.verificationPct).toBe(0);
  });

  it("builds verified rows with mismatch + per-field mismatch flags", () => {
    const m = buildAssetVerificationReportModel({
      siteName: "Site A", generatedAt: "d", referenceNumber: "r",
      stats: stats({ total: 1, discrepancies: 1 }),
      comparisonResults: [
        result({
          verified: true,
          hasDiscrepancy: true,
          ctMatch: "mismatch",
          breakerMatch: "match",
          inspectionMatch: { inspectionId: "i", inspectionTitle: "t", subsectionId: null, subsectionName: "Sub 1", meterSerialNumber: "M-100", ctSizeAndRatio: "200/5", breakerSize: "60A" },
        }),
      ],
    });
    expect(m.verifiedRows).toHaveLength(1);
    expect(m.verifiedRows[0]).toMatchObject({ premisesId: "P1", mismatch: true, source: "Sub 1", ctMismatch: true, breakerMismatch: false });
  });

  it("emits one discrepancy row per mismatched field (CT + breaker → 2 rows)", () => {
    const m = buildAssetVerificationReportModel({
      siteName: "Site A", generatedAt: "d", referenceNumber: "r",
      stats: stats({ total: 1, discrepancies: 1 }),
      comparisonResults: [
        result({
          verified: true,
          hasDiscrepancy: true,
          ctMatch: "mismatch",
          breakerMatch: "mismatch",
          asset: asset({ ct_ratio: "100/5", breaker_size: "60A" }),
          inspectionMatch: { inspectionId: "i", inspectionTitle: "t", subsectionId: null, meterSerialNumber: "M-100", ctSizeAndRatio: "200/5", breakerSize: "100A" },
        }),
      ],
    });
    expect(m.discrepancyRows).toHaveLength(2);
    expect(m.discrepancyRows[0]).toMatchObject({ field: "CT ratio", registerValue: "100/5", inspectionValue: "200/5" });
    expect(m.discrepancyRows[1]).toMatchObject({ field: "Breaker size", registerValue: "60A", inspectionValue: "100A" });
  });

  it("lists unverified assets and falls back to em-dash for blanks", () => {
    const m = buildAssetVerificationReportModel({
      siteName: "Site A", generatedAt: "d", referenceNumber: "r",
      stats: stats({ total: 1, unverified: 1 }),
      comparisonResults: [result({ verified: false, asset: asset({ premises_id: "P9", trade_as: null, ct_ratio: null }) })],
    });
    expect(m.unverifiedRows).toHaveLength(1);
    expect(m.unverifiedRows[0]).toMatchObject({ premisesId: "P9", tradeAs: "—", ctRatio: "—" });
  });
});
