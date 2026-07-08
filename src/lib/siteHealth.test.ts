import { describe, it, expect } from 'vitest';
import {
  isMetered, isSnagResolved, isInspectionCompleted,
  factorScores, siteHealthScore, computeSiteHealth, readiness, getHealthBand,
  DEFAULT_WEIGHTS,
} from './siteHealth';

const sub = (id: string, over = {}) => ({ id, metering_status: null, meter_serial_number: null, ...over });

// Inspection json_data carrying at least one photo (sections form).
const PHOTO_JSON = { sec: { item: { photos: ['u1'] } } };
const withPhoto = (subsection_id: string, over: Record<string, unknown> = {}) =>
  ({ subsection_id, json_data: PHOTO_JSON, ...over });

describe('predicates', () => {
  it('isMetered: installed status', () => {
    expect(isMetered({ id: '1', metering_status: 'Installed' })).toBe(true);
  });
  it('isMetered: serial number present', () => {
    expect(isMetered({ id: '1', meter_serial_number: 'SN-9' })).toBe(true);
  });
  it('isMetered: neither', () => {
    expect(isMetered({ id: '1', metering_status: 'Pending' })).toBe(false);
  });
  it('isSnagResolved: Rectified and Closed count, Open does not', () => {
    expect(isSnagResolved({ subsection_id: 's', status: 'Rectified' })).toBe(true);
    expect(isSnagResolved({ subsection_id: 's', status: 'Closed' })).toBe(true);
    expect(isSnagResolved({ subsection_id: 's', status: 'Open' })).toBe(false);
  });
  it('isSnagResolved: case-insensitive — lowercase rectified/closed still count', () => {
    expect(isSnagResolved({ subsection_id: 's', status: 'rectified' })).toBe(true);
    expect(isSnagResolved({ subsection_id: 's', status: 'closed' })).toBe(true);
    expect(isSnagResolved({ subsection_id: 's', status: null })).toBe(false);
  });
  it('isInspectionCompleted: existence-based — any inspection counts', () => {
    expect(isInspectionCompleted({ status: 'Completed' })).toBe(true);
    expect(isInspectionCompleted({ status: 'Pending' })).toBe(true);
  });
});

describe('factorScores', () => {
  it('computes each factor as a site-level percentage', () => {
    const subs = [sub('a', { metering_status: 'Installed' }), sub('b', { meter_serial_number: 'x' }), sub('c')];
    const snags = [
      { subsection_id: 'a', status: 'Open' }, { subsection_id: 'a', status: 'Rectified' },
      { subsection_id: 'b', status: 'Closed' },
    ];
    // Image-based: both inspections carry a photo, so 2 of 3 subsections are inspected.
    const insp = [withPhoto('a'), withPhoto('b')];
    const f = factorScores(subs, snags, insp);
    expect(f.metering).toBe(67);
    expect(f.snags).toBe(67);
    expect(f.inspections).toBe(67);
  });
  it('no snags => snag factor is 100', () => {
    expect(factorScores([sub('a')], [], []).snags).toBe(100);
  });
  it('no subsections => all factors 0 (unpopulated site is zero progress, never vacuously perfect)', () => {
    const f = factorScores([], [], []);
    expect(f).toEqual({ metering: 0, snags: 0, inspections: 0 });
  });
  it('multiple inspections on one subsection count it once', () => {
    const insp = [withPhoto('a'), withPhoto('a')];
    expect(factorScores([sub('a'), sub('b')], [], insp).inspections).toBe(50);
  });
  it('an inspection with no images does NOT count as inspected', () => {
    const subs = [sub('a'), sub('b')];
    const insp = [{ subsection_id: 'a', json_data: {} }, withPhoto('b')]; // a empty, b populated
    expect(factorScores(subs, [], insp).inspections).toBe(50);
  });
});

describe('siteHealthScore', () => {
  it('applies the safety weights', () => {
    expect(siteHealthScore({ metering: 87, snags: 61, inspections: 80 })).toBe(74);
  });
  it('uses DEFAULT_WEIGHTS that sum to 1', () => {
    const sum = DEFAULT_WEIGHTS.snags + DEFAULT_WEIGHTS.inspections + DEFAULT_WEIGHTS.metering;
    expect(Math.round(sum * 100)).toBe(100);
  });
});

describe('readiness', () => {
  it('a subsection is ready only when metered, no blocking open snag, and inspected', () => {
    const subs = [sub('ok', { metering_status: 'Installed' }), sub('bad')];
    const snags = [{ subsection_id: 'bad', status: 'Open', risk_level: 'Critical' }];
    const insp = [withPhoto('ok')];
    const r = readiness(subs, snags, insp);
    expect(r.ready).toBe(1);
    expect(r.total).toBe(2);
    expect(r.failing.metering).toBe(1);
    expect(r.failing.inspection).toBe(1);
    expect(r.failing.snags).toBe(1);
  });
  it('only Critical/High open snags block; Medium/Low do not', () => {
    const subs = [sub('a', { metering_status: 'Installed' })];
    const insp = [withPhoto('a')];
    const minor = [{ subsection_id: 'a', status: 'Open', risk_level: 'Medium' }];
    expect(readiness(subs, minor, insp).ready).toBe(1);
    const major = [{ subsection_id: 'a', status: 'Open', risk_level: 'High' }];
    expect(readiness(subs, major, insp).ready).toBe(0);
  });
  it('a resolved critical snag does not block', () => {
    const subs = [sub('a', { metering_status: 'Installed' })];
    const insp = [withPhoto('a')];
    const snags = [{ subsection_id: 'a', status: 'Rectified', risk_level: 'Critical' }];
    expect(readiness(subs, snags, insp).ready).toBe(1);
  });
  it('an empty (image-less) inspection leaves the subsection inspection-failing', () => {
    const subs = [sub('a', { metering_status: 'Installed' })];
    const insp = [{ subsection_id: 'a', json_data: {} }];
    const r = readiness(subs, [], insp);
    expect(r.failing.inspection).toBe(1);
    expect(r.ready).toBe(0);
  });
});

describe('getHealthBand', () => {
  it('band cutoffs at 80 and 50', () => {
    expect(getHealthBand(80)).toBe('success');
    expect(getHealthBand(79)).toBe('warning');
    expect(getHealthBand(50)).toBe('warning');
    expect(getHealthBand(49)).toBe('danger');
  });
});

describe('computeSiteHealth — the canonical entry point', () => {
  it('an EMPTY site (zero subsections) scores 0 — never a fabricated 100', () => {
    expect(computeSiteHealth([], [], []).score).toBe(0);
  });
  it('a populated site scores exactly siteHealthScore(factorScores(...))', () => {
    const subs = [sub('a', { metering_status: 'Installed' }), sub('b')];
    const snags = [{ subsection_id: 'a', status: 'Open', risk_level: 'Low' }];
    const insp = [withPhoto('a')];
    const result = computeSiteHealth(subs, snags, insp);
    expect(result.score).toBe(siteHealthScore(factorScores(subs, snags, insp)));
  });
  it('factor-level empty scopes inside a populated site remain vacuously 100', () => {
    // one subsection, metered, inspection-waived, zero snags → all factors 100 → score 100
    const subs = [sub('a', { metering_status: 'Installed', is_inspection_required: false })];
    expect(computeSiteHealth(subs, [], []).score).toBe(100);
  });
});

describe('inspection-not-applicable waiver', () => {
  it('factorScores: a waived subsection is excluded from the inspection denominator', () => {
    const subs = [
      { id: 'a' },                                 // required, inspected
      { id: 'b' },                                 // required, NOT inspected
      { id: 'c', is_inspection_required: false },  // waived
    ];
    const insps = [withPhoto('a')];
    // Required = a,b. Inspected = a. Factor = 1/2 = 50 (c neither counts nor drags).
    expect(factorScores(subs, [], insps).inspections).toBe(50);
  });

  it('factorScores: all-waived site scores 100 on inspections (vacuous)', () => {
    const subs = [{ id: 'a', is_inspection_required: false }];
    expect(factorScores(subs, [], []).inspections).toBe(100);
  });

  it('readiness: a waived subsection is not counted as inspection-failing', () => {
    const subs = [
      { id: 'a', metering_status: 'Installed', is_inspection_required: false },
      { id: 'b', metering_status: 'Installed' }, // required, not inspected -> fails inspection
    ];
    const r = readiness(subs, [], []);
    expect(r.failing.inspection).toBe(1); // only b
    expect(r.ready).toBe(1);              // a is ready (metered, no snag, inspection waived)
  });
});
