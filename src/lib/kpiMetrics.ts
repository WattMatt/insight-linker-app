// Pure KPI helpers for the site dashboard — metrics NOT already produced by
// siteDeliverables.ts / siteHealth.ts. No I/O. See kpiMetrics.test.ts.
import { snagStatusBucket } from "./subsectionStatus";
import { BLOCKING_RISK_LEVELS } from "./siteHealth";

const DAY = 86_400_000;
const daysBetween = (fromISO: string, toISO: string) =>
  Math.floor((Date.parse(toISO) - Date.parse(fromISO)) / DAY);

export interface SubsectionForExpiry {
  coc_status?: string | null;
  coc_expiry_date?: string | null;
}
export interface CocExpiryBuckets { expired: number; within30: number; within90: number; }

// Counts COC-required 'Pass' certificates by how soon they expire, relative to `today`
// (ISO yyyy-mm-dd). Missing dates and non-Pass statuses are ignored.
export function cocExpiryBuckets(subs: SubsectionForExpiry[], today: string): CocExpiryBuckets {
  const b: CocExpiryBuckets = { expired: 0, within30: 0, within90: 0 };
  for (const s of subs) {
    if (!s.coc_expiry_date) continue;
    if ((s.coc_status || "").toLowerCase() !== "pass") continue;
    const days = daysBetween(today, s.coc_expiry_date);
    if (days < 0) b.expired++;
    else if (days <= 30) b.within30++;
    else if (days <= 90) b.within90++;
  }
  return b;
}

export interface SnagForAging {
  status?: string | null;
  risk_level?: string | null;
  created_at?: string | null;
  rectified_at?: string | null;
}
export interface SnagAging { criticalOpen: number; oldestOpenDays: number | null; medianResolveDays: number | null; }

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// Open = anything not in the terminal (rectified/closed) bucket. "criticalOpen" counts
// open snags at a blocking risk level (Critical/High). medianResolveDays uses snags that
// carry both a created_at and a rectified_at.
export function snagAging(snags: SnagForAging[], today: string): SnagAging {
  let criticalOpen = 0;
  let oldestOpenDays: number | null = null;
  const resolveDurations: number[] = [];
  for (const s of snags) {
    const open = snagStatusBucket(s.status) !== "closed";
    if (open) {
      if (BLOCKING_RISK_LEVELS.includes(s.risk_level || "")) criticalOpen++;
      if (s.created_at) {
        const age = daysBetween(s.created_at, today);
        oldestOpenDays = oldestOpenDays === null ? age : Math.max(oldestOpenDays, age);
      }
    } else if (s.created_at && s.rectified_at) {
      resolveDurations.push(daysBetween(s.created_at, s.rectified_at));
    }
  }
  return { criticalOpen, oldestOpenDays, medianResolveDays: median(resolveDurations) };
}
