/**
 * Pure, testable builders for the Calendar report (events grouped by month).
 * No pdfmake imports — assembly lives in calendarReportGenerator.ts.
 */
import { formatDate } from './reportKernel';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface CalendarEvent {
  id?: string;
  title?: string;
  siteName?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  priority?: string;
  eventType?: string;
}

export interface CalendarStats {
  totalEvents: number;
  upcomingCount: number;
  completedCount: number;
  pendingCount: number;
}

export interface CalendarReportData {
  title?: string;
  subtitle?: string;
  year: number;
  events: CalendarEvent[];
  stats?: CalendarStats;
  generatedAt?: string;
}

export interface CalendarKpi {
  value: string;
  label: string;
}

export interface PriorityBreakdown {
  high: number;
  medium: number;
  low: number;
  other: number;
}

export interface MonthGroup {
  key: string;
  label: string;
  events: CalendarEvent[];
}

export interface CalendarEventRow {
  title: string;
  site: string;
  type: string;
  dates: string;
  status: string;
  priority: string;
}

/** The four summary KPIs from caller-computed stats (upcoming needs "now", so it is supplied, never derived here). */
export function buildCalendarKpis(stats?: CalendarStats): CalendarKpi[] {
  const s = stats ?? { totalEvents: 0, upcomingCount: 0, completedCount: 0, pendingCount: 0 };
  return [
    { value: String(s.totalEvents), label: 'Total Events' },
    { value: String(s.upcomingCount), label: 'Upcoming' },
    { value: String(s.completedCount), label: 'Completed' },
    { value: String(s.pendingCount), label: 'Pending' },
  ];
}

/** Case-insensitive priority tally; anything unrecognised lands in `other`. */
export function buildPriorityBreakdown(events: CalendarEvent[]): PriorityBreakdown {
  const b: PriorityBreakdown = { high: 0, medium: 0, low: 0, other: 0 };
  for (const e of events) {
    const p = (e.priority || '').trim().toLowerCase();
    if (p === 'high') b.high++;
    else if (p === 'medium') b.medium++;
    else if (p === 'low') b.low++;
    else b.other++;
  }
  return b;
}

/** Group events by calendar month, chronological; unparseable/missing start dates collect under "Undated" last. */
export function groupEventsByMonth(events: CalendarEvent[]): MonthGroup[] {
  const groups = new Map<string, { label: string; sort: number; events: CalendarEvent[] }>();
  for (const e of events) {
    const d = e.startDate ? new Date(e.startDate) : null;
    const valid = !!d && !isNaN(d.getTime());
    const y = valid ? d!.getFullYear() : 0;
    const m = valid ? d!.getMonth() : 0;
    const key = valid ? `${y}-${String(m + 1).padStart(2, '0')}` : 'undated';
    const label = valid ? `${MONTH_NAMES[m]} ${y}` : 'Undated';
    const sort = valid ? y * 12 + m : Number.POSITIVE_INFINITY;
    if (!groups.has(key)) groups.set(key, { label, sort, events: [] });
    groups.get(key)!.events.push(e);
  }
  return [...groups.entries()]
    .sort((a, b) => a[1].sort - b[1].sort)
    .map(([key, g]) => ({ key, label: g.label, events: g.events }));
}

/** One table row per event, with guarded fields and a combined start–end date column. */
export function buildEventRows(events: CalendarEvent[]): CalendarEventRow[] {
  return events.map((e) => {
    const start = formatDate(e.startDate);
    const end = e.endDate ? formatDate(e.endDate) : '';
    return {
      title: e.title?.trim() || '—',
      site: e.siteName?.trim() || '—',
      type: e.eventType?.trim() || '—',
      dates: end && end !== '—' ? `${start} – ${end}` : start,
      status: e.status?.trim() || '—',
      priority: e.priority?.trim() || '—',
    };
  });
}
