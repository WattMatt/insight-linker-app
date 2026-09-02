/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { createElement } from "react";

const { generateMock, saveMock } = vi.hoisted(() => ({
  generateMock: vi.fn(),
  saveMock: vi.fn(),
}));

vi.mock("@/lib/report/siteSummaryPdf", () => ({
  generateSiteSummaryPdf: generateMock,
}));

vi.mock("@/lib/pdfDocumentSaver", () => ({
  savePDFToDocuments: saveMock,
  getReportCategoryName: () => "Site Summary Reports",
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";
import { BulkSiteReportGenerator } from "./BulkSiteReportGenerator";

// Radix ScrollArea measures its viewport; jsdom ships no ResizeObserver.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const SITES = [
  { id: "site-1", name: "Alpha Mall", clientName: "Fortress" },
  { id: "site-2", name: "Beta Park", clientName: "Fortress" },
];

const openDialog = async () => {
  fireEvent.click(screen.getByRole("button", { name: /bulk reports/i }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Generate Reports \(2\)/ })).toBeEnabled()
  );
};

beforeEach(() => {
  generateMock.mockReset();
  saveMock.mockReset();
  generateMock.mockResolvedValue({ blob: new Blob(["pdf"]), filename: "r.pdf" });
  saveMock.mockResolvedValue({ success: true, documentUrl: "site-1/x/r.pdf" });
  vi.mocked(toast.info).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.warning).mockClear();
});

describe("BulkSiteReportGenerator", () => {
  it("generates and saves a report per selected site, then reports success", async () => {
    const onComplete = vi.fn();
    render(createElement(BulkSiteReportGenerator, { sites: SITES, onComplete }));
    await openDialog();

    fireEvent.click(screen.getByRole("button", { name: /Generate Reports \(2\)/ }));

    await waitFor(
      () => expect(vi.mocked(toast.success)).toHaveBeenCalledWith("2 reports generated and saved"),
      { timeout: 4000 }
    );
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(generateMock).toHaveBeenNthCalledWith(1, {
      siteId: "site-1",
      siteName: "Alpha Mall",
      clientName: "Fortress",
    });
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1][0]).toMatchObject({
      siteId: "site-2",
      categoryName: "Site Summary Reports",
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("Stop halts the loop after the in-flight site", async () => {
    render(createElement(BulkSiteReportGenerator, { sites: SITES }));
    await openDialog();

    let releaseFirst: (v: unknown) => void = () => {};
    generateMock.mockImplementationOnce(
      () => new Promise((resolve) => { releaseFirst = resolve; })
    );

    fireEvent.click(screen.getByRole("button", { name: /Generate Reports \(2\)/ }));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await act(async () => {
      releaseFirst({ blob: new Blob(["pdf"]), filename: "r.pdf" });
    });

    await waitFor(
      () => expect(vi.mocked(toast.info)).toHaveBeenCalledWith("Generation stopped — 1 report saved"),
      { timeout: 4000 }
    );
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("one failing site does not halt the run", async () => {
    generateMock.mockRejectedValueOnce(new Error("template fetch died"));

    render(createElement(BulkSiteReportGenerator, { sites: SITES }));
    await openDialog();

    fireEvent.click(screen.getByRole("button", { name: /Generate Reports \(2\)/ }));

    await waitFor(
      () => expect(vi.mocked(toast.warning)).toHaveBeenCalledWith("1 of 2 reports saved (1 failed)"),
      { timeout: 4000 }
    );
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});
