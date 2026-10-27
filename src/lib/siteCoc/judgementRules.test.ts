import { describe, it, expect } from "vitest";
import { judgementRules, PRINTED_CORRECT_UNTICKED } from "./judgementRules";

// Same cases as public.coc_judgement_rules() — the two must stay identical.
describe("judgementRules", () => {
  it("flags C5, accepts C1/C2 asserted ticks, treats printed-correct-unticked as asserted", () => {
    expect(judgementRules([
      { rule: "C5", res: "FAIL", note: "Zn 0.18 Ω; exceeds earth loop 0.12 Ω" },
      { rule: "C1", res: "ASSERTED", note: 'tester ticked "Compliant"; no Ω value' },
      { rule: "C2", res: "ASSERTED" },
      { rule: "C15", res: "FAIL", note: PRINTED_CORRECT_UNTICKED },
    ])).toEqual({ C5: "FLAG", C1: "PASS", C2: "PASS", C15: "ASSERTED" });
  });

  it("leaves every other result as delivered", () => {
    expect(judgementRules([
      { rule: "C8", res: "FAIL", note: "0 MΩ recorded" },
      { rule: "C14", res: "FAIL", note: "phase rotation: not recorded (blank)" },
      { rule: "C9", res: "CV" },
      { rule: "C3", res: "N/A" },
      { rule: "C4", res: "PASS" },
      { rule: "C12", res: "ASSERTED" },
      { rule: "C5", res: "PASS" },
    ])).toEqual({ C8: "FAIL", C14: "FAIL", C9: "CV", C3: "N/A", C4: "PASS", C12: "ASSERTED", C5: "PASS" });
  });

  it("handles empty input", () => {
    expect(judgementRules(null)).toEqual({});
    expect(judgementRules([])).toEqual({});
  });
});
