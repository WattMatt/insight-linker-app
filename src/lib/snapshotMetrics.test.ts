import { describe, it, expect } from "vitest";
import { toSnapshotRow } from "./snapshotMetrics";

describe("toSnapshotRow", () => {
  it("maps a summary + readiness + score + open snags to a snapshot row", () => {
    const row = toSnapshotRow({
      siteId: "s1",
      capturedAt: "2026-06-16",
      summary: { completionPct: 63, outstandingCount: 31, blockingCount: 4 } as any,
      readiness: { ready: 12, total: 18 } as any,
      healthScore: 71,
      openSnags: 14,
    });
    expect(row).toEqual({
      site_id: "s1",
      captured_at: "2026-06-16",
      health_score: 71,
      completion_pct: 63,
      outstanding_count: 31,
      blocking_count: 4,
      open_snags: 14,
      ready_count: 12,
      total_subsections: 18,
    });
  });
});
