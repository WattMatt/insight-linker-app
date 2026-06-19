import { describe, it, expect } from "vitest";
import { assignedSubsectionIds, unassignedCocRequired, liveMatchCounts } from "./coverage";

describe("liveMatchCounts", () => {
  it("counts matched (has subsection) vs unmatched from the current rows", () => {
    expect(liveMatchCounts([{ subsection_id: "a" }, { subsection_id: null }, { subsection_id: "b" }]))
      .toEqual({ matched: 2, unmatched: 1 });
  });
  it("handles an empty schedule", () => {
    expect(liveMatchCounts([])).toEqual({ matched: 0, unmatched: 0 });
  });
});

describe("assignedSubsectionIds", () => {
  it("collects non-null subsection ids", () => {
    const s = assignedSubsectionIds([{ subsection_id: "a" }, { subsection_id: null }, { subsection_id: "b" }]);
    expect([...s].sort()).toEqual(["a", "b"]);
  });
});

describe("unassignedCocRequired", () => {
  const subs = [
    { id: "a", name: "ACK", is_coc_required: true },
    { id: "b", name: "LV ROOM", is_coc_required: true },
    { id: "c", name: "STORE", is_coc_required: false },
  ];
  it("returns COC-required subsections not in the assigned set", () => {
    const out = unassignedCocRequired(subs, new Set(["a"]));
    expect(out.map(s => s.id)).toEqual(["b"]);
  });
  it("excludes non-COC-required even when unassigned", () => {
    const out = unassignedCocRequired(subs, new Set());
    expect(out.map(s => s.id)).toEqual(["a", "b"]);
  });
});
