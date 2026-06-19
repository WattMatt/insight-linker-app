import { describe, it, expect } from "vitest";
import { normShop, normCert, normCertType, parseFilesCount, parseIssuedDate } from "./normalize";

describe("normShop", () => {
  it("uppercases and collapses separators so SHOP-002 == SHOP 002", () => {
    expect(normShop("SHOP-002")).toBe("SHOP 002");
    expect(normShop("  shop   002 ")).toBe("SHOP 002");
  });
  it("handles null", () => expect(normShop(null)).toBe(""));
});

describe("normCert", () => {
  it("uppercases and strips spaces", () => {
    expect(normCert("B 1612744")).toBe("B1612744");
  });
});

describe("normCertType", () => {
  it("maps I/S and full words", () => {
    expect(normCertType("I")).toBe("Initial");
    expect(normCertType("s")).toBe("Supplementary");
    expect(normCertType("Initial")).toBe("Initial");
    expect(normCertType("")).toBe("Unclear");
  });
});

describe("parseFilesCount", () => {
  it("parses ints, defaults null", () => {
    expect(parseFilesCount(3)).toBe(3);
    expect(parseFilesCount("4")).toBe(4);
    expect(parseFilesCount("")).toBeNull();
  });
});

describe("parseIssuedDate", () => {
  it("returns yyyy-mm-dd for a Date", () => {
    expect(parseIssuedDate(new Date("2024-11-05T00:00:00Z"))).toBe("2024-11-05");
  });
  it("passes through an iso-ish string date", () => {
    expect(parseIssuedDate("2024-11-05")).toBe("2024-11-05");
  });
  it("returns null for unparseable", () => {
    expect(parseIssuedDate("n/a")).toBeNull();
    expect(parseIssuedDate(null)).toBeNull();
  });
});
