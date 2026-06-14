import { describe, it, expect } from "vitest";
import { complianceState, isSnagOpen } from "./subsectionStatus";

describe("complianceState", () => {
  it("maps true → compliant", () => {
    expect(complianceState(true)).toBe("compliant");
  });
  it("maps false → non-compliant", () => {
    expect(complianceState(false)).toBe("non-compliant");
  });
  it("maps null/undefined → pending (not yet computed, NOT a failure)", () => {
    expect(complianceState(null)).toBe("pending");
    expect(complianceState(undefined)).toBe("pending");
  });
});

describe("isSnagOpen", () => {
  it("treats rectified/closed (any case) as terminal/closed", () => {
    expect(isSnagOpen("Rectified")).toBe(false);
    expect(isSnagOpen("closed")).toBe(false);
    expect(isSnagOpen("CLOSED")).toBe(false);
  });
  it("treats Open / In Progress / unknown as open", () => {
    expect(isSnagOpen("Open")).toBe(true);
    expect(isSnagOpen("In Progress")).toBe(true);
    expect(isSnagOpen("")).toBe(true);
    expect(isSnagOpen(null)).toBe(true);
  });
});
