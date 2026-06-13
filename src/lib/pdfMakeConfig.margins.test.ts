import { describe, it, expect } from 'vitest';
import { PAGE_CONFIG } from './pdfMakeConfig';

describe('PAGE_CONFIG margins', () => {
  it('top margin is ~64pt (header band), not the ~141pt mm-confusion value', () => {
    const top = PAGE_CONFIG.pageMargins[1];
    expect(top).toBeGreaterThan(50);
    expect(top).toBeLessThan(90); // ~141pt (the mmToPt(50) bug) is excluded
  });
  it('bottom margin leaves room for the footer (~70-110pt)', () => {
    const bottom = PAGE_CONFIG.pageMargins[3];
    expect(bottom).toBeGreaterThan(60);
    expect(bottom).toBeLessThan(120);
  });
});
