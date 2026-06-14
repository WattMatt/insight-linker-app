/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";
import { AssetRegister } from "./AssetRegister";
import type { BuildingAsset } from "@/lib/fortress/types";

const asset = (over: Partial<BuildingAsset> = {}): BuildingAsset => ({
  id: "a1",
  site_id: "s1",
  section_code: null,
  category: "Fire",
  name: "Fire Pump",
  make_model: "Acme 200",
  quantity: null,
  install_date: null,
  service_freq: null,
  last_service: null,
  next_service_due: null,
  next_service_date: "2026-07-01",
  service_cost: null,
  contractor: "FireCo",
  cost_recovery: null,
  condition: "Good",
  as_built_available: null,
  inspection_freq: null,
  general_comment: null,
  meta: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  deleted_at: null,
  ...over,
});

describe("AssetRegister", () => {
  it("shows an honest empty state when there are no assets", () => {
    render(createElement(AssetRegister, { assets: [] }));
    expect(screen.getByText("No building assets imported yet")).toBeInTheDocument();
  });

  it("renders rows and the count", () => {
    render(createElement(AssetRegister, { assets: [asset(), asset({ id: "a2", name: "HVAC Unit", category: "HVAC" })] }));
    expect(screen.getByText("Fire Pump")).toBeInTheDocument();
    expect(screen.getByText("HVAC Unit")).toBeInTheDocument();
    expect(screen.getByText("2 of 2 assets")).toBeInTheDocument();
  });

  it("filters by search text", () => {
    render(createElement(AssetRegister, { assets: [asset(), asset({ id: "a2", name: "HVAC Unit", category: "HVAC" })] }));
    fireEvent.change(screen.getByPlaceholderText("Search assets..."), { target: { value: "HVAC" } });
    expect(screen.getByText("HVAC Unit")).toBeInTheDocument();
    expect(screen.queryByText("Fire Pump")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 assets")).toBeInTheDocument();
  });

  it("filters by condition", () => {
    render(createElement(AssetRegister, { assets: [asset(), asset({ id: "a2", name: "HVAC Unit", condition: "Poor" })] }));
    fireEvent.click(screen.getByRole("button", { name: "Poor" }));
    expect(screen.getByText("HVAC Unit")).toBeInTheDocument();
    expect(screen.queryByText("Fire Pump")).not.toBeInTheDocument();
  });

  it("shows an error state with a working retry", () => {
    const onRetry = vi.fn();
    render(createElement(AssetRegister, { assets: [], error: true, onRetry }));
    expect(screen.getByText("Unable to load the asset register")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
