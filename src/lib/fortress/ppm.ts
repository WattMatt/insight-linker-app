// Pure PPM (planned preventative maintenance) rollups for the Fortress dashboard (S1-5).
// Per D7 this is the single source of truth for the PPM KPIs — both the screen and the
// PDF import it; no inline KPI math elsewhere. Reads building_assets.next_service_date
// (the parsed date added in migration 210000). All functions take `today` (ISO yyyy-mm-dd)
// so they stay pure and testable — see ppm.test.ts.

import type { BuildingAsset } from "./types";

export const DUE_SOON_DAYS = 30; // tunable: "services due ≤30 days" window

export interface PpmSummary {
  scheduled: number; // assets with a next_service_date
  dueSoon: number; // due within DUE_SOON_DAYS (today … today+N), excludes overdue
  overdue: number; // next_service_date < today
  onSchedulePct: number; // of scheduled, % not overdue (100 when none scheduled)
}

/** Add `days` to an ISO yyyy-mm-dd date, returning ISO yyyy-mm-dd (UTC, deterministic). */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const asDate = (v: string | null | undefined): string | null => (v ? v.slice(0, 10) : null);

export function ppmSummary(
  assets: BuildingAsset[],
  today: string,
  withinDays: number = DUE_SOON_DAYS,
): PpmSummary {
  const horizon = addDays(today, withinDays);
  let scheduled = 0;
  let dueSoon = 0;
  let overdue = 0;

  for (const asset of assets) {
    const date = asDate(asset.next_service_date);
    if (!date) continue;
    scheduled++;
    if (date < today) {
      overdue++;
    } else if (date <= horizon) {
      dueSoon++;
    }
  }

  const onSchedulePct = scheduled === 0 ? 100 : Math.round(((scheduled - overdue) / scheduled) * 100);
  return { scheduled, dueSoon, overdue, onSchedulePct };
}
