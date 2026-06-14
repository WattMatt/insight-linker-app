import { describe, it, expect } from "vitest";
import {
  normalizeMeterSerial,
  compareValues,
  buildInspectionMeterMatches,
  buildComparisonResults,
  parseAssetRows,
  type InspectionRecord,
  type SubsectionNameRecord,
  type AssetForComparison,
} from "./assetVerification";

describe("normalizeMeterSerial", () => {
  it("uppercases and strips all non-alphanumerics", () => {
    expect(normalizeMeterSerial("ab-12/3")).toBe("AB123");
  });
  it("strips spaces", () => {
    expect(normalizeMeterSerial("  a b c ")).toBe("ABC");
  });
  it("returns empty string for null/undefined/empty", () => {
    expect(normalizeMeterSerial(null)).toBe("");
    expect(normalizeMeterSerial(undefined)).toBe("");
    expect(normalizeMeterSerial("")).toBe("");
  });
});

describe("compareValues", () => {
  it("treats both-empty as na", () => {
    expect(compareValues("", "")).toBe("na");
    expect(compareValues(null, undefined)).toBe("na");
  });
  it("treats NA / TBC sentinels as na", () => {
    expect(compareValues("NA", "100/5")).toBe("na");
    expect(compareValues("100/5", "TBC")).toBe("na");
  });
  it("treats one side missing as na", () => {
    expect(compareValues("100/5", "")).toBe("na");
  });
  it("preserves the slash in CT ratios and matches ignoring spaces/case", () => {
    expect(compareValues("1000/5", "1000 / 5")).toBe("match");
    expect(compareValues("1000/5A", "1000/5a")).toBe("match");
  });
  it("flags genuine mismatches", () => {
    expect(compareValues("1000/5", "100/5")).toBe("mismatch");
  });
});

const inspection = (
  id: string,
  subsection_id: string | null,
  tenants: Record<string, unknown>[],
  title = `Inspection ${id}`,
): InspectionRecord => ({ id, title, subsection_id, json_data: { tenants } });

describe("buildInspectionMeterMatches", () => {
  const subs: SubsectionNameRecord[] = [{ id: "sub-1", name: "Block A" }];

  it("keys matches by normalized serial and attaches subsection name", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", "sub-1", [{ meterSerialNumber: "mtr-001", ctSizeAndRatio: "1000/5" }])],
      subs,
    );
    const m = matches.get("MTR001");
    expect(m).toBeTruthy();
    expect(m?.subsectionName).toBe("Block A");
    expect(m?.ctSizeAndRatio).toBe("1000/5");
  });

  it("skips tenants with no serial or NA/TBC serials", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", null, [
        { ctSizeAndRatio: "x" },
        { meterSerialNumber: "NA" },
        { meterSerialNumber: "tbc" },
      ])],
      [],
    );
    expect(matches.size).toBe(0);
  });

  it("prefers a later tenant with images over an earlier one without", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", null, [
        { meterSerialNumber: "MTR-9", shopName: "no-image" },
        { meterSerialNumber: "MTR-9", shopName: "with-image", meterImage: "data:img" },
      ])],
      [],
    );
    expect(matches.get("MTR9")?.shopName).toBe("with-image");
  });

  it("keeps the first tenant when neither has images", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", null, [
        { meterSerialNumber: "MTR-9", shopName: "first" },
        { meterSerialNumber: "MTR-9", shopName: "second" },
      ])],
      [],
    );
    expect(matches.get("MTR9")?.shopName).toBe("first");
  });

  it("tolerates inspections with malformed/absent json_data", () => {
    const matches = buildInspectionMeterMatches(
      [
        { id: "i1", title: "t", subsection_id: null, json_data: null },
        { id: "i2", title: "t", subsection_id: null, json_data: "not an object" },
        { id: "i3", title: "t", subsection_id: null, json_data: { tenants: "nope" } },
      ] as InspectionRecord[],
      [],
    );
    expect(matches.size).toBe(0);
  });
});

describe("buildComparisonResults", () => {
  const asset = (over: Partial<AssetForComparison> = {}): AssetForComparison => ({
    id: "a1",
    premises_id: "SHOP-1",
    trade_as: "Acme",
    meter_serial_number: "MTR-001",
    ct_ratio: "1000/5",
    breaker_size: "100A",
    asset_category: "electrical_meter",
    ...over,
  });

  it("marks an asset verified when serial matches an inspection", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", null, [{ meterSerialNumber: "MTR001", ctSizeAndRatio: "1000/5", breakerSize: "100A" }])],
      [],
    );
    const [r] = buildComparisonResults([asset()], matches);
    expect(r.verified).toBe(true);
    expect(r.ctMatch).toBe("match");
    expect(r.breakerMatch).toBe("match");
    expect(r.hasDiscrepancy).toBe(false);
  });

  it("flags a discrepancy when CT or breaker differ", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", null, [{ meterSerialNumber: "MTR001", ctSizeAndRatio: "200/5", breakerSize: "100A" }])],
      [],
    );
    const [r] = buildComparisonResults([asset()], matches);
    expect(r.verified).toBe(true);
    expect(r.ctMatch).toBe("mismatch");
    expect(r.hasDiscrepancy).toBe(true);
  });

  it("marks an asset not verified when no inspection matches", () => {
    const [r] = buildComparisonResults([asset({ meter_serial_number: "UNKNOWN" })], new Map());
    expect(r.verified).toBe(false);
    expect(r.ctMatch).toBe("na");
  });

  it("does not match assets whose serial is NA/TBC", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", null, [{ meterSerialNumber: "MTR001" }])],
      [],
    );
    const [r] = buildComparisonResults([asset({ meter_serial_number: "NA" })], matches);
    expect(r.verified).toBe(false);
  });
});

describe("parseAssetRows (electrical-only)", () => {
  const rows: (string | number)[][] = [
    ["ELECTRICAL"],
    ["", "Premises ID", "Trade As", "Direct (D) / Current Transformer (CT)", "CT Ratio", "Meter Serial Number", "Breaker Size", "Comments"],
    ["", "SHOP-1", "Acme", "CT", "1000/5", "MTR-001", "100A", "first"],
    ["", "SHOP-2", "Beta", "1PH DIRECT", "", "MTR-002", "60A", ""],
    ["", "SHOP-3", "NoSerial", "CT", "1000/5", "", "100A", "skipme"],
    ["WATER"],
    ["", "Premises ID", "Trade As", "Meter Serial Number", "Tag", "M-Bus Gateway Index"],
    ["", "SHOP-4", "WaterCo", "WTR-001", "T1", "G1"],
  ];

  it("parses electrical rows with flexible headers", () => {
    const assets = parseAssetRows(rows);
    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({
      premises_id: "SHOP-1",
      trade_as: "Acme",
      meter_serial_number: "MTR-001",
      ct_ratio: "1000/5",
      breaker_size: "100A",
    });
  });

  it("skips electrical rows with no meter serial", () => {
    const assets = parseAssetRows(rows);
    expect(assets.find((a) => a.premises_id === "SHOP-3")).toBeUndefined();
  });

  it("ignores the WATER section entirely (electrical-only)", () => {
    const assets = parseAssetRows(rows);
    expect(assets.find((a) => a.meter_serial_number === "WTR-001")).toBeUndefined();
  });

  it("returns empty for sheets with no recognizable section/header", () => {
    expect(parseAssetRows([["random"], ["", "junk", "data"]])).toEqual([]);
  });
});
