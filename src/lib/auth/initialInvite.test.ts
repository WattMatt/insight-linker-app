import { describe, it, expect } from "vitest";
import { generateInitialPassword, INITIAL_PASSWORD_POLICY } from "./initialInvite";

const { lower, upper, digits, symbols } = INITIAL_PASSWORD_POLICY;

describe("generateInitialPassword", () => {
  it("produces a password of the policy length", () => {
    expect(generateInitialPassword()).toHaveLength(INITIAL_PASSWORD_POLICY.length);
  });

  it("always includes at least one of each character class", () => {
    // Run many times — a class-omission bug would surface probabilistically.
    for (let i = 0; i < 500; i++) {
      const pw = generateInitialPassword();
      expect([...pw].some((c) => lower.includes(c)), `lowercase in ${pw}`).toBe(true);
      expect([...pw].some((c) => upper.includes(c)), `uppercase in ${pw}`).toBe(true);
      expect([...pw].some((c) => digits.includes(c)), `digit in ${pw}`).toBe(true);
      expect([...pw].some((c) => symbols.includes(c)), `symbol in ${pw}`).toBe(true);
    }
  });

  it("only uses characters from the approved (unambiguous) alphabet", () => {
    const allowed = new Set([...(lower + upper + digits + symbols)]);
    for (let i = 0; i < 200; i++) {
      for (const ch of generateInitialPassword()) {
        expect(allowed.has(ch), `unexpected char '${ch}'`).toBe(true);
      }
    }
    // Ambiguous characters must never appear.
    for (const ambiguous of ["0", "O", "1", "l", "I"]) {
      expect(allowed.has(ambiguous), `ambiguous '${ambiguous}' excluded`).toBe(false);
    }
  });

  it("does not repeat the same password across calls (high entropy)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateInitialPassword());
    // 16 chars over a ~70-char alphabet — collisions in 1000 draws are astronomically unlikely.
    expect(seen.size).toBe(1000);
  });
});
