import { describe, it, expect } from "vitest";
import { complianceState, isSnagOpen, snagStatusBucket } from "./subsectionStatus";

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

describe("snagStatusBucket", () => {
  it("buckets terminal statuses as closed (any case, incl. lowercase rectified)", () => {
    expect(snagStatusBucket("Closed")).toBe("closed");
    expect(snagStatusBucket("closed")).toBe("closed");
    expect(snagStatusBucket("Rectified")).toBe("closed");
    expect(snagStatusBucket("rectified")).toBe("closed");
  });
  it("buckets in-progress variants as inProgress", () => {
    expect(snagStatusBucket("In Progress")).toBe("inProgress");
    expect(snagStatusBucket("in_progress")).toBe("inProgress");
  });
  it("buckets Open / unknown / empty as open", () => {
    expect(snagStatusBucket("Open")).toBe("open");
    expect(snagStatusBucket("whatever")).toBe("open");
    expect(snagStatusBucket("")).toBe("open");
    expect(snagStatusBucket(null)).toBe("open");
  });
});
