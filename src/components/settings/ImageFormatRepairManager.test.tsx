/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createElement } from "react";

const { scanMock, repairMock, role } = vi.hoisted(() => ({
  scanMock: vi.fn(),
  repairMock: vi.fn(),
  role: { value: "Admin" as string | null | undefined },
}));

vi.mock("@/lib/imageRepair/legacyImageRepair", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/imageRepair/legacyImageRepair")>();
  return { ...actual, scanBuckets: scanMock, repairObjects: repairMock };
});

vi.mock("@/hooks/useUserRole", () => ({
  useUserRole: () => ({ data: role.value }),
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";
import { ImageFormatRepairManager } from "./ImageFormatRepairManager";

const heicAsJpg = {
  bucket: "coc-photos",
  path: "coc/ctx/photo/abc.jpg",
  size: 2_500_000,
  verdict: { kind: "repairable", label: "HEIC" },
};
const okImage = { bucket: "coc-photos", path: "fine.jpg", size: 100, verdict: { kind: "ok", format: "jpeg" } };
const svgDoc = { bucket: "site-images", path: "x/logo.svg", size: 400, verdict: { kind: "displayable", label: "SVG/XML" } };
const errorBody = { bucket: "coc-photos", path: "y.jpg", size: 50, verdict: { kind: "not-image", label: "JSON body (not an image)" } };

beforeEach(() => {
  scanMock.mockReset();
  repairMock.mockReset();
  role.value = "Admin";
  vi.mocked(toast.warning).mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.info).mockClear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("ImageFormatRepairManager", () => {
  it("scans the six photo buckets (never documents) and summarises the verdicts", async () => {
    scanMock.mockResolvedValue({
      objects: [heicAsJpg, okImage, svgDoc, errorBody],
      errors: [],
      skipped: 7,
    });

    render(createElement(ImageFormatRepairManager));
    fireEvent.click(screen.getByRole("button", { name: /scan for problem images/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Repair 1 image$/ })).toBeInTheDocument());
    expect(scanMock.mock.calls[0][0]).toEqual([
      "inspection-photos", "coc-photos", "site-images", "company-logos", "client-logos", "profile-images",
    ]);
    expect(scanMock.mock.calls[0][0]).not.toContain("documents");
    expect(screen.getByText("coc-photos/coc/ctx/photo/abc.jpg")).toBeInTheDocument();
    expect(screen.getByText(/1 browser-displayable image/)).toBeInTheDocument();
    expect(screen.getByText(/7 non-image files/)).toBeInTheDocument();
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith("Scan complete — 1 of 4 images need repair");
  });

  it("repairs ONLY the repairable objects, never the ok/displayable/not-image ones", async () => {
    scanMock.mockResolvedValue({ objects: [okImage, heicAsJpg, svgDoc, errorBody], errors: [], skipped: 0 });
    repairMock.mockImplementation(async (objects: any[], opts: any) => {
      const outcome = { bucket: "coc-photos", path: "coc/ctx/photo/abc.jpg", status: "repaired", before: 2_500_000, after: 180_000, format: "jpeg" };
      opts.onProgress?.(1, objects.length, outcome);
      return [outcome];
    });

    render(createElement(ImageFormatRepairManager));
    fireEvent.click(screen.getByRole("button", { name: /scan for problem images/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Repair 1 image$/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Repair 1 image$/ }));

    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith("1 image repaired"));
    // The exact subset — only the HEIC object, not the ok/displayable/not-image ones.
    expect(repairMock.mock.calls[0][0]).toEqual([heicAsJpg]);
    expect(screen.getByText(/JPEG · 2\.4 MB → 176 KB/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Repair 1 image$/ })).not.toBeInTheDocument();
  });

  it("does nothing when the confirm dialog is declined", async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    scanMock.mockResolvedValue({ objects: [heicAsJpg], errors: [], skipped: 0 });

    render(createElement(ImageFormatRepairManager));
    fireEvent.click(screen.getByRole("button", { name: /scan for problem images/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Repair 1 image$/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Repair 1 image$/ }));

    expect(repairMock).not.toHaveBeenCalled();
  });

  it("shows Stop during a run and aborts the passed signal when clicked", async () => {
    scanMock.mockResolvedValue({ objects: [heicAsJpg], errors: [], skipped: 0 });
    let capturedSignal: AbortSignal | undefined;
    repairMock.mockImplementation((_objects: any[], opts: any) => {
      capturedSignal = opts.signal;
      return new Promise(() => {}); // never resolves — the run stays in flight
    });

    render(createElement(ImageFormatRepairManager));
    fireEvent.click(screen.getByRole("button", { name: /scan for problem images/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Repair 1 image$/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Repair 1 image$/ }));
    const stop = await screen.findByRole("button", { name: /stop/i });
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(stop);
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("surfaces a bucket that could not be listed instead of reporting success", async () => {
    scanMock.mockResolvedValue({
      objects: [],
      errors: [{ bucket: "coc-photos", path: "", error: "permission denied" }],
      skipped: 0,
    });

    render(createElement(ImageFormatRepairManager));
    fireEvent.click(screen.getByRole("button", { name: /scan for problem images/i }));

    await waitFor(() => expect(screen.getByText(/Some buckets could not be listed/)).toBeInTheDocument());
    expect(screen.getByText(/permission denied/)).toBeInTheDocument();
    expect(vi.mocked(toast.warning)).toHaveBeenCalledWith("Scan finished with 1 bucket that could not be listed");
  });

  it("does not offer repair when every image is already displayable or JPEG/PNG", async () => {
    scanMock.mockResolvedValue({ objects: [okImage, svgDoc], errors: [], skipped: 0 });

    render(createElement(ImageFormatRepairManager));
    fireEvent.click(screen.getByRole("button", { name: /scan for problem images/i }));

    await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Scan complete — 2 images checked, none need repair"));
    expect(screen.queryByRole("button", { name: /Repair/ })).not.toBeInTheDocument();
  });

  it("refuses to render the tool for a non-admin user", () => {
    role.value = "Client";
    render(createElement(ImageFormatRepairManager));
    expect(screen.getByText(/available to administrators only/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /scan for problem images/i })).not.toBeInTheDocument();
  });
});
