import { describe, it, expect } from "vitest";
import {
  normalizeMeterSerial,
  compareValues,
  buildInspectionMeterMatches,
  buildComparisonResults,
  parseAssetRows,
  meterKey,
  premisesShopCode,
  meterRowHeading,
  siteShopCode,
  summarizeResults,
  buildInspectionMeterRows,
  findUnregisteredMeters,
  type SiteShop,
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

  // Thembi Mall: the register writes "N/A" (with a slash). The old normalizer kept the
  // slash, so "N/A" never matched the bare "NA" sentinel and was compared as a real value —
  // producing a green "match" tick against another "N/A", and a false "mismatch" against a
  // genuine ratio.
  it("treats N/A in any punctuation as missing data, not a value", () => {
    expect(compareValues("N/A", "N/A")).toBe("na");
    expect(compareValues("N/A", "n/a")).toBe("na");
    expect(compareValues("N.A.", "100/5")).toBe("na");
    expect(compareValues("N/A", "150/5A")).toBe("na");
    expect(compareValues("150/5A", "n/a")).toBe("na");
  });

  // Field techs type "600:5A"; the register exports "600/5A". Same CT ratio, and the old
  // normalizer stripped the colon but kept the slash, so they never compared equal.
  it("treats ':' and '/' as the same ratio separator", () => {
    expect(compareValues("600:5A", "600/5A")).toBe("match");
    expect(compareValues("250:5A", "250/5A")).toBe("match");
    expect(compareValues("150:5A", "150:5A")).toBe("match");
    expect(compareValues("1000 : 5", "1000/5")).toBe("match");
  });

  it("still flags genuinely different ratios and breakers", () => {
    expect(compareValues("600:5A", "300/5A")).toBe("mismatch");
    expect(compareValues("32A", "80A")).toBe("mismatch");
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

  // The register already carries the previous serial for swapped meters, but matching
  // ignored it — so every replaced meter read "Not Verified" despite the inspection
  // being on file under the old number.
  it("falls back to the previous serial when the current one has no inspection", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", null, [{ meterSerialNumber: "OLD-999", ctSizeAndRatio: "1000/5" }])],
      [],
    );
    const [r] = buildComparisonResults(
      [asset({ meter_serial_number: "NEW-111", old_meter_serial_number: "OLD-999" })],
      matches,
    );
    expect(r.verified).toBe(true);
    expect(r.matchedOnOldSerial).toBe(true);
  });

  it("prefers the current serial and does not flag an old-serial match when it hits", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", null, [
        { meterSerialNumber: "NEW-111", shopName: "current" },
        { meterSerialNumber: "OLD-999", shopName: "previous" },
      ])],
      [],
    );
    const [r] = buildComparisonResults(
      [asset({ meter_serial_number: "NEW-111", old_meter_serial_number: "OLD-999" })],
      matches,
    );
    expect(r.verified).toBe(true);
    expect(r.matchedOnOldSerial).toBe(false);
    expect(r.inspectionMatch?.shopName).toBe("current");
  });

  it("ignores a sentinel or absent previous serial", () => {
    const matches = buildInspectionMeterMatches(
      [inspection("i1", null, [{ meterSerialNumber: "MTR001" }])],
      [],
    );
    const [a] = buildComparisonResults(
      [asset({ meter_serial_number: "UNKNOWN", old_meter_serial_number: "NA" })],
      matches,
    );
    expect(a.verified).toBe(false);
    const [b] = buildComparisonResults([asset({ meter_serial_number: "UNKNOWN" })], matches);
    expect(b.verified).toBe(false);
    expect(b.matchedOnOldSerial).toBe(false);
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

// ---------------------------------------------------------------------------------------------
// Shop identity. Fixture is the real 204 Oxford data (2026-09-23): the register's serials for
// the Main DB C sub-boards are swapped, the Main DB C inspection and the shop subsections agree
// with each other. The site is the truth.
// ---------------------------------------------------------------------------------------------

describe("compareValues — breaker pole designation", () => {
  it("ignores a pole count only one side records", () => {
    expect(compareValues("40A", "40A DP")).toBe("match");
    expect(compareValues("63A TP", "63A")).toBe("match");
  });
  it("still flags different ratings or different pole counts", () => {
    expect(compareValues("40A", "63A DP")).toBe("mismatch");
    expect(compareValues("80A", "60A SP")).toBe("mismatch");
    expect(compareValues("63A SP", "63A TP")).toBe("mismatch");
  });
});

describe("shop numbers and meter keys", () => {
  it("reads the shop number from a register premises id", () => {
    expect(premisesShopCode("OX - G01-G06")).toBe("G01G06");
    expect(premisesShopCode("OX - DB - D")).toBe("DBD");
    expect(premisesShopCode("OX - GF 07")).toBe("GF07");
  });

  it("reads a shop number from a subsection name only when the name is one", () => {
    expect(siteShopCode({ name: "SHOP G01-G06" })).toBe("G01G06");
    expect(siteShopCode({ name: "SHOP G13A - G15" })).toBe("G13AG15");
    expect(siteShopCode({ name: "SHOP G16 & G17" })).toBe("G16G17");
    expect(siteShopCode({ name: "Shop S101" })).toBe("S101");
    expect(siteShopCode({ name: "N202A-201A" })).toBe("N202A201A");
    expect(siteShopCode({ name: "Main DB F1 1st Floor North" })).toBe("");
    expect(siteShopCode({ name: "MED SUITE 1" })).toBe("");
    expect(siteShopCode({ name: "1ST FLOOR SOUTH" })).toBe("");
  });

  it("lets an explicit shop number override the name", () => {
    expect(siteShopCode({ name: "Main DB F1 1st Floor North", shop_number: "DB-F1" })).toBe("DBF1");
    expect(siteShopCode({ name: "MED SUITE 1", shop_number: "Medical Suite 01" })).toBe("MEDICALSUITE01");
  });

  it("heads a meter row 'shop number – name', printing a repeated name once", () => {
    expect(meterRowHeading("Shop 1", "Shoprite")).toBe("Shop 1 – Shoprite");
    expect(meterRowHeading("G01-G06", "TurnTender")).toBe("G01-G06 – TurnTender");
    expect(meterRowHeading("Turn Tender", "TurnTender")).toBe("TurnTender");
    expect(meterRowHeading("", "Misfit")).toBe("Misfit");
    expect(meterRowHeading("N205", "")).toBe("N205");
  });

  it("keys a serial on its digit run so field annotations still match", () => {
    expect(meterKey("35727818 METER OFF")).toBe("35727818");
    expect(meterKey("34445064 TO BE REPLACED")).toBe("34445064");
    expect(meterKey("N/A")).toBe("");
    expect(meterKey("")).toBe("");
  });
});

describe("buildComparisonResults — the site is the truth (204 Oxford, Main DB C)", () => {
  const dbc = (id: string, shopName: string, serial: string, ct: string, breaker: string, shopNumber = shopName) => ({
    id, shopName, shopNumber, meterSerialNumber: serial, ctSizeAndRatio: ct, breakerSize: breaker, meterImage: `m-${id}`,
  });
  const inspections: InspectionRecord[] = [
    {
      id: "i-dbc",
      title: "EMB",
      subsection_id: "s-dbc",
      json_data: {
        tenants: [
          dbc("t5", "TurnTender", "35753503", "250/5A", "250A", "Turn Tender"),
          dbc("t6", "DB D (Sub BB)", "35753506", "250/5A", "250A"),
          dbc("t7", "Trabella", "35753504", "200/5A", "250A"),
          dbc("t12", "DB F 3A", "35753143", "250/5A", "250A"),
          dbc("t13", "DB Sub F1", "35753144", "250/5A", "250A"),
          dbc("t2", "Misfit", "34445082", "N/A", "63A"),
        ],
      },
    },
  ];
  const subs: SubsectionNameRecord[] = [{ id: "s-dbc", name: "Main DB C" }];
  const shops: SiteShop[] = [
    { id: "s1", name: "SHOP G01-G06", tenant_name: "TURN 'N TENDER", meter_serial_number: "35753503" },
    { id: "s2", name: "SHOP N105", tenant_name: "TRABELLA PIZZERIA", meter_serial_number: "35753504" },
    { id: "s3", name: "SHOP F03", tenant_name: "MISSFIT BOXING", meter_serial_number: "34445082" },
    { id: "s4", name: "Main DB F1 1st Floor North", tenant_name: "Main DB", meter_serial_number: "35753144" },
  ];
  const reg = (id: string, premises_id: string, serial: string, ct: string, breaker: string): AssetForComparison => ({
    id, premises_id, trade_as: null, meter_serial_number: serial, ct_ratio: ct, breaker_size: breaker, asset_category: "electrical_meter",
  });
  const register = [
    reg("a-tt", "OX - G01-G06", "35753143", "250/5A", "250A"),
    reg("a-n105", "OX - N105", "35753144", "150/5A", "160A"),
    reg("a-f03", "OX - F03", "34445190", "N/A", "63A"),
    reg("a-esc", "OX - ESCELATOR UP", "34445082", "N/A", "30A"),
    reg("a-dbf1", "OX - DB-F1", "35753503", "400/5A", "400A"),
    reg("a-dbd", "OX - DB - D", "35753506", "200/5A", "200A"),
  ];
  const matches = buildInspectionMeterMatches(inspections, subs);
  const run = (s: SiteShop[] = shops) => new Map(buildComparisonResults(register, matches, s).map((r) => [r.asset.id, r]));

  it("no longer verifies Turn 'n Tender against the DB F3A meter", () => {
    const tt = run().get("a-tt")!;
    expect(tt.linkedBy).toBe("shop");
    expect(tt.status).toBe("mismatch");
    expect(tt.serialMatch).toBe("mismatch");
    expect(tt.siteSerial).toBe("35753503");
    expect(tt.inspectionMatch?.shopName).toBe("TurnTender");
    expect(tt.inspectionMatch?.tenantId).toBe("t5");
  });

  it("reports the site serial for a shop whose register serial is wrong", () => {
    const n105 = run().get("a-n105")!;
    expect(n105.siteSerial).toBe("35753504");
    expect(n105.inspectionMatch?.shopName).toBe("Trabella");
    expect(n105.ctMatch).toBe("mismatch"); // 150/5A registered, 200/5A on site
  });

  it("marks a register serial that the site places on another shop as a wrong meter", () => {
    const esc = run().get("a-esc")!;
    expect(esc.status).toBe("wrong_meter");
    expect(esc.verified).toBe(true);
    expect(esc.belongsTo?.premisesId).toBe("OX - F03");
    expect(esc.ctMatch).toBe("na");
    expect(esc.breakerMatch).toBe("na"); // the 63A belongs to Missfit, not the escalator

    const dbf1 = run().get("a-dbf1")!;
    expect(dbf1.status).toBe("wrong_meter");
    expect(dbf1.belongsTo?.premisesId).toBe("OX - G01-G06");
  });

  it("links a board to its register row once someone gives the subsection a shop number", () => {
    const withShopNumber = shops.map((s) => (s.id === "s4" ? { ...s, shop_number: "DB-F1" } : s));
    const dbf1 = run(withShopNumber).get("a-dbf1")!;
    expect(dbf1.linkedBy).toBe("shop");
    expect(dbf1.siteSerial).toBe("35753144");
    expect(dbf1.inspectionMatch?.shopName).toBe("DB Sub F1");
    expect(dbf1.breakerMatch).toBe("mismatch"); // 400A registered, 250A on site
    // …and Trabella's register serial 35753144 now reads as DB-F1's meter
    expect(run(withShopNumber).get("a-n105")!.status).toBe("mismatch");
  });

  it("still verifies by serial where nothing on site contradicts it", () => {
    const dbd = run().get("a-dbd")!;
    expect(dbd.linkedBy).toBe("serial");
    expect(dbd.serialMatch).toBe("match");
    expect(dbd.status).toBe("mismatch"); // 200/5A vs 250/5A is a real value mismatch
  });

  it("links through a board meter row's shop number when it is a real number", () => {
    const rows = buildInspectionMeterMatches(
      [{ id: "i", title: "EMB", subsection_id: null, json_data: { tenants: [{ id: "x", shopName: "Crazy Store", shopNumber: "L03A", meterSerialNumber: "36402545" }] } }],
      [],
    );
    const res = new Map(
      buildComparisonResults(
        [reg("l03", "OX - L03", "36402545", "N/A", ""), reg("l03a", "OX - L03A", "34445208", "N/A", "80A")],
        rows,
      ).map((r) => [r.asset.id, r]),
    );
    expect(res.get("l03a")!.siteSerial).toBe("36402545");
    expect(res.get("l03a")!.serialMatch).toBe("mismatch");
    expect(res.get("l03")!.status).toBe("wrong_meter");
  });

  it("resolves a duplicated shop number by serial", () => {
    const dupShops: SiteShop[] = [
      { id: "g9a", name: "SHOP G09", tenant_name: "NOT IN USE", meter_serial_number: "34445163" },
      { id: "g9b", name: "SHOP G09", tenant_name: "SCAPE GOAT", meter_serial_number: "34617963" },
    ];
    const res = buildComparisonResults(
      [reg("p1", "OX - G09", "34617963", "N/A", "80A"), reg("p2", "OX - G09", "34445163", "N/A", "63A")],
      new Map(),
      dupShops,
    );
    expect(res.map((r) => r.siteShop?.id)).toEqual(["g9b", "g9a"]);
    expect(res.every((r) => r.status === "verified")).toBe(true);
  });

  it("counts every status once, and lists meters on site that are not in the register", () => {
    const results = buildComparisonResults(register, matches, shops);
    const stats = summarizeResults(results);
    expect(stats.total).toBe(6);
    expect(stats.wrongMeter).toBe(2);
    expect(stats.verifiedNoDiscrepancy + stats.discrepancies + stats.previousMeter + stats.unverified).toBe(6);

    const rows = buildInspectionMeterRows(inspections, subs);
    const missing = findUnregisteredMeters(rows, results).map((r) => r.shopName);
    // Both sub-board meters appear in the register only as OTHER premises' (wrong) serials —
    // 35753143 as Turn 'n Tender's, 35753144 as Trabella's — so neither has a register row tied
    // to it. DB D's meter is tied to OX - DB - D and is not listed.
    expect(missing).toEqual(["DB F 3A", "DB Sub F1"]);
  });
});
