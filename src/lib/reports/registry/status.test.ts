import { describe, it, expect } from "vitest";
import { reportStatus, latestTimestamp } from "./status";

const report = (createdAt: string, linked = true) => ({ id: "r1", createdAt, linked });

describe("reportStatus", () => {
  it("is missing when no report exists", () => {
    expect(reportStatus({ existing: null, sourceUpdatedAt: "2026-10-01T00:00:00Z" })).toBe("missing");
  });

  it("is out of date for a legacy unlinked report, however recent", () => {
    expect(reportStatus({ existing: report("2026-10-05T00:00:00Z", false), sourceUpdatedAt: "2026-01-01T00:00:00Z" })).toBe("out-of-date");
  });

  it("is out of date when an input changed after the report was generated", () => {
    expect(reportStatus({ existing: report("2026-10-01T00:00:00Z"), sourceUpdatedAt: "2026-10-02T00:00:00Z" })).toBe("out-of-date");
  });

  it("is current when the report is newer than every input", () => {
    expect(reportStatus({ existing: report("2026-10-03T00:00:00Z"), sourceUpdatedAt: "2026-10-02T00:00:00Z" })).toBe("current");
  });

  it("is current when there is no source timestamp", () => {
    expect(reportStatus({ existing: report("2026-10-03T00:00:00Z"), sourceUpdatedAt: null })).toBe("current");
  });

  it("compares instants, not strings, across timezone offsets", () => {
    // 10:00+02:00 is 08:00Z — earlier than the 09:00Z report.
    expect(reportStatus({ existing: report("2026-10-03T09:00:00Z"), sourceUpdatedAt: "2026-10-03T10:00:00+02:00" })).toBe("current");
  });
});

describe("latestTimestamp", () => {
  it("returns the latest instant and ignores empty values", () => {
    expect(latestTimestamp(null, "2026-10-01T00:00:00Z", undefined, "2026-10-03T00:00:00Z", "2026-10-02T00:00:00Z")).toBe("2026-10-03T00:00:00Z");
  });
  it("returns null when nothing parses", () => {
    expect(latestTimestamp(null, undefined, "")).toBeNull();
  });
});
