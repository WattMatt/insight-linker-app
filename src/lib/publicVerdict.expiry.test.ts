import { describe, it, expect } from "vitest";
import { presentVerdict, type PublicVerdict } from "./publicVerdict";

const pass: PublicVerdict = {
  coc_required: true, status: "Pass", cert_number: "C-123",
  issue_date: "2024-03-14", expiry_date: null,
};

// Local-midnight construction so the calendar-day maths is asserted the same way in
// every machine timezone.
const today = new Date(2026, 6, 27); // 2026-07-27

describe("presentVerdict expiry window", () => {
  it("an already-expired Pass never renders as Compliant", () => {
    const p = presentVerdict({ ...pass, expiry_date: "2026-07-26" }, today);
    expect(p.headline).not.toBe("Compliant");
    expect(p.kind).not.toBe("pass");
    expect(p.kind).not.toBe("pass-expiring");
    expect(p.headline).toBe("COC expired");
    expect(p.sub).toContain("lapsed");
  });

  it("long expired is still expired, not expiring", () => {
    expect(presentVerdict({ ...pass, expiry_date: "2020-01-01" }, today).headline).toBe("COC expired");
  });

  it("expiring today is still compliant — the certificate is valid on its expiry date", () => {
    const p = presentVerdict({ ...pass, expiry_date: "2026-07-27" }, today);
    expect(p.kind).toBe("pass-expiring");
    expect(p.headline).toBe("Compliant");
  });

  it("29 days out hints, 30 days out does not", () => {
    expect(presentVerdict({ ...pass, expiry_date: "2026-08-25" }, today).kind).toBe("pass-expiring");
    expect(presentVerdict({ ...pass, expiry_date: "2026-08-26" }, today).kind).toBe("pass");
  });

  it("the boundary does not move with the time of day", () => {
    const morning = new Date(2026, 6, 27, 0, 5);
    const evening = new Date(2026, 6, 27, 23, 55);
    for (const now of [morning, evening]) {
      expect(presentVerdict({ ...pass, expiry_date: "2026-07-26" }, now).headline).toBe("COC expired");
      expect(presentVerdict({ ...pass, expiry_date: "2026-08-25" }, now).kind).toBe("pass-expiring");
      expect(presentVerdict({ ...pass, expiry_date: "2026-08-26" }, now).kind).toBe("pass");
    }
  });

  it("an unparseable expiry adds no hint and never claims expiry", () => {
    const p = presentVerdict({ ...pass, expiry_date: "not-a-date" }, today);
    expect(p.kind).toBe("pass");
    expect(p.sub).toBeNull();
  });

  it("expiry is display-only: an expired Fail is still Not compliant, an expired Pending still pending", () => {
    expect(presentVerdict({ ...pass, status: "Fail", expiry_date: "2020-01-01" }, today).kind).toBe("fail");
    expect(presentVerdict({ ...pass, status: "Pending", expiry_date: "2020-01-01" }, today).kind).toBe("pending");
  });
});
