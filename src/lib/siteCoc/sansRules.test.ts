import { describe, it, expect } from "vitest";
import { COC_SANS_RULES, ruleCodeFromHeader } from "./sansRules";

describe("COC_SANS_RULES", () => {
  it("has the 22 source rule codes in order", () => {
    expect(COC_SANS_RULES.map(r => r.code)).toEqual([
      "A1","A2","A4","A5","A6","B1","B2","B3","B4",
      "C1","C2","C3","C7","C8","C9","C10","C11","C12","C13","C14","C15",
    ]);
  });
});

describe("ruleCodeFromHeader", () => {
  it("extracts the leading code token", () => {
    expect(ruleCodeFromHeader("A1 cert no")).toBe("A1");
    expect(ruleCodeFromHeader("C15 switching")).toBe("C15");
  });
  it("returns null for non-rule headers", () => {
    expect(ruleCodeFromHeader("Verdict")).toBeNull();
  });
});
