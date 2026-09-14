import { describe, it, expect } from "vitest";
import { matchAssetForSubsection, planSubsectionSerialWrites } from "./subsectionAssetMatch";

const asset = (over: Partial<{ meter_serial_number: string | null; premises_id: string | null; trade_as: string | null; breaker_size: string | null }>) => ({
  meter_serial_number: null,
  premises_id: null,
  trade_as: null,
  breaker_size: null,
  ...over,
});

describe("matchAssetForSubsection", () => {
  it("matches on normalized meter serial first (the AV key), ignoring punctuation/case", () => {
    const assets = [
      asset({ meter_serial_number: "zzz-000", premises_id: "OTHER", breaker_size: "63 A" }),
      asset({ meter_serial_number: "ab 12-34", premises_id: "YA-K99", breaker_size: "100 A" }),
    ];
    const match = matchAssetForSubsection({ name: "Kiosk 7", meter_serial_number: "AB1234" }, assets);
    expect(match?.breaker_size).toBe("100 A"); // serial matched even though name/premises differ
  });

  it("serial join wins even when a different asset would match by name", () => {
    const assets = [
      asset({ meter_serial_number: "SERIAL1", premises_id: "YA - KFC", breaker_size: "60 A" }),   // name match
      asset({ meter_serial_number: "SERIAL2", premises_id: "UNRELATED", breaker_size: "250 A" }), // serial match
    ];
    const match = matchAssetForSubsection({ name: "KFC", meter_serial_number: "serial2" }, assets);
    expect(match?.breaker_size).toBe("250 A");
  });

  it("falls back to premises_id suffix name match when the subsection has no usable serial", () => {
    const assets = [asset({ premises_id: "YA - KIOSK", breaker_size: "80 A" })];
    const match = matchAssetForSubsection({ name: "Kiosk", meter_serial_number: null }, assets);
    expect(match?.breaker_size).toBe("80 A");
  });

  it("falls back to trade_as suffix name match", () => {
    const assets = [asset({ trade_as: "YA - KFC", breaker_size: "90 A" })];
    const match = matchAssetForSubsection({ name: "KFC", meter_serial_number: "" }, assets);
    expect(match?.breaker_size).toBe("90 A");
  });

  it("treats NA/TBC/empty serials as not-a-serial and uses the name fallback", () => {
    const assets = [
      asset({ meter_serial_number: "NA", premises_id: "X", breaker_size: "1 A" }),
      asset({ premises_id: "Generator", breaker_size: "250 A" }),
    ];
    const match = matchAssetForSubsection({ name: "Generator", meter_serial_number: "n/a" }, assets);
    expect(match?.breaker_size).toBe("250 A"); // did NOT false-match the NA-serial asset
  });

  it("returns undefined when neither serial nor name matches", () => {
    const assets = [asset({ meter_serial_number: "OTHER", premises_id: "ELSEWHERE" })];
    expect(matchAssetForSubsection({ name: "Kiosk", meter_serial_number: "NOPE" }, assets)).toBeUndefined();
  });
});

// Root-cause elimination: subsections.meter_serial_number was only ever written by hand,
// while the register import wrote site_assets only. The planner decides, per subsection,
// whether the import may fill that column — and refuses whenever it would overwrite or guess.
describe("planSubsectionSerialWrites", () => {
  const sub = (over: Partial<{ id: string; name: string; meter_serial_number: string | null }> = {}) => ({
    id: "s1", name: "SHOP 019B", meter_serial_number: null, ...over,
  });

  it("fills a blank subsection from its single name-matched register row, in the register's spelling", () => {
    const assets = [
      asset({ premises_id: "TB - SHOP 019B", trade_as: "TB - MOLATELO PHARMACY", meter_serial_number: "35267842" }),
      asset({ premises_id: "TB - SHOP 001",  trade_as: "TB - DEBONAIRS",         meter_serial_number: "35753496" }),
    ];
    const plan = planSubsectionSerialWrites(assets, [sub()]);
    expect(plan.writes).toEqual([{ subsectionId: "s1", subsectionName: "SHOP 019B", serial: "35267842", premisesId: "TB - SHOP 019B" }]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.ambiguous).toEqual([]);
  });

  it("matches on trade_as too, and is case/space-insensitive like the read-side matcher", () => {
    const assets = [asset({ trade_as: "YA - KFC", meter_serial_number: "K-1" })];
    const plan = planSubsectionSerialWrites(assets, [sub({ name: "  kfc " })]);
    expect(plan.writes.map(w => w.serial)).toEqual(["K-1"]);
  });

  it("leaves an already-synced subsection alone (same serial, different punctuation)", () => {
    const assets = [asset({ premises_id: "TB - SHOP 019B", meter_serial_number: "35267842" })];
    const plan = planSubsectionSerialWrites(assets, [sub({ meter_serial_number: "3526-7842" })]);
    expect(plan.writes).toEqual([]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.alreadySynced).toBe(1);
  });

  it("NEVER overwrites a different hand-entered serial — reports it as a conflict instead", () => {
    const assets = [asset({ premises_id: "TB - SHOP 019B", meter_serial_number: "35267842" })];
    const plan = planSubsectionSerialWrites(assets, [sub({ meter_serial_number: "99999999" })]);
    expect(plan.writes).toEqual([]);
    expect(plan.conflicts).toEqual([{
      subsectionId: "s1", subsectionName: "SHOP 019B", existing: "99999999", proposed: "35267842", premisesId: "TB - SHOP 019B",
    }]);
  });

  it("treats NA / TBC on the subsection as blank", () => {
    const assets = [asset({ premises_id: "TB - SHOP 019B", meter_serial_number: "35267842" })];
    expect(planSubsectionSerialWrites(assets, [sub({ meter_serial_number: "N/A" })]).writes).toHaveLength(1);
    expect(planSubsectionSerialWrites(assets, [sub({ meter_serial_number: "tbc" })]).writes).toHaveLength(1);
  });

  it("does nothing when the matched register rows carry no usable serial", () => {
    const assets = [asset({ premises_id: "TB - SHOP 019B", meter_serial_number: "NA" }), asset({ premises_id: "TB - SHOP 019B", meter_serial_number: "" })];
    const plan = planSubsectionSerialWrites(assets, [sub()]);
    expect(plan).toEqual({ writes: [], conflicts: [], ambiguous: [], alreadySynced: 0 });
  });

  it("refuses to guess when matched register rows disagree, but tolerates duplicate rows with the same serial", () => {
    const disagree = [
      asset({ premises_id: "TB - SHOP 005",  meter_serial_number: "A-1" }),
      asset({ trade_as:    "TB - SHOP 005",  meter_serial_number: "B-2" }),
    ];
    const plan = planSubsectionSerialWrites(disagree, [sub({ name: "SHOP 005" })]);
    expect(plan.writes).toEqual([]);
    expect(plan.ambiguous).toEqual([{ subsectionId: "s1", subsectionName: "SHOP 005", serials: ["A-1", "B-2"] }]);

    const dupes = [
      asset({ premises_id: "TB - SHOP 005", meter_serial_number: "A-1" }),
      asset({ premises_id: "TB - SHOP 005", meter_serial_number: "a 1" }),
    ];
    expect(planSubsectionSerialWrites(dupes, [sub({ name: "SHOP 005" })]).writes).toHaveLength(1);
  });

  it("ignores subsections with no matching register row, and subsections with empty names", () => {
    const assets = [asset({ premises_id: "TB - SHOP 001", meter_serial_number: "1" })];
    const plan = planSubsectionSerialWrites(assets, [sub({ id: "x", name: "MAIN DB 1" }), sub({ id: "y", name: "  " })]);
    expect(plan).toEqual({ writes: [], conflicts: [], ambiguous: [], alreadySynced: 0 });
  });

  it("does not let a subsection name suffix-match a LONGER shop name (SHOP 01 must not take SHOP 001)", () => {
    const assets = [asset({ premises_id: "TB - SHOP 001", meter_serial_number: "1" })];
    expect(planSubsectionSerialWrites(assets, [sub({ name: "SHOP 01" })]).writes).toEqual([]);
  });
});
