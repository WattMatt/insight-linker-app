/**
 * @vitest-environment jsdom
 *
 * Health-breakdown card: the score's factor rows and the per-subsection outstanding
 * list must reconcile with the fetched snag rows (see siteHealth.healthBreakdown).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ComplianceDashboard } from "./ComplianceDashboard";
import type { SiteDeliverablesSummary } from "@/lib/siteDeliverables";

const SNAG_ROWS = [
  { id: "n1", subsection_id: "a", status: "Open", risk_level: "Critical", created_at: "2025-11-04", rectified_at: null },
  { id: "n2", subsection_id: "a", status: "Open", risk_level: "Low", created_at: "2025-11-04", rectified_at: null },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        // snags fetch
        in: () => Promise.resolve(table === "snags" ? { data: SNAG_ROWS, error: null } : { data: [], error: null }),
        // snapshots fetch
        eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null }) }) }),
      }),
    }),
  },
}));
vi.mock("@/lib/navigation", () => ({ useNavigate: () => vi.fn() }));

const PHOTO_JSON = { sec: { item: { photos: ["u1"] } } };
const sub = (id: string, name: string) => ({
  id, name, category: null, coc_status: "Missing", metering_status: "Installed",
  meter_serial_number: null, is_compliant: null, is_coc_required: true,
});

const summary: SiteDeliverablesSummary = {
  siteId: "site1", siteName: "Test Site", deliverables: [],
  completeCount: 0, applicableCount: 8, completionPct: 0,
  outstandingCount: 0, blockingCount: 0, band: "warning", nextTasks: [],
};

describe("ComplianceDashboard — operational health breakdown", () => {
  it("shows factor counts/points and the per-subsection outstanding list", async () => {
    render(
      <ComplianceDashboard
        siteId="site1"
        clientId="client1"
        subsections={[sub("a", "SHOP A"), sub("b", "SHOP B"), sub("c", "SHOP C")]}
        inspections={[
          { id: "i1", subsection_id: "a", inspection_date: "2025-11-04", json_data: PHOTO_JSON },
          { id: "i2", subsection_id: "c", inspection_date: "2025-11-04", json_data: PHOTO_JSON },
          // b has no inspection
        ]}
        deliverablesSummary={summary}
      />
    );

    expect(screen.getByText("Operational health breakdown")).toBeTruthy();

    // Factor rows: 0/2 snags resolved, 2/3 inspected, 3/3 metered
    await waitFor(() => expect(screen.getByText("Snags resolved").parentElement!.textContent).toContain("0/2"));
    const snagRow = screen.getByText("Snags resolved").parentElement!;
    expect(snagRow.textContent).toContain("/40 pts");
    expect(screen.getByText("Inspections with photos").parentElement!.textContent).toContain("2/3");
    expect(screen.getByText("Subsections metered").parentElement!.textContent).toContain("3/3");

    // Outstanding list: A (2 snags, one Critical → blocked), B (inspection missing); C clean → absent
    const shopA = screen.getByText("SHOP A").closest("button")!;
    expect(shopA.textContent).toContain("2 snags");
    const shopB = screen.getByText("SHOP B").closest("button")!;
    expect(shopB.textContent).toContain("inspection");
    expect(screen.queryByText("SHOP C")).toBeNull();

    // The gap hint names what closes the score gap
    expect(screen.getByText(/To reach 100%/).textContent).toContain("resolve 2 snags");
    expect(screen.getByText(/To reach 100%/).textContent).toContain("add photos to 1 inspection");
  });

  it("shows 'Nothing outstanding' when every subsection is clean", async () => {
    render(
      <ComplianceDashboard
        siteId="site1"
        clientId="client1"
        subsections={[sub("c", "SHOP C")]}
        inspections={[{ id: "i2", subsection_id: "c", inspection_date: "2025-11-04", json_data: PHOTO_JSON }]}
        deliverablesSummary={summary}
      />
    );
    await waitFor(() => expect(screen.getByText("Nothing outstanding")).toBeTruthy());
  });
});
