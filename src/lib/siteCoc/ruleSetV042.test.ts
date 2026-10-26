import { describe, it, expect } from "vitest";
import { RULES, ruleInfo, RESULT_KEY } from "./ruleSetV042";
import { RESULT_WORDS } from "./signOff";

// Every rule code the strict re-verification scores (Portfolio roll-up "Rule hits", 2026-10-23).
const SCORED = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "B1", "B2", "B3", "B4",
  "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C14", "C15",
  "D1", "D2", "D3", "D4"];

describe("ruleSetV042", () => {
  it("explains every rule code the re-verification scores", () => {
    for (const code of SCORED) {
      const r = ruleInfo(code);
      expect(r, code).toBeTruthy();
      expect(r!.name.length, code).toBeGreaterThan(5);
      expect(r!.where.length, code).toBeGreaterThan(5);
      expect(r!.pass.length, code).toBeGreaterThan(5);
    }
  });
  it("is case-insensitive and returns undefined for unknown codes", () => {
    expect(ruleInfo("b2")).toBe(RULES.B2);
    expect(ruleInfo("Z9")).toBeUndefined();
  });
  it("has a key entry for every result word the screen shows", () => {
    const words = RESULT_KEY.map((k) => k.word);
    for (const w of Object.values(RESULT_WORDS)) expect(words, w).toContain(w);
  });
});
