import { describe, expect, it } from "vitest";
import { parseAssignments, parseNewSubsections } from "./fortressTools";

const ROW = "7878c049-5914-4f4b-a637-f0aca70dc0e1";
const SUB = "19cf9d85-7eb4-4814-9a01-6376d96c71d9";

describe("parseAssignments", () => {
  it("accepts an array or the same array as a JSON string; empty input means no manual links", () => {
    const want = [{ id: ROW, subsection_id: SUB, note: "tenant schedule 29 Oct: SHOP 12 Capitec" }];
    expect(parseAssignments([{ id: ROW, subsection_id: SUB, note: "tenant schedule 29 Oct: SHOP 12 Capitec" }])).toEqual(want);
    expect(parseAssignments(JSON.stringify(want))).toEqual(want);
    expect(parseAssignments(undefined)).toEqual([]);
    expect(parseAssignments("")).toEqual([]);
  });
  it("refuses bad ids, a missing note, a row assigned twice and bad JSON", () => {
    expect(() => parseAssignments([{ id: "doc1", subsection_id: SUB, note: "x" }])).toThrow(/uuid/);
    expect(() => parseAssignments([{ id: ROW, subsection_id: "Main DB", note: "x" }])).toThrow(/subsection_id/);
    expect(() => parseAssignments([{ id: ROW, subsection_id: SUB }])).toThrow(/note/);
    expect(() => parseAssignments([{ id: ROW, subsection_id: SUB, note: "a" }, { id: ROW, subsection_id: SUB, note: "b" }])).toThrow(/twice/);
    expect(() => parseAssignments("{nope")).toThrow(/JSON/);
  });
});

describe("parseNewSubsections", () => {
  it("trims, keeps optional fields as null, and accepts a JSON string", () => {
    const got = parseNewSubsections(JSON.stringify([{ name: " SHOP 12 ", tenant_name: "CAPITEC BANK", shop_number: "12", meter_serial_number: 35724340 }, { name: "SHOP 28" }]));
    expect(got).toEqual([
      { name: "SHOP 12", tenant_name: "CAPITEC BANK", shop_number: "12", meter_serial_number: "35724340" },
      { name: "SHOP 28", tenant_name: null, shop_number: null, meter_serial_number: null },
    ]);
  });
  it("refuses a blank name and a name listed twice (case-insensitive)", () => {
    expect(() => parseNewSubsections([{ name: " " }])).toThrow(/name/);
    expect(() => parseNewSubsections([{ name: "Shop 1" }, { name: "SHOP 1" }])).toThrow(/twice/);
  });
});

import { parseRowNotes } from "./fortressTools";
describe("parseRowNotes", () => {
  it("accepts {id, note} items as an array or JSON string", () => {
    const want = [{ id: ROW, note: "duplicate of the linked row" }];
    expect(parseRowNotes(want, "reject")).toEqual(want);
    expect(parseRowNotes(JSON.stringify(want), "reject")).toEqual(want);
    expect(parseRowNotes(undefined, "reject")).toEqual([]);
  });
  it("refuses a missing note, a bad id and a row listed twice", () => {
    expect(() => parseRowNotes([{ id: ROW }], "reject")).toThrow(/note/);
    expect(() => parseRowNotes([{ id: "x", note: "n" }], "reject")).toThrow(/uuid/);
    expect(() => parseRowNotes([{ id: ROW, note: "a" }, { id: ROW, note: "b" }], "reject")).toThrow(/twice/);
  });
});
