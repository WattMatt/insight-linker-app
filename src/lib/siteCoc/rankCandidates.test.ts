import { describe, it, expect } from "vitest";
import { rankSubsectionCandidates } from "./rankCandidates";

const subs = [
  { id: "a", name: "Ackermans", tenant_name: "Ackermans Store" },
  { id: "b", name: "PEP", tenant_name: null },
  { id: "c", name: "Mr Price", tenant_name: "Mr Price Home" },
];

describe("rankSubsectionCandidates", () => {
  it("ranks an exact/near match first with a high score", () => {
    const out = rankSubsectionCandidates("ACKERMANS", subs, 3);
    expect(out[0].id).toBe("a");
    expect(out[0].score).toBeGreaterThan(0.8);
  });

  it("ranks a near-miss (extra word) above unrelated names", () => {
    const out = rankSubsectionCandidates("MR PRICE", subs, 3);
    expect(out[0].id).toBe("c");
  });

  it("respects topN and returns sorted descending", () => {
    const out = rankSubsectionCandidates("ACKERMANS", subs, 2);
    expect(out).toHaveLength(2);
    expect(out[0].score).toBeGreaterThanOrEqual(out[1].score);
  });

  it("returns [] for an empty query", () => {
    expect(rankSubsectionCandidates("", subs, 3)).toEqual([]);
  });
});
