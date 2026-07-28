import { describe, it, expect } from "vitest";
import { computeSubsectionVerdict } from "./subsectionCompliance";
import type { CocDoc } from "./cocHierarchy";

const TODAY = "2026-06-22";
const doc = (over: Partial<CocDoc>): CocDoc => ({
  id: "x", cocType: "Supplementary", cocNumber: null, cocIssueDate: null,
  cocExpiryDate: null, cocStatus: "Pending", fileName: "f.pdf", fileUrl: "u", ...over,
});
const base = { isCocRequired: true, openSnagCount: 0, meteringStatus: "Installed", meterSerialNumber: "123", cocDocs: [] as CocDoc[], today: TODAY };

describe("computeSubsectionVerdict", () => {
  it("clean install + valid Initial (Pass) => both compliant", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Initial", cocStatus: "Pass" })] });
    expect(v).toEqual({ installation: true, documentationRequired: true, documentation: true, overall: true });
  });
  it("clean install + missing Initial => installation ok, documentation fails", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [] });
    expect(v.installation).toBe(true);
    expect(v.documentation).toBe(false);
    expect(v.overall).toBe(false);
  });
  it("Initial Pending => documentation fails (Pass required)", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Initial", cocStatus: "Pending" })] });
    expect(v.documentation).toBe(false);
  });
  it("Initial Fail => documentation fails", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Initial", cocStatus: "Fail" })] });
    expect(v.documentation).toBe(false);
  });
  it("Initial Pass with past expiry still passes (register-truth: expiry is display-only)", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Initial", cocStatus: "Pass", cocExpiryDate: "2020-01-01" })] });
    expect(v.documentation).toBe(true);
  });
  it("only a Supplementary (no Initial) => documentation fails", () => {
    const v = computeSubsectionVerdict({ ...base, cocDocs: [doc({ cocType: "Supplementary", cocStatus: "Pass" })] });
    expect(v.documentation).toBe(false);
  });
  it("open snag => installation fails regardless of docs", () => {
    const v = computeSubsectionVerdict({ ...base, openSnagCount: 2, cocDocs: [doc({ cocType: "Initial", cocStatus: "Pass" })] });
    expect(v.installation).toBe(false);
    expect(v.overall).toBe(false);
  });
  it("metering Missing + no serial => installation fails", () => {
    const v = computeSubsectionVerdict({ ...base, meteringStatus: "Missing", meterSerialNumber: "" });
    expect(v.installation).toBe(false);
  });
  it("not-required => documentation compliant even with no docs; overall = installation", () => {
    const v = computeSubsectionVerdict({ ...base, isCocRequired: false, cocDocs: [] });
    expect(v).toEqual({ installation: true, documentationRequired: false, documentation: true, overall: true });
  });
  it("not-required + open snag => installation fails, documentation ok, overall fails", () => {
    const v = computeSubsectionVerdict({ ...base, isCocRequired: false, openSnagCount: 1 });
    expect(v.installation).toBe(false);
    expect(v.documentation).toBe(true);
    expect(v.overall).toBe(false);
  });
});
