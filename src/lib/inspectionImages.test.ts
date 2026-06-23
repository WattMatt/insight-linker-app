import { describe, it, expect } from 'vitest';
import { countInspectionPhotos, inspectionHasImages } from './inspectionImages';

describe('countInspectionPhotos', () => {
  it('counts photos in section items', () => {
    const json = { sectionA: { item1: { photos: ['u1', 'u2'] }, item2: { photos: ['u3'] } } };
    expect(countInspectionPhotos(json)).toBe(3);
  });
  it('counts tenant meter/breaker/ctRatio images', () => {
    const json = { tenants: [{ meterImage: 'm', breakerImage: 'b' }, { ctRatioImage: 'c' }] };
    expect(countInspectionPhotos(json)).toBe(3);
  });
  it('ignores the generalInfo section', () => {
    const json = { generalInfo: { item: { photos: ['x'] } } };
    expect(countInspectionPhotos(json)).toBe(0);
  });
  it('returns 0 for empty / null / undefined / non-object', () => {
    expect(countInspectionPhotos({})).toBe(0);
    expect(countInspectionPhotos(null)).toBe(0);
    expect(countInspectionPhotos(undefined)).toBe(0);
    expect(countInspectionPhotos('nope')).toBe(0);
  });
  it('tolerates null tenants in the array', () => {
    const json = { tenants: [null, { meterImage: 'm' }] };
    expect(countInspectionPhotos(json)).toBe(1);
  });
});

describe('inspectionHasImages', () => {
  it('true when >=1 image, false otherwise', () => {
    expect(inspectionHasImages({ json_data: { s: { i: { photos: ['u'] } } } })).toBe(true);
    expect(inspectionHasImages({ json_data: {} })).toBe(false);
    expect(inspectionHasImages({ json_data: null })).toBe(false);
    expect(inspectionHasImages(null)).toBe(false);
    expect(inspectionHasImages(undefined)).toBe(false);
  });
});
