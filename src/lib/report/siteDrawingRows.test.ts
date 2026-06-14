import { describe, it, expect } from 'vitest';
import {
  buildSiteDrawingPinRows,
  buildSiteDrawingInfo,
  type SiteDrawingPin,
} from './siteDrawingRows';

describe('buildSiteDrawingPinRows', () => {
  it('orders by pin number and counts images', () => {
    const pins: SiteDrawingPin[] = [
      { number: 3, title: 'C', images: [{ url: 'a' }, { url: 'b' }] },
      { number: 1, title: 'A' },
      { number: 2, title: 'B', images: [{ url: 'c' }] },
    ];
    const rows = buildSiteDrawingPinRows(pins);
    expect(rows.map((r) => r.number)).toEqual(['1', '2', '3']);
    expect(rows.map((r) => r.images)).toEqual(['0', '1', '2']);
  });

  it('guards blank title/description', () => {
    const [row] = buildSiteDrawingPinRows([{ number: 1, title: '  ', description: '' }]);
    expect(row.title).toBe('—');
    expect(row.description).toBe('—');
  });

  it('does not mutate the input array order', () => {
    const pins: SiteDrawingPin[] = [{ number: 2 }, { number: 1 }];
    buildSiteDrawingPinRows(pins);
    expect(pins.map((p) => p.number)).toEqual([2, 1]);
  });
});

describe('buildSiteDrawingInfo', () => {
  it('formats date and uses supplied totalPins', () => {
    const meta = buildSiteDrawingInfo(
      { projectName: 'P', inspectorName: 'I', date: '2026-06-13', location: 'L', totalPins: 5 },
      2,
    );
    expect(meta).toEqual([
      { label: 'Project', value: 'P' },
      { label: 'Inspector', value: 'I' },
      { label: 'Date', value: '13 June 2026' },
      { label: 'Location', value: 'L' },
      { label: 'Total Pins', value: '5' },
    ]);
  });

  it('falls back to the actual pin count and em-dashes for missing fields', () => {
    const meta = buildSiteDrawingInfo(undefined, 7);
    expect(meta.find((m) => m.label === 'Total Pins')!.value).toBe('7');
    expect(meta.find((m) => m.label === 'Date')!.value).toBe('—');
    expect(meta.find((m) => m.label === 'Project')!.value).toBe('—');
  });
});
