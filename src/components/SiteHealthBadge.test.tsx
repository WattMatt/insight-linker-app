/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteHealthBadge } from "./SiteHealthBadge";
import type { SiteScore } from "@/lib/siteScores";

const score = (over: Partial<SiteScore> = {}): SiteScore => ({
  siteId: "a",
  healthScore: 82,
  capturedAt: "2026-07-07",
  source: "snapshot",
  ...over,
});

describe("SiteHealthBadge", () => {
  it("renders the percentage with the snapshot capture date in the tooltip", () => {
    render(<SiteHealthBadge score={score()} />);
    const badge = screen.getByLabelText(/Site health score as of 2026-07-07: 82%/);
    expect(badge.textContent).toContain("82%");
  });

  it("labels a live-computed score as computed just now", () => {
    render(<SiteHealthBadge score={score({ capturedAt: null, source: "live" })} />);
    expect(screen.getByLabelText(/computed just now.*82%/)).toBeTruthy();
  });

  it("band colors follow getHealthBand thresholds (80 green / 50 amber / below red)", () => {
    const { rerender } = render(<SiteHealthBadge score={score({ healthScore: 80 })} />);
    expect(screen.getByLabelText(/80%/).className).toContain("text-green-700");
    rerender(<SiteHealthBadge score={score({ healthScore: 79 })} />);
    expect(screen.getByLabelText(/79%/).className).toContain("text-amber-700");
    rerender(<SiteHealthBadge score={score({ healthScore: 49 })} />);
    expect(screen.getByLabelText(/49%/).className).toContain("text-red-700");
  });

  it("shows a pending placeholder when no score exists yet — never a fake number", () => {
    render(<SiteHealthBadge score={undefined} />);
    expect(screen.getByLabelText("Site score not captured yet").textContent).toContain("—");
  });

  it("an EMPTY site (score 0) renders 0% in the danger band — never 100%", () => {
    render(<SiteHealthBadge score={score({ healthScore: 0 })} />);
    const badge = screen.getByLabelText(/0%/);
    expect(badge.textContent).toContain("0%");
    expect(badge.className).toContain("text-red-700");
  });

  it("shows a loading placeholder while scores resolve", () => {
    render(<SiteHealthBadge score={undefined} isLoading />);
    expect(screen.getByLabelText(/Loading site score/).textContent).toContain("…");
  });
});
