import { describe, it, expect } from "vitest";
import { buildLabeledQrSvg } from "./qrSvg";

describe("buildLabeledQrSvg", () => {
  it("produces a self-contained svg with real text labels", async () => {
    const svg = await buildLabeledQrSvg({
      url: "https://x.test/functions/v1/qr-redirect?path=abc",
      siteName: "The Plaza",
      subsectionName: "DB 2A Ground Floor",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("THE PLAZA");
    expect(svg).toContain("DB 2A Ground Floor");
    expect(svg).toContain("</svg>");
  });
  it("escapes XML-special characters in labels", async () => {
    const svg = await buildLabeledQrSvg({
      url: "https://x.test/q?path=abc",
      siteName: "Smith & Co <Ltd>",
      subsectionName: "Unit \"A\" & B",
    });
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&lt;");
    expect(svg).not.toContain("<Ltd>");
    expect(svg).toContain("</svg>");
  });
});
