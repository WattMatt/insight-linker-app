import { describe, it, expect } from 'vitest';
import { SYSTEM_REPORT_CATEGORIES, isSystemReportCategory } from './reportCategories';

describe('reportCategories', () => {
  it('includes every getReportCategoryName output + the fallback', () => {
    expect(SYSTEM_REPORT_CATEGORIES).toContain('Site Summary Reports');
    expect(SYSTEM_REPORT_CATEGORIES).toContain('Marking Checklists');
    expect(SYSTEM_REPORT_CATEGORIES).toContain('Generated Reports');
  });

  it('matches exact names case-sensitively', () => {
    expect(isSystemReportCategory('Inspection Reports')).toBe(true);
    expect(isSystemReportCategory('inspection reports')).toBe(false);
    expect(isSystemReportCategory('02 Manuals')).toBe(false);
  });
});
