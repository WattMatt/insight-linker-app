import { describe, it, expect } from "vitest";
import { templateSupportsTenants } from "./templateTenants";

// The Tenants tab/section is for the Electrical Main Board (EMB) inspection only.
// Every other template type must NOT collect or render tenant data.
describe("templateSupportsTenants", () => {
  it("is true ONLY for the EMB (Electrical Main Board) template", () => {
    expect(templateSupportsTenants({ name: "Electrical Main Board (EMB) Inspection" })).toBe(true);
  });

  it("is false for every non-EMB template currently in prod", () => {
    const nonEmb = [
      "Electrical Meter Inspection Report",
      "Site Summary Report",
      "Generator Factory Acceptance Test",
      "Generator Installation Inspection",
      "Factory Acceptance Test (FAT) Inspection Report",
      "Line Shop Handover",
      "Low Voltage Line Shop Board Audit",
      "Miniature Substation Inspection Report",
      "Miniature Substation Pre-FAT and Post-FAT",
      "RMU Snagging & Compliance Report",
      "Standard Progress Report",
      "Site Drawing Inspection",
      "Standalone Solar PV Installation Inspection",
    ];
    for (const name of nonEmb) {
      expect(templateSupportsTenants({ name }), `${name} must not support tenants`).toBe(false);
    }
  });

  it("matches the EMB name case-insensitively", () => {
    expect(templateSupportsTenants({ name: "electrical MAIN BOARD inspection" })).toBe(true);
  });

  it("is false for null/undefined/empty names", () => {
    expect(templateSupportsTenants({ name: null })).toBe(false);
    expect(templateSupportsTenants({ name: undefined })).toBe(false);
    expect(templateSupportsTenants({ name: "" })).toBe(false);
    expect(templateSupportsTenants(null)).toBe(false);
    expect(templateSupportsTenants(undefined)).toBe(false);
  });
});
