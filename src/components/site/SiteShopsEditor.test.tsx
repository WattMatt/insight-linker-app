/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { createElement } from "react";

const { updateSubsection, updateMeterRow } = vi.hoisted(() => ({
  updateSubsection: vi.fn(() => Promise.resolve()),
  updateMeterRow: vi.fn(() => Promise.resolve()),
}));
vi.mock("./siteDataWrites", () => ({ updateSubsection, updateMeterRow }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SiteShopsEditor } from "./SiteShopsEditor";
import {
  buildInspectionMeterMatches,
  buildInspectionMeterRows,
  buildComparisonResults,
  findUnregisteredMeters,
  type SiteShop,
} from "@/lib/assetVerification";

// 204 Oxford, Main DB C: the DB Sub F1 board has no register row tied to it until its
// subsection is given the register's shop number.
const inspections = [
  {
    id: "i-dbc",
    title: "EMB",
    subsection_id: "b-dbc",
    json_data: {
      tenants: [
        { id: "t5", shopName: "TurnTender", shopNumber: "Turn Tender", meterSerialNumber: "35753503", ctSizeAndRatio: "250/5A", breakerSize: "250A" },
        { id: "t13", shopName: "DB Sub F1", shopNumber: "DB Sub F1", meterSerialNumber: "35753144", ctSizeAndRatio: "250/5A", breakerSize: "250A" },
      ],
    },
  },
];
const shops: SiteShop[] = [
  { id: "b-dbc", name: "Main DB C", meter_serial_number: "35753168" },
  { id: "s1", name: "SHOP G01-G06", tenant_name: "TURN 'N TENDER", meter_serial_number: "35753503" },
  { id: "s4", name: "Main DB F1 1st Floor North", tenant_name: "Main DB", meter_serial_number: "35753144" },
];
const assets = [
  { id: "a1", premises_id: "OX - G01-G06", trade_as: null, meter_serial_number: "35753143", ct_ratio: "250/5A", breaker_size: "250A", asset_category: "electrical_meter" },
  { id: "a2", premises_id: "OX - DB-F1", trade_as: null, meter_serial_number: "35753503", ct_ratio: "400/5A", breaker_size: "400A", asset_category: "electrical_meter" },
];

function renderEditor(readOnly = false) {
  const meterRows = buildInspectionMeterRows(inspections, shops);
  const comparisonResults = buildComparisonResults(assets, buildInspectionMeterMatches(inspections, shops), shops);
  return render(
    createElement(SiteShopsEditor, {
      siteShops: shops,
      meterRows,
      comparisonResults,
      unregisteredMeters: findUnregisteredMeters(meterRows, comparisonResults),
      readOnly,
      onDataUpdated: vi.fn(),
    }),
  );
}

const rowOf = (text: string) => screen.getAllByText(text)[0].closest("tr") as HTMLElement;
// Serials appear in both tables; the board meter rows are the second table.
const meterRowOf = (serial: string) => screen.getAllByText(serial).at(-1)!.closest("tr") as HTMLElement;

async function editCell(row: HTMLElement, cellIndex: number, value: string) {
  const cell = within(row).getAllByRole("cell")[cellIndex];
  fireEvent.click(within(cell).getByTitle("Edit"));
  const input = within(cell).getByRole("textbox");
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

beforeEach(() => {
  updateSubsection.mockClear();
  updateMeterRow.mockClear();
});

describe("SiteShopsEditor", () => {
  it("shows which register row each shop is tied to, and reads the shop number from the name", () => {
    renderEditor();
    const g01 = rowOf("SHOP G01-G06");
    expect(within(g01).getByText("OX - G01-G06")).toBeTruthy();
    expect(within(g01).getByText("G01-G06 (from name)")).toBeTruthy();
    expect(within(g01).getByText("Register serial differs")).toBeTruthy();
    expect(within(rowOf("Main DB F1 1st Floor North")).getByText("not tied")).toBeTruthy();
  });

  it("flags a board meter with no register row", () => {
    renderEditor();
    expect(within(meterRowOf("35753144")).getByText("Not in register")).toBeTruthy();
  });

  it("sets a subsection's shop number", async () => {
    renderEditor();
    await editCell(rowOf("Main DB F1 1st Floor North"), 1, "DB-F1");
    await waitFor(() => expect(updateSubsection).toHaveBeenCalledWith("s4", { shop_number: "DB-F1" }));
  });

  it("renames a subsection", async () => {
    renderEditor();
    await editCell(rowOf("Main DB F1 1st Floor North"), 0, "DB F1 - 1st Floor North");
    await waitFor(() => expect(updateSubsection).toHaveBeenCalledWith("s4", { name: "DB F1 - 1st Floor North" }));
  });

  it("edits a board meter row's shop number by the row's own id", async () => {
    renderEditor();
    await editCell(meterRowOf("35753503"), 1, "G01-G06");
    await waitFor(() =>
      expect(updateMeterRow).toHaveBeenCalledWith(
        "i-dbc",
        expect.objectContaining({ tenantId: "t5" }),
        { shopNumber: "G01-G06" },
      ),
    );
  });

  it("offers no edit controls when read-only", () => {
    renderEditor(true);
    expect(screen.queryAllByTitle("Edit")).toHaveLength(0);
  });
});
