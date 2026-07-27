import { describe, expect, it } from "vitest";
import { docStatusFromVerdict } from "./verdictMap";

describe("docStatusFromVerdict", () => {
  it("maps PASS variants to Pass", () => {
    expect(docStatusFromVerdict("PASS")).toBe("Pass");
    expect(docStatusFromVerdict("pass")).toBe("Pass");
    expect(docStatusFromVerdict(" Passed ")).toBe("Pass");
  });
  it("maps FAIL variants to Fail", () => {
    expect(docStatusFromVerdict("FAIL")).toBe("Fail");
    expect(docStatusFromVerdict("Failed - see reasons")).toBe("Fail");
  });
  it("maps CV / blank / unknown to Pending", () => {
    expect(docStatusFromVerdict("CV")).toBe("Pending");
    expect(docStatusFromVerdict("Cannot verify")).toBe("Pending");
    expect(docStatusFromVerdict("")).toBe("Pending");
    expect(docStatusFromVerdict(null)).toBe("Pending");
    expect(docStatusFromVerdict(undefined)).toBe("Pending");
  });
});
