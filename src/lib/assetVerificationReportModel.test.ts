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

const result = (over: Partial<ComparisonResult> = {}): ComparisonResult => {
  const base: ComparisonResult = {
    asset: asset(),
    inspectionMatch: null,
    siteShop: null,
    linkedBy: null,
    siteSerial: null,
    serialMatch: "na",
    belongsTo: null,
    status: "unverified",
    verified: false,
    matchedOnOldSerial: false,
    duplicateRow: false,
    ctMatch: "na",
    breakerMatch: "na",
    hasDiscrepancy: false,
    ...over,
  };
  if (!over.status) base.status = !base.verified ? "unverified" : base.hasDiscrepancy ? "mismatch" : "verified";
  return base;
};

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

  it("carries inspection image URLs onto verified rows (null when absent)", () => {
    const m = buildAssetVerificationReportModel({
      siteName: "Site A", generatedAt: "d", referenceNumber: "r",
      stats: stats({ total: 1, verifiedNoDiscrepancy: 1 }),
      comparisonResults: [
        result({
          verified: true,
          inspectionMatch: { inspectionId: "i", inspectionTitle: "t", subsectionId: null, meterSerialNumber: "M-100", meterImage: "https://x/meter.jpg", breakerImage: "https://x/breaker.jpg" },
        }),
      ],
    });
    expect(m.verifiedRows[0]).toMatchObject({ meterImage: "https://x/meter.jpg", ctRatioImage: null, breakerImage: "https://x/breaker.jpg" });
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

  // 204 Oxford: the register row for the escalator quotes Missfit Boxing's meter serial.
  it("reports a wrong meter as a discrepancy naming where the meter really is, without its photos", () => {
    const m = buildAssetVerificationReportModel({
      siteName: "204 Oxford", generatedAt: "d", referenceNumber: "r",
      stats: stats({ total: 1, discrepancies: 1 }),
      comparisonResults: [
        result({
          verified: true,
          hasDiscrepancy: true,
          status: "wrong_meter",
          asset: asset({ premises_id: "OX - ESCELATOR UP", meter_serial_number: "34445082" }),
          belongsTo: { premisesId: "OX - F03", label: "SHOP F03 · MISSFIT BOXING" },
          inspectionMatch: { inspectionId: "i", inspectionTitle: "t", subsectionId: null, meterSerialNumber: "34445082", meterImage: "https://x/m.jpg" },
        }),
      ],
    });
    expect(m.verifiedRows[0]).toMatchObject({ statusLabel: "Wrong meter", meterImage: null });
    expect(m.discrepancyRows).toEqual([
      { premisesId: "OX - ESCELATOR UP", field: "Meter", registerValue: "34445082", inspectionValue: "on site this is OX - F03's meter (SHOP F03 · MISSFIT BOXING)" },
    ]);
    expect(m.summary.wrongMeter).toBe(1);
  });

  it("reports a register serial that differs from the site serial", () => {
    const m = buildAssetVerificationReportModel({
      siteName: "204 Oxford", generatedAt: "d", referenceNumber: "r",
      stats: stats({ total: 1, discrepancies: 1 }),
      comparisonResults: [
        result({
          verified: true,
          hasDiscrepancy: true,
          linkedBy: "shop",
          serialMatch: "mismatch",
          siteSerial: "35753503",
          asset: asset({ premises_id: "OX - G01-G06", meter_serial_number: "35753143" }),
          siteShop: { id: "s1", name: "SHOP G01-G06", tenant_name: "TURN 'N TENDER" },
        }),
      ],
    });
    expect(m.verifiedRows[0]).toMatchObject({ siteSerial: "35753503", source: "SHOP G01-G06 · TURN 'N TENDER" });
    expect(m.discrepancyRows[0]).toMatchObject({ field: "Meter serial", registerValue: "35753143", inspectionValue: "35753503" });
  });

  it("lists meters found on site with no register entry", () => {
    const m = buildAssetVerificationReportModel({
      siteName: "Site A", generatedAt: "d", referenceNumber: "r", comparisonResults: [], stats: stats(),
      unregisteredMeters: [
        { inspectionId: "i", inspectionTitle: "t", subsectionId: null, subsectionName: "Main DB C", shopName: "DB Sub F1", meterSerialNumber: "35753144", ctSizeAndRatio: "250/5A", breakerSize: "250A" },
      ],
    });
    expect(m.unregisteredRows).toEqual([
      { board: "Main DB C", shopNumber: "—", shopName: "DB Sub F1", meterSerial: "35753144", ctRatio: "250/5A", breaker: "250A" },
    ]);
    expect(m.narrative).toContain("1 meter was found on site with no register entry");
  });
});
