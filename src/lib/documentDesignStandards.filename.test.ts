import { describe, it, expect } from 'vitest';
import { generateDocumentFilename } from './documentDesignStandards';

describe('generateDocumentFilename', () => {
  it('stamps the LOCAL date, not UTC', () => {
    // 13 June 2026 local midnight — UTC-based formatting could roll to the 12th.
    const name = generateDocumentFilename('inspection', 'Acme Site', new Date(2026, 5, 13));
    expect(name).toContain('2026-06-13');
    expect(name.endsWith('.pdf')).toBe(true);
  });
  it('sanitizes unsafe characters in the site name', () => {
    const name = generateDocumentFilename('inspection', 'A/B C*?', new Date(2026, 5, 13));
    expect(name).not.toMatch(/[\/*?]/);
  });
});
