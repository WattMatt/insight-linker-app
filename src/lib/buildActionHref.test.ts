import { describe, it, expect } from 'vitest';
import { buildActionHref } from './buildActionHref';
import type { OutstandingItem } from './siteDeliverables';

const ctx = { clientId: 'c1', siteId: 's1' };
const item = (over: Partial<OutstandingItem>): OutstandingItem => ({
  id: 'i', category: 'schematic', label: 'x', severity: 'none', blocking: false, ...over,
});

describe('buildActionHref', () => {
  it('site-level document deliverables', () => {
    expect(buildActionHref(item({ category: 'schematic' }), ctx)).toBe('/clients/c1/sites/s1?tab=schematic');
    expect(buildActionHref(item({ category: 'asset_register' }), ctx)).toBe('/clients/c1/sites/s1?tab=asset-verification');
    expect(buildActionHref(item({ category: 'thermal' }), ctx)).toBe('/clients/c1/sites/s1?tab=documents&upload=thermal');
    expect(buildActionHref(item({ category: 'summary_report' }), ctx)).toBe('/clients/c1/sites/s1?tab=reports&generate=1');
  });
  it('subsection-level deliverables route into the subsection', () => {
    const sub = { subsectionId: 'sub9' };
    expect(buildActionHref(item({ category: 'coc', ...sub }), ctx)).toBe('/clients/c1/sites/s1/subsections/sub9?tab=coc-metering');
    expect(buildActionHref(item({ category: 'metering', ...sub }), ctx)).toBe('/clients/c1/sites/s1/subsections/sub9?tab=coc-metering&focus=meter');
    expect(buildActionHref(item({ category: 'inspections', ...sub }), ctx)).toBe('/clients/c1/sites/s1/subsections/sub9?tab=inspections&create=1');
    expect(buildActionHref(item({ id: 'snag5', category: 'snags', ...sub }), ctx)).toBe('/clients/c1/sites/s1/subsections/sub9?tab=overview&snag=snag5');
  });
  it('subsection deliverable without subsectionId falls back to the subsections tab', () => {
    for (const category of ['coc', 'metering', 'inspections', 'snags'] as const) {
      expect(buildActionHref(item({ category }), ctx)).toBe('/clients/c1/sites/s1?tab=subsections');
    }
  });
});
