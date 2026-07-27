import { describe, it, expect } from "vitest";
import { safeNext } from "./loginNext";

describe("safeNext", () => {
  it("allows allow-listed relative paths", () => {
    expect(safeNext("/contractor/subsections/abc?tab=upload")).toBe("/contractor/subsections/abc?tab=upload");
    expect(safeNext("/dashboard")).toBe("/dashboard");
    expect(safeNext("/sites/1/subsections/2?tab=coc-metering")).toBe("/sites/1/subsections/2?tab=coc-metering");
  });
  it("rejects absolute/protocol-relative/external", () => {
    expect(safeNext("https://evil.example")).toBeNull();
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("javascript:alert(1)")).toBeNull();
  });
  it("rejects non-allow-listed prefixes and empties", () => {
    expect(safeNext("/settings")).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext("")).toBeNull();
  });
  it("rejects prefix look-alikes", () => {
    expect(safeNext("/dashboardevil")).toBeNull();
    expect(safeNext("/contractorx/foo")).toBeNull();
  });
  it("rejects dot-segment traversal that escapes the allow-list", () => {
    expect(safeNext("/dashboard/../../settings")).toBeNull();
    expect(safeNext("/contractor/../../../settings")).toBeNull();
  });
  it("rejects backslash and encoded-slash tricks", () => {
    expect(safeNext("/\\evil.example")).toBeNull();
    expect(safeNext("%2F%2Fevil.example")).toBeNull();
  });
  it("normalizes harmless internal dot-segments to a clean allow-listed path", () => {
    expect(safeNext("/dashboard/./")).toBe("/dashboard/");
  });
});
