import { describe, it, expect } from "vitest";
import { calculateCocComplianceStats } from "./complianceCalculations";

describe("calculateCocComplianceStats metering rate", () => {
  it("cannot exceed 100% when metered subsections outnumber the COC-required ones", () => {
    const stats = calculateCocComplianceStats([
      { id: "1", is_coc_required: true, coc_status: "Pass", metering_status: "Installed" },
      { id: "2", is_coc_required: false, coc_status: null, metering_status: "Installed" },
      { id: "3", is_coc_required: false, coc_status: null, meter_serial_number: "SN-7" },
    ]);
    expect(stats.cocRequiredCount).toBe(1);
    expect(stats.meteringInstalledCount).toBe(3); // site-wide count is unchanged
    expect(stats.meteringComplianceRate).toBe(100);
    expect(stats.meteringComplianceRate).toBeLessThanOrEqual(100);
  });

  it("rates the COC-required scope only", () => {
    const stats = calculateCocComplianceStats([
      { id: "1", is_coc_required: true, coc_status: "Pass", metering_status: "Installed" },
      { id: "2", is_coc_required: true, coc_status: "Pass", metering_status: "Missing" },
      { id: "3", is_coc_required: true, coc_status: "Pass", meter_serial_number: "SN-2" },
      { id: "4", is_coc_required: false, coc_status: null, metering_status: "Installed" },
    ]);
    expect(stats.meteringInstalledCount).toBe(3);
    expect(stats.meteringComplianceRate).toBe(67); // 2 of the 3 COC-required are metered
  });

  it("an unmetered COC-required subsection drags the rate below 100", () => {
    const stats = calculateCocComplianceStats([
      { id: "1", is_coc_required: true, coc_status: "Pass", metering_status: "Missing" },
    ]);
    expect(stats.meteringComplianceRate).toBe(0);
  });
});
