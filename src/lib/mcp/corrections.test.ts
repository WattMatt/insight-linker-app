import { describe, expect, it } from "vitest";
import { parseCorrections } from "./fortressTools";

const ID = "7878c049-5914-4f4b-a637-f0aca70dc0e1";

describe("parseCorrections", () => {
  it("accepts an array or the same array as a JSON string, and normalises codes and results", () => {
    const want = [{ id: ID, rules: { C4: "PASS" }, verdict: undefined, reasons: "", note: "Zs reads 0,09 Ω on the original" }];
    expect(parseCorrections([{ id: ID, rules: { c4: "pass" }, note: "Zs reads 0,09 Ω on the original" }])).toEqual(want);
    expect(parseCorrections(JSON.stringify([{ id: ID, rules: { c4: "pass" }, note: "Zs reads 0,09 Ω on the original" }]))).toEqual(want);
    expect(parseCorrections("")).toEqual([]);
  });
  it("refuses a row without a note, a bad id, a bad verdict, or nothing to change", () => {
    expect(() => parseCorrections([{ id: ID, rules: { C4: "PASS" } }])).toThrow(/note/);
    expect(() => parseCorrections([{ id: "doc017", rules: { C4: "PASS" }, note: "x" }])).toThrow(/uuid/);
    expect(() => parseCorrections([{ id: ID, rules: { C4: "PASS" }, verdict: "FLAG", note: "x" }])).toThrow(/verdict/);
    expect(() => parseCorrections([{ id: ID, note: "x" }])).toThrow(/nothing to change/);
    expect(() => parseCorrections("{not json")).toThrow(/JSON/);
  });
});
