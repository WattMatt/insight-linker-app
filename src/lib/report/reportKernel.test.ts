import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, localDateStamp, percent, clampPageNumbers } from './reportKernel';

describe('formatDate', () => {
  it('formats a valid date day-first, full month, padded day', () => {
    expect(formatDate(new Date(2026, 5, 13))).toBe('13 June 2026'); // month 5 = June
  });
  it('pads single-digit days', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('05 January 2026');
  });
  it('accepts ISO date-only strings', () => {
    expect(formatDate('2026-06-13')).toBe('13 June 2026');
  });
  it('returns the fallback for empty / null / undefined (does NOT default to today)', () => {
    expect(formatDate('')).toBe('—');
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
  });
  it('returns the fallback for an unparseable date (never "Invalid Date")', () => {
    expect(formatDate('not-a-date')).toBe('—');
    expect(formatDate('2026-13-45')).toBe('—');
  });
  it('honors a custom fallback', () => {
    expect(formatDate(null, 'N/A')).toBe('N/A');
  });
});

describe('formatDateTime', () => {
  it('formats date + 24h time, short month', () => {
    expect(formatDateTime(new Date(2026, 5, 13, 14, 30))).toBe('13 Jun 2026, 14:30');
  });
  it('pads hours and minutes', () => {
    expect(formatDateTime(new Date(2026, 5, 13, 9, 5))).toBe('13 Jun 2026, 09:05');
  });
  it('returns the fallback for bad input', () => {
    expect(formatDateTime('nope')).toBe('—');
  });
});

describe('localDateStamp', () => {
  it('emits YYYY-MM-DD from LOCAL components (not UTC)', () => {
    expect(localDateStamp(new Date(2026, 5, 13))).toBe('2026-06-13');
    expect(localDateStamp(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('falls back to now for missing input (filenames always get a date)', () => {
    expect(localDateStamp()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('percent', () => {
  it('rounds a normal ratio', () => {
    expect(percent(1, 4)).toBe('25%');
    expect(percent(2, 3)).toBe('67%');
  });
  it('guards divide-by-zero (no NaN%)', () => {
    expect(percent(0, 0)).toBe('0%');
    expect(percent(5, 0)).toBe('0%');
  });
  it('guards NaN inputs', () => {
    expect(percent(NaN, 10)).toBe('0%');
  });
  it('honors a custom fallback', () => {
    expect(percent(1, 0, '—')).toBe('—');
  });
});

describe('clampPageNumbers', () => {
  it('passes through when not skipping the cover', () => {
    expect(clampPageNumbers(2, 5, false)).toEqual({ page: 2, total: 5 });
  });
  it('shifts by one when skipping the cover', () => {
    expect(clampPageNumbers(2, 5, true)).toEqual({ page: 1, total: 4 });
  });
  it('never returns 0 or negative (no "Page 0 of 0")', () => {
    expect(clampPageNumbers(1, 1, true)).toEqual({ page: 1, total: 1 });
  });
  it('never lets page exceed total', () => {
    expect(clampPageNumbers(5, 4, false)).toEqual({ page: 4, total: 4 });
  });
});
