import { describe, it, expect } from "vitest";
import { cocExpiryBuckets, snagAging } from "./kpiMetrics";

describe("cocExpiryBuckets", () => {
  const today = "2026-06-16";
  it("buckets Pass certs by days-to-expiry; ignores blanks and non-Pass", () => {
    const subs = [
      { coc_status: "Pass", coc_expiry_date: "2026-06-01" }, // expired
      { coc_status: "Pass", coc_expiry_date: "2026-07-01" }, // <=30
      { coc_status: "Pass", coc_expiry_date: "2026-08-20" }, // <=90
      { coc_status: "Pass", coc_expiry_date: "2027-01-01" }, // beyond 90 -> none
      { coc_status: "Pass", coc_expiry_date: null },          // ignored
      { coc_status: "Fail", coc_expiry_date: "2026-06-01" },  // not Pass -> ignored
    ];
    expect(cocExpiryBuckets(subs, today)).toEqual({ expired: 1, within30: 1, within90: 1 });
  });
});

describe("snagAging", () => {
  const today = "2026-06-16";
  it("counts high-risk open, oldest open age, and median resolve days", () => {
    const snags = [
      { status: "Open", risk_level: "Critical", created_at: "2026-05-01" }, // open 46d, high-risk
      { status: "open", risk_level: "Low", created_at: "2026-06-10" },       // open 6d
      { status: "Rectified", created_at: "2026-06-01", rectified_at: "2026-06-05" }, // 4d
      { status: "closed", created_at: "2026-06-01", rectified_at: "2026-06-11" },    // 10d
    ];
    const r = snagAging(snags, today);
    expect(r.criticalOpen).toBe(1);
    expect(r.oldestOpenDays).toBe(46);
    expect(r.medianResolveDays).toBe(7); // median of [4,10]
  });
  it("returns nulls when there are no open / no resolved snags", () => {
    expect(snagAging([], today)).toEqual({ criticalOpen: 0, oldestOpenDays: null, medianResolveDays: null });
  });
});
