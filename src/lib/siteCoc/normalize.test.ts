import { describe, it, expect, afterEach } from "vitest";
import { normShop, normCert, normCertType, parseFilesCount, parseIssuedDate } from "./normalize";

describe("normShop", () => {
  it("uppercases and collapses separators so SHOP-002 == SHOP 002", () => {
    expect(normShop("SHOP-002")).toBe("SHOP 002");
    expect(normShop("  shop   002 ")).toBe("SHOP 002");
  });
  it("handles null", () => expect(normShop(null)).toBe(""));
  it("normalises & to AND so 'FISH & CHIPS' == 'FISH AND CHIPS'", () => {
    expect(normShop("FISH & CHIPS")).toBe("FISH AND CHIPS");
    expect(normShop("A&B")).toBe("A AND B");
  });
});

describe("normCert", () => {
  it("uppercases and strips spaces and hyphens", () => {
    expect(normCert("B 1612744")).toBe("B1612744");
    expect(normCert("B-1612744")).toBe("B1612744");
    expect(normCert("b1612744")).toBe("B1612744");
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
  // Date cells arrive from xlsx (cellDates:true) as LOCAL midnight, so these pin the
  // runner's zone: a UTC serialisation drops a day everywhere east of Greenwich.
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it("keeps the calendar day of a local-midnight Date in a UTC-positive zone", () => {
    process.env.TZ = "Africa/Johannesburg";
    expect(parseIssuedDate(new Date(2024, 10, 5))).toBe("2024-11-05");
  });
  it("keeps the calendar day of a local-midnight Date in a UTC-negative zone", () => {
    process.env.TZ = "America/New_York";
    expect(parseIssuedDate(new Date(2024, 10, 5))).toBe("2024-11-05");
  });
  it("passes through an iso-ish string date", () => {
    expect(parseIssuedDate("2024-11-05")).toBe("2024-11-05");
  });
  it("reads a non-iso string date from local components", () => {
    process.env.TZ = "Africa/Johannesburg";
    expect(parseIssuedDate("05 Nov 2024")).toBe("2024-11-05");
  });
  it("returns null for unparseable", () => {
    expect(parseIssuedDate("n/a")).toBeNull();
    expect(parseIssuedDate(null)).toBeNull();
  });
});
