/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { SignOffRecord } from "@/lib/siteCoc/signOff";

const decide = vi.fn();
const setShop = vi.fn();
let records: SignOffRecord[] = [];

vi.mock("./useSignOff", () => ({
  useSignOff: () => ({ records, loading: false, error: null, decide, setShop }),
  usePageUrls: (paths: string[]) => ({ isLoading: false, data: paths.map((p) => `https://signed/${p}`) }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SignOffSubTab } from "./SignOffSubTab";

const rec = (id: string, over: Partial<SignOffRecord> = {}): SignOffRecord => ({
  id, recordKey: `doc${id}`, status: "proposed", verdict: "FAIL", verdictAlt: "FAIL", certNo: `NM ${id}`, certType: "Initial",
  docType: "electrical_coc", issuedDate: "2025-05-08", location: null, confidence: "high", sourceFile: "a.pdf", reasons: null,
  rules: [{ rule: "A2", res: "FAIL", note: "no test report", val: null }, { rule: "A1", res: "PASS", note: null, val: null }],
  flags: ["cover and test report numbers differ"], caveats: [], dbName: null, building: null, regPerson: null, regNo: null,
  subsectionId: null, signedOffAt: null, signOffNote: null, pages: [`coc-reverification/${id}.jpg`], ...over,
});

describe("SignOffSubTab", () => {
  beforeEach(() => {
    decide.mockReset().mockImplementation(async (id: string, d: string) => {
      records = records.map((r) => (r.id === id ? { ...r, status: d === "accept" ? "signed_off" : "rejected" } : r));
    });
    records = [rec("1"), rec("2", { verdict: "PASS", rules: [] })];
  });

  it("shows the first record's verdict in plain words, issues, flags and its page", () => {
    render(<SignOffSubTab siteId="s" subsections={[]} canSign />);
    expect(screen.getByText("Fails one or more rules")).toBeTruthy();
    expect(screen.getByText(/no test report/)).toBeTruthy();
    expect(screen.queryByText("A1")).toBeNull();
    expect(screen.getByText(/cover and test report numbers differ/)).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe("https://signed/coc-reverification/1.jpg");
    expect(screen.getByText(/to review/).textContent).toMatch(/0 signed off · 0 rejected · 2 to review of 2/);
  });

  it("accepting calls the sign-off function for that record", async () => {
    render(<SignOffSubTab siteId="s" subsections={[]} canSign />);
    fireEvent.click(screen.getByRole("button", { name: /Accept FAIL/ }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith("1", "accept", ""));
  });

  it("will not reject without a reason", async () => {
    render(<SignOffSubTab siteId="s" subsections={[]} canSign />);
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    await new Promise((r) => setTimeout(r, 0));
    expect(decide).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/required to reject/), { target: { value: "wrong site" } });
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    await waitFor(() => expect(decide).toHaveBeenCalledWith("1", "reject", "wrong site"));
  });

  it("is view-only without the Admin role", () => {
    render(<SignOffSubTab siteId="s" subsections={[]} canSign={false} />);
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull();
    expect(screen.getByText(/needs the Admin role/)).toBeTruthy();
  });
});
