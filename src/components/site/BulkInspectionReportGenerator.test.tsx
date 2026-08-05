/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { createElement } from "react";

type Row = Record<string, any>;

const { db, generateMock } = vi.hoisted(() => ({
  db: {
    selects: {} as Record<string, string>,
    subsections: [] as Row[],
    inspection: {} as Row,
    template: {} as Row,
  },
  generateMock: vi.fn(),
}));

// PostgREST hands back only the columns the query asked for. The mock must do the same,
// or a column missing from the select is invisible to the test.
function project(row: Row, columns: string): Row {
  if (columns.includes("*")) return row;
  const out: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (!new RegExp(`\\b${key}\\b`).test(columns)) continue;
    out[key] = Array.isArray(value) ? value.map((v) => project(v, columns)) : value;
  }
  return out;
}

function builder(table: string, rows: () => Row[]) {
  let columns = "*";
  const self: any = {
    select: (cols: string) => {
      columns = cols;
      db.selects[table] = cols;
      return self;
    },
    eq: () => self,
    in: () => self,
    ilike: () => self,
    order: () => self,
    single: () => {
      const first = rows()[0];
      return Promise.resolve({ data: first ? project(first, columns) : null, error: null });
    },
    then: (onOk: any, onErr: any) =>
      Promise.resolve({ data: rows().map((r) => project(r, columns)), error: null }).then(onOk, onErr),
  };
  return self;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) },
    from: (table: string) => {
      switch (table) {
        case "subsections":
          return builder(table, () => db.subsections);
        case "inspections":
          return builder(table, () => [db.inspection]);
        case "inspection_templates":
          return builder(table, () => [db.template]);
        default:
          return builder(table, () => []);
      }
    },
  },
}));

vi.mock("@/lib/pdfmakeInspectionReport", () => ({
  generateAndSaveInspectionReportPdfmake: generateMock,
}));

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { toast } from "sonner";
import { BulkInspectionReportGenerator } from "./BulkInspectionReportGenerator";

// Radix's ScrollArea measures its viewport; jsdom ships no ResizeObserver.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const inspection = (id: string, createdAt: string, templateName: string): Row => ({
  id,
  template_id: `tpl-${id}`,
  status: "Completed",
  created_at: createdAt,
  json_data: {},
  inspection_templates: { id: `tpl-${id}`, name: templateName },
});

const mount = () =>
  render(createElement(BulkInspectionReportGenerator, { siteId: "site-1", siteName: "Site One" }));

beforeEach(() => {
  db.selects = {};
  db.subsections = [];
  db.inspection = { id: "i1", json_data: {}, status: "Completed", inspector_name: "A", inspection_date: "2026-01-01" };
  db.template = { id: "tpl-i1", name: "Distribution Board", sections: [] };
  generateMock.mockReset();
  generateMock.mockResolvedValue({ success: true, fileName: "r.pdf", fileUrl: "https://x/r.pdf" });
  vi.mocked(toast.info).mockClear();
});

describe("BulkInspectionReportGenerator — latest inspection", () => {
  it("selects created_at and reports the newest inspection, not the first row returned", async () => {
    db.subsections = [
      {
        id: "sub-1",
        name: "Unit 1",
        // Oldest first: without created_at in the select the sort is a no-op and this wins.
        inspections: [
          inspection("i-old", "2025-01-01T00:00:00Z", "Older Template"),
          inspection("i-new", "2026-06-01T00:00:00Z", "Newer Template"),
        ],
      },
    ];

    mount();

    await waitFor(() => expect(screen.getByText("Newer Template")).toBeInTheDocument());
    expect(db.selects.subsections).toContain("created_at");
    expect(screen.queryByText("Older Template")).not.toBeInTheDocument();
  });
});

describe("BulkInspectionReportGenerator — Stop", () => {
  it("halts the run loop that is already in flight", async () => {
    db.subsections = [
      { id: "sub-1", name: "Unit 1", inspections: [inspection("i1", "2026-01-01T00:00:00Z", "Board A")] },
      { id: "sub-2", name: "Unit 2", inspections: [inspection("i2", "2026-01-02T00:00:00Z", "Board B")] },
    ];

    let releaseFirst: (v: unknown) => void = () => {};
    generateMock.mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve; }));

    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: /Generate Reports \(2\)/ })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: /Generate Reports \(2\)/ }));
    await waitFor(() => expect(generateMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    await act(async () => {
      releaseFirst({ success: true, fileName: "r.pdf", fileUrl: "https://x/r.pdf" });
    });

    await waitFor(
      () => expect(vi.mocked(toast.info)).toHaveBeenCalledWith("Generation stopped by user"),
      { timeout: 3000 },
    );
    expect(generateMock).toHaveBeenCalledTimes(1);
  });
});
