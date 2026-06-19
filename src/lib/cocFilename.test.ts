import { describe, it, expect } from "vitest";
import { extractCocNumber, extractEvalVerdict } from "./cocFilename";

describe("extractCocNumber", () => {
  it("extracts a hyphenated number from a COC filename", () => {
    expect(extractCocNumber("B-1612744_SHOP-002-SHOPRITE-LIQUOR-SH_I.pdf")).toBe("B-1612744");
  });
  it("strips a leading PASS- verdict token from an eval filename", () => {
    expect(extractCocNumber("PASS-B-1612744-SHOP-002-SHOPRITE-LIQUOR-SHOP.html")).toBe("B-1612744");
  });
  it("normalises a number with no hyphen", () => {
    expect(extractCocNumber("B1612744 - SHOP K4 MZANSI BILLS.pdf")).toBe("B-1612744");
  });
  it("is not hardcoded to the letter B", () => {
    expect(extractCocNumber("X-99001.pdf")).toBe("X-99001");
  });
  it("uppercases the prefix", () => {
    expect(extractCocNumber("b-1612744.pdf")).toBe("B-1612744");
  });
  it("returns null when there is no letter+digit token", () => {
    expect(extractCocNumber("certificate-of-compliance.pdf")).toBeNull();
  });
});

describe("extractEvalVerdict", () => {
  it("reads Pass from a PASS- prefix", () => {
    expect(extractEvalVerdict("PASS-B-1612744-SHOP.html")).toBe("Pass");
  });
  it("reads Fail from a FAIL_ prefix", () => {
    expect(extractEvalVerdict("FAIL_B-1612744.html")).toBe("Fail");
  });
  it("is case-insensitive", () => {
    expect(extractEvalVerdict("pass-b-1.html")).toBe("Pass");
  });
  it("returns null without a verdict prefix", () => {
    expect(extractEvalVerdict("B-1612744_I.pdf")).toBeNull();
  });
});
