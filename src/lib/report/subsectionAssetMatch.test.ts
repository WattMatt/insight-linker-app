import { describe, it, expect } from "vitest";
import { matchAssetForSubsection } from "./subsectionAssetMatch";

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
