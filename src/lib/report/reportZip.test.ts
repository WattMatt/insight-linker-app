import { describe, it, expect, vi, beforeEach } from "vitest";
import JSZip from "jszip";

const { files } = vi.hoisted(() => ({ files: new Map<string, string | null>() }));
vi.mock("@/lib/documents/documentUrl", () => ({
  downloadDocumentBlob: async (url: string) => {
    const body = files.get(url);
    return body == null ? null : new Blob([body], { type: "application/pdf" });
  },
}));

import { buildReportsZip, reportZipPath, safeSegment, uniquePath } from "./reportZip";
import type { SiteReportRow } from "./siteReportInventory";

const row = (over: Partial<SiteReportRow>): SiteReportRow => ({
  id: "r", source: "site", file_name: "Report.pdf", file_url: "p/report.pdf",
  category: "Site Summary Reports", created_at: "2026-10-01T10:00:00Z", subsectionName: null, ...over,
});

beforeEach(() => files.clear());

describe("reportZipPath", () => {
  it("puts site reports under their category", () => {
    expect(reportZipPath(row({}))).toBe("Site Summary Reports/Report.pdf");
  });
  it("puts subsection reports under category / subsection", () => {
    expect(reportZipPath(row({ category: "Inspection Reports", subsectionName: "Shop 12/13" }))).toBe("Inspection Reports/Shop 12_13/Report.pdf");
  });
  it("sanitises illegal characters and never yields an empty segment", () => {
    expect(safeSegment('a:b*c?"d')).toBe("a_b_c__d");
    expect(safeSegment("...")).toBe("Untitled");
  });
});

describe("uniquePath", () => {
  it("numbers clashing file names", () => {
    const taken = new Set<string>();
    expect(uniquePath("A/x.pdf", taken)).toBe("A/x.pdf");
    expect(uniquePath("A/x.pdf", taken)).toBe("A/x (2).pdf");
    expect(uniquePath("A/x.pdf", taken)).toBe("A/x (3).pdf");
    expect(uniquePath("B/x.pdf", taken)).toBe("B/x.pdf");
  });
});

describe("buildReportsZip", () => {
  it("zips every downloadable report and lists the ones that failed", async () => {
    files.set("p/a.pdf", "AAA");
    files.set("p/b.pdf", "BBB");
    const rows = [
      row({ id: "1", file_url: "p/a.pdf", file_name: "Same.pdf" }),
      row({ id: "2", file_url: "p/b.pdf", file_name: "Same.pdf" }),
      row({ id: "3", file_url: "p/gone.pdf", file_name: "Gone.pdf", category: "Inspection Reports", subsectionName: "DB-1" }),
    ];
    const progress = vi.fn();

    const res = await buildReportsZip(rows, progress);
    expect(res.added).toBe(2);
    expect(res.missing.map((r) => r.id)).toEqual(["3"]);
    expect(progress).toHaveBeenLastCalledWith(3, 3);

    const zip = await JSZip.loadAsync(await res.blob.arrayBuffer());
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(["Site Summary Reports/", "Site Summary Reports/Same (2).pdf", "Site Summary Reports/Same.pdf", "_MISSING_FILES.txt"].sort());
    expect(await zip.file("Site Summary Reports/Same.pdf")!.async("string")).toBe("AAA");
    expect(await zip.file("_MISSING_FILES.txt")!.async("string")).toContain("Inspection Reports/DB-1/Gone.pdf");
  });
});
