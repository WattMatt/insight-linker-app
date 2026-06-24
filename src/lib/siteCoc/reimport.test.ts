import { describe, it, expect } from "vitest";
import { applyPriorMatches } from "./reimport";

type Row = { shop_no_raw: string; subsection_id: string | null; match_status: "matched" | "unmatched" | "manual" };
const row = (shop: string, sub: string | null): Row =>
  ({ shop_no_raw: shop, subsection_id: sub, match_status: sub ? "matched" : "unmatched" });

describe("applyPriorMatches", () => {
  const valid = new Set(["sub1", "sub2", "kept"]);

  it("carries a prior resolution onto a now-unmatched row (normalised shop)", () => {
    const prior = new Map([["SHOP 001", { id: "sub1", status: "matched" as const }]]);
    const out = applyPriorMatches([row("SHOP-001", null)], prior, valid);
    expect(out[0]).toMatchObject({ subsection_id: "sub1", match_status: "matched" });
  });

  it("preserves a prior MANUAL resolution's status so it stays protected", () => {
    const prior = new Map([["SHOP 001", { id: "sub1", status: "manual" as const }]]);
    const out = applyPriorMatches([row("SHOP 001", null)], prior, valid);
    expect(out[0]).toMatchObject({ subsection_id: "sub1", match_status: "manual" });
  });

  it("does not overwrite a fresh auto-match (auto wins)", () => {
    const prior = new Map([["SHOP 001", { id: "sub1", status: "manual" as const }]]);
    const out = applyPriorMatches([row("SHOP 001", "sub2")], prior, valid);
    expect(out[0].subsection_id).toBe("sub2");
  });

  it("ignores a prior id whose subsection no longer exists", () => {
    const prior = new Map([["SHOP 001", { id: "deleted", status: "manual" as const }]]);
    const out = applyPriorMatches([row("SHOP 001", null)], prior, valid);
    expect(out[0]).toMatchObject({ subsection_id: null, match_status: "unmatched" });
  });

  it("leaves rows with no prior entry untouched", () => {
    const out = applyPriorMatches([row("SHOP 999", null)], new Map(), valid);
    expect(out[0].subsection_id).toBeNull();
  });
});
