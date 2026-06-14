import { describe, it, expect } from "vitest";
import {
  hasValidCocStatus,
  hasFailedCocStatus,
  isSubsectionCocCompliant,
  calculateCocComplianceStats,
} from "./complianceCalculations";

describe("hasValidCocStatus", () => {
  it("accepts the canonical and legacy passing verdicts", () => {
    expect(hasValidCocStatus("Pass")).toBe(true);
    expect(hasValidCocStatus("Approved")).toBe(true);
    expect(hasValidCocStatus("Valid")).toBe(true);
  });
  it("rejects failing/missing/null", () => {
    expect(hasValidCocStatus("Fail")).toBe(false);
    expect(hasValidCocStatus("Missing")).toBe(false);
    expect(hasValidCocStatus(null)).toBe(false);
    expect(hasValidCocStatus(undefined)).toBe(false);
  });
});

describe("hasFailedCocStatus", () => {
  it("matches the canonical and legacy failing verdicts", () => {
    expect(hasFailedCocStatus("Fail")).toBe(true);
    expect(hasFailedCocStatus("Failed")).toBe(true);
    expect(hasFailedCocStatus("Rejected")).toBe(true);
  });
  it("is false for passing/pending/null", () => {
    expect(hasFailedCocStatus("Pass")).toBe(false);
    expect(hasFailedCocStatus("Pending")).toBe(false);
    expect(hasFailedCocStatus(null)).toBe(false);
  });
});

describe("isSubsectionCocCompliant", () => {
  it("is compliant when COC is not required, regardless of status", () => {
    expect(isSubsectionCocCompliant({ id: "1", is_coc_required: false, coc_status: "Missing" })).toBe(true);
    expect(isSubsectionCocCompliant({ id: "1", is_coc_required: null, coc_status: null })).toBe(true);
  });
  it("requires a passing verdict when COC is required", () => {
    expect(isSubsectionCocCompliant({ id: "1", is_coc_required: true, coc_status: "Pass" })).toBe(true);
    expect(isSubsectionCocCompliant({ id: "1", is_coc_required: true, coc_status: "Missing" })).toBe(false);
    expect(isSubsectionCocCompliant({ id: "1", is_coc_required: true, coc_status: "Fail" })).toBe(false);
  });
});

describe("calculateCocComplianceStats", () => {
  it("counts required, approved, and metering, and rates them", () => {
    const stats = calculateCocComplianceStats([
      { id: "1", is_coc_required: true, coc_status: "Pass", metering_status: "Installed" },
      { id: "2", is_coc_required: true, coc_status: "Missing", meter_serial_number: "SN-1" },
      { id: "3", is_coc_required: false, coc_status: "Missing", metering_status: "Missing" },
      { id: "4", is_coc_required: true, coc_status: "Approved", metering_status: "Missing" },
    ]);
    expect(stats.totalSubsections).toBe(4);
    expect(stats.cocRequiredCount).toBe(3);
    expect(stats.cocApprovedCount).toBe(2); // Pass + Approved
    expect(stats.meteringInstalledCount).toBe(2); // Installed + serial present
    expect(stats.cocComplianceRate).toBe(67); // round(2/3*100)
  });

  it("returns 100% rates when nothing is COC-required", () => {
    const stats = calculateCocComplianceStats([
      { id: "1", is_coc_required: false, coc_status: "Missing" },
    ]);
    expect(stats.cocRequiredCount).toBe(0);
    expect(stats.cocComplianceRate).toBe(100);
    expect(stats.meteringComplianceRate).toBe(100);
  });

  it("treats meter_serial_number presence as metered (matches siteHealth.isMetered)", () => {
    const stats = calculateCocComplianceStats([
      { id: "1", is_coc_required: true, coc_status: "Pass", metering_status: "Missing", meter_serial_number: "SN-9" },
    ]);
    expect(stats.meteringInstalledCount).toBe(1);
  });
});
