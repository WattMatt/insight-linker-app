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
});
