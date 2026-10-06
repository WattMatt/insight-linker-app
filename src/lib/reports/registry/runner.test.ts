import { describe, it, expect, vi, beforeEach } from "vitest";
import { orderTargets, runReportTargets } from "./runner";
import type { GenerateResult, ReportTarget, ReportType } from "./types";

const t = (type: ReportType, label: string): ReportTarget => ({
  key: `${type}:${label}`, type, label, sourceUpdatedAt: null, existing: null,
});
const ok: GenerateResult = { ok: true, durationMs: 1, bytes: 10, superseded: 1, supersedeBlocked: 0 };

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("orderTargets", () => {
  it("runs cheap site reports first and inspections last, by label within a type", () => {
    const ordered = orderTargets([
      t("inspection", "B"), t("asset-verification", "AV"), t("inspection", "A"),
      t("site-summary", "SS"), t("site-coc", "COC"), t("fortress-checklist", "F"),
    ]);
    expect(ordered.map((x) => x.label)).toEqual(["COC", "F", "SS", "AV", "A", "B"]);
  });
});

describe("runReportTargets", () => {
  it("keeps going after a failure and counts saved / failed", async () => {
    const generate = vi.fn(async (target: ReportTarget): Promise<GenerateResult> =>
      target.label === "bad" ? { ok: false, durationMs: 1, error: "boom" } : ok);
    const summary = await runReportTargets(
      [t("inspection", "a"), t("inspection", "bad"), t("inspection", "c")],
      { generate, shouldStop: () => false },
    );
    expect(generate).toHaveBeenCalledTimes(3);
    expect(summary).toMatchObject({ saved: 2, failed: 1, skipped: 0, stopped: false });
  });

  it("finishes the report in progress, then stops and counts the rest as skipped", async () => {
    let stop = false;
    const generate = vi.fn(async (): Promise<GenerateResult> => { stop = true; return ok; });
    const summary = await runReportTargets(
      [t("inspection", "a"), t("inspection", "b"), t("inspection", "c")],
      { generate, shouldStop: () => stop },
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ saved: 1, skipped: 2, stopped: true });
  });

  it("totals replace-on-save rows that RLS kept", async () => {
    const generate = async (): Promise<GenerateResult> => ({ ...ok, supersedeBlocked: 2 });
    const summary = await runReportTargets([t("site-coc", "x"), t("site-summary", "y")], { generate, shouldStop: () => false });
    expect(summary.supersedeBlocked).toBe(4);
  });
});
