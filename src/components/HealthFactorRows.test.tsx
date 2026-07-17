/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HealthFactorRows, describeHealthGaps, fmtPts } from "./HealthFactorRows";
import { healthBreakdown } from "@/lib/siteHealth";

const PHOTO_JSON = { sec: { item: { photos: ["u1"] } } };
const subs = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, metering_status: "Installed" }));
const snags = [
  { subsection_id: "s0", status: "Open" },
  { subsection_id: "s0", status: "Rectified" },
];
const insp = [{ subsection_id: "s0", json_data: PHOTO_JSON }];
const breakdown = healthBreakdown(subs, snags, insp);

describe("fmtPts", () => {
  it("renders 1 decimal only when needed", () => {
    expect(fmtPts(32.55)).toBe("32.6");
    expect(fmtPts(25.0000004)).toBe("25");
    expect(fmtPts(0)).toBe("0");
  });
});

describe("describeHealthGaps", () => {
  it("names each open gap with its point value", () => {
    const gaps = describeHealthGaps(breakdown);
    expect(gaps.some((g) => g.includes("resolve 1 snag "))).toBe(true);
    expect(gaps.some((g) => g.includes("add photos to 3 inspections"))).toBe(true);
    expect(gaps.some((g) => g.includes("meter"))).toBe(false); // fully metered
  });
});

describe("HealthFactorRows", () => {
  it("renders read-only rows (no buttons) with counts and points", () => {
    render(<HealthFactorRows breakdown={breakdown} />);
    expect(screen.getByText("Snags resolved").parentElement!.textContent).toContain("1/2");
    expect(screen.getByText("Subsections metered").parentElement!.textContent).toContain("4/4");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
  it("rows become buttons that report their factor key when onFactorClick is set", () => {
    const onClick = vi.fn();
    render(<HealthFactorRows breakdown={breakdown} onFactorClick={onClick} />);
    fireEvent.click(screen.getByText("Snags resolved"));
    expect(onClick).toHaveBeenCalledWith("snags");
  });
});
