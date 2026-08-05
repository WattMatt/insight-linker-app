import { describe, it, expect } from "vitest";
import { presentVerdict, type PublicVerdict } from "./publicVerdict";

const base: PublicVerdict = {
  coc_required: true, status: "Pass", cert_number: "C-123",
  issue_date: "2026-03-14", expiry_date: null,
};
const today = new Date("2026-07-27T00:00:00Z");

describe("presentVerdict", () => {
  it("returns none when verdict is null (not required)", () => {
    expect(presentVerdict(null, today).kind).toBe("none");
  });
  it("Pass → pass with cert details", () => {
    const p = presentVerdict(base, today);
    expect(p.kind).toBe("pass");
    expect(p.headline).toBe("Compliant");
  });
  it("Pass expiring within 30 days → pass-expiring hint (display-only)", () => {
    const p = presentVerdict({ ...base, expiry_date: "2026-08-10" }, today);
    expect(p.kind).toBe("pass-expiring");
    expect(p.sub).toContain("re-verification");
  });
  it("Pass expiring beyond 30 days → plain pass", () => {
    expect(presentVerdict({ ...base, expiry_date: "2026-09-27" }, today).kind).toBe("pass");
  });
  it("Fail → neutral copy, no raw reasons", () => {
    const p = presentVerdict({ ...base, status: "Fail" }, today);
    expect(p.kind).toBe("fail");
    expect(p.headline).toBe("Not compliant");
    expect(p.sub).toContain("remedial work in progress");
  });
  it("Pending → pending", () => {
    expect(presentVerdict({ ...base, status: "Pending" }, today).kind).toBe("pending");
  });
  it("Missing → missing", () => {
    expect(presentVerdict({ ...base, status: "Missing" }, today).kind).toBe("missing");
  });
  it("N/A or not required → none", () => {
    expect(presentVerdict({ ...base, status: "N/A" }, today).kind).toBe("none");
    expect(presentVerdict({ ...base, coc_required: false }, today).kind).toBe("none");
  });
  it("status synonyms map (Approved→pass, Rejected→fail)", () => {
    expect(presentVerdict({ ...base, status: "Approved" }, today).kind).toBe("pass");
    expect(presentVerdict({ ...base, status: "Rejected" }, today).kind).toBe("fail");
  });
});
