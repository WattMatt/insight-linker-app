import { describe, it, expect } from 'vitest';
import { formatPdfDate, formatPdfDateTime } from './pdfBranding';

describe('pdfBranding date formatters (delegated to kernel)', () => {
  it('formatPdfDate uses day-first kernel output', () => {
    expect(formatPdfDate(new Date(2026, 5, 13))).toBe('13 June 2026');
  });
  it('formatPdfDate returns "—" for an invalid string (not "Invalid Date")', () => {
    expect(formatPdfDate('garbage')).toBe('—');
  });
  it('formatPdfDate returns "—" for empty (no longer defaults to today)', () => {
    expect(formatPdfDate('')).toBe('—');
  });
  it('formatPdfDateTime uses kernel datetime output', () => {
    expect(formatPdfDateTime(new Date(2026, 5, 13, 14, 30))).toBe('13 Jun 2026, 14:30');
  });
});
