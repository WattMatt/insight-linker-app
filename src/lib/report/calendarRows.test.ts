import { describe, it, expect } from 'vitest';
import {
  buildCalendarKpis,
  buildPriorityBreakdown,
  groupEventsByMonth,
  buildEventRows,
  type CalendarEvent,
} from './calendarRows';

describe('buildCalendarKpis', () => {
  it('maps caller stats in order', () => {
    const kpis = buildCalendarKpis({ totalEvents: 10, upcomingCount: 4, completedCount: 5, pendingCount: 1 });
    expect(kpis.map((k) => k.label)).toEqual(['Total Events', 'Upcoming', 'Completed', 'Pending']);
    expect(kpis.map((k) => k.value)).toEqual(['10', '4', '5', '1']);
  });
  it('zeroes out when stats are absent (no NaN/undefined)', () => {
    expect(buildCalendarKpis(undefined).map((k) => k.value)).toEqual(['0', '0', '0', '0']);
  });
});

describe('buildPriorityBreakdown', () => {
  it('tallies case-insensitively and buckets the rest', () => {
    const b = buildPriorityBreakdown([
      { priority: 'High' }, { priority: 'high' }, { priority: 'MEDIUM' },
      { priority: 'low' }, { priority: 'urgent' }, {},
    ]);
    expect(b).toEqual({ high: 2, medium: 1, low: 1, other: 2 });
  });
});

describe('groupEventsByMonth', () => {
  it('groups chronologically with full month-year labels', () => {
    const groups = groupEventsByMonth([
      { id: 'b', startDate: '2026-03-10' },
      { id: 'a', startDate: '2026-01-05' },
      { id: 'c', startDate: '2026-03-22' },
    ]);
    expect(groups.map((g) => g.label)).toEqual(['January 2026', 'March 2026']);
    expect(groups[1].events.map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('collects missing/invalid start dates under "Undated" last', () => {
    const groups = groupEventsByMonth([
      { id: 'x', startDate: 'not-a-date' },
      { id: 'y', startDate: '2026-02-01' },
      { id: 'z' },
    ]);
    expect(groups.map((g) => g.label)).toEqual(['February 2026', 'Undated']);
    expect(groups[1].events.map((e) => e.id)).toEqual(['x', 'z']);
  });

  it('returns no groups for an empty list', () => {
    expect(groupEventsByMonth([])).toEqual([]);
  });
});

describe('buildEventRows', () => {
  const base: CalendarEvent = {
    title: 'Annual Inspection', siteName: 'Abaqulusi Plaza', eventType: 'Inspection',
    startDate: '2026-06-13', endDate: '2026-06-14', status: 'Scheduled', priority: 'High',
  };

  it('maps fields and combines the date range', () => {
    const [row] = buildEventRows([base]);
    expect(row).toEqual({
      title: 'Annual Inspection', site: 'Abaqulusi Plaza', type: 'Inspection',
      dates: '13 June 2026 – 14 June 2026', status: 'Scheduled', priority: 'High',
    });
  });

  it('shows only the start date when there is no end date', () => {
    const [row] = buildEventRows([{ ...base, endDate: undefined }]);
    expect(row.dates).toBe('13 June 2026');
  });

  it('falls back to em-dash for blank fields (no silent empty cells)', () => {
    const [row] = buildEventRows([{ startDate: '2026-06-13' }]);
    expect(row.title).toBe('—');
    expect(row.site).toBe('—');
    expect(row.type).toBe('—');
    expect(row.status).toBe('—');
    expect(row.priority).toBe('—');
  });
});
