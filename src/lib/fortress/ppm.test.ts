import { describe, it, expect } from "vitest";
import { ppmSummary, DUE_SOON_DAYS } from "./ppm";
import type { BuildingAsset } from "./types";

const a = (over: Partial<BuildingAsset> = {}): BuildingAsset =>
  ({ id: "x", site_id: "s", category: "Fire", name: "Asset", next_service_date: null, deleted_at: null, ...over } as BuildingAsset);

const withDate = (id: string, date: string | null) => a({ id, next_service_date: date });

const TODAY = "2026-06-14";

describe("ppmSummary", () => {
  it("classifies overdue / due-soon / scheduled from next_service_date", () => {
    const assets = [
      withDate("overdue", "2026-05-01"), // < today
      withDate("dueSoon", "2026-06-20"), // within 30d
      withDate("dueFar", "2026-09-01"), // > 30d
      withDate("none", null), // not scheduled
    ];
    const s = ppmSummary(assets, TODAY);
    expect(s.scheduled).toBe(3);
    expect(s.overdue).toBe(1);
    expect(s.dueSoon).toBe(1); // due-soon excludes overdue
  });

  it("on-schedule % is (scheduled - overdue) / scheduled", () => {
    const assets = [
      withDate("a", "2026-05-01"), // overdue
      withDate("b", "2026-07-01"), // ok
      withDate("c", "2026-08-01"), // ok
      withDate("d", "2026-09-01"), // ok
    ];
    expect(ppmSummary(assets, TODAY).onSchedulePct).toBe(75); // 3 of 4 not overdue
  });

  it("today itself is due-soon, not overdue", () => {
    const s = ppmSummary([withDate("t", TODAY)], TODAY);
    expect(s.overdue).toBe(0);
    expect(s.dueSoon).toBe(1);
  });

  it("respects the DUE_SOON_DAYS horizon (boundary inclusive)", () => {
    const boundary = "2026-07-14"; // today + 30
    const s = ppmSummary([withDate("b", boundary)], TODAY);
    expect(s.dueSoon).toBe(1);
    expect(DUE_SOON_DAYS).toBe(30);
  });

  it("returns 100% on-schedule and zero counts when nothing is scheduled", () => {
    const s = ppmSummary([withDate("none", null)], TODAY);
    expect(s).toMatchObject({ scheduled: 0, overdue: 0, dueSoon: 0, onSchedulePct: 100 });
  });
});
