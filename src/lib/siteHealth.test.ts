import { describe, it, expect } from 'vitest';
import {
  isMetered, isSnagResolved, isInspectionCompleted,
  factorScores, siteHealthScore, readiness, getHealthBand,
  isGradable, siteGrade, DEFAULT_WEIGHTS,
} from './siteHealth';

const sub = (id: string, over = {}) => ({ id, metering_status: null, meter_serial_number: null, ...over });

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
  it('isInspectionCompleted: completed set', () => {
    expect(isInspectionCompleted({ status: 'Completed' })).toBe(true);
    expect(isInspectionCompleted({ status: 'Pending' })).toBe(false);
  });
});

describe('factorScores', () => {
  it('computes each factor as a site-level percentage', () => {
    const subs = [sub('a', { metering_status: 'Installed' }), sub('b', { meter_serial_number: 'x' }), sub('c')];
    const snags = [
      { subsection_id: 'a', status: 'Open' }, { subsection_id: 'a', status: 'Rectified' },
      { subsection_id: 'b', status: 'Closed' },
    ];
    const insp = [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'b', status: 'Pending' }];
    const f = factorScores(subs, snags, insp);
    expect(f.metering).toBe(67);
    expect(f.snags).toBe(67);
    expect(f.inspections).toBe(33);
  });
  it('no snags => snag factor is 100', () => {
    expect(factorScores([sub('a')], [], []).snags).toBe(100);
  });
  it('no subsections => all factors 100', () => {
    const f = factorScores([], [], []);
    expect(f).toEqual({ metering: 100, snags: 100, inspections: 100 });
  });
  it('multiple completed inspections on one subsection count it once', () => {
    const insp = [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'a', status: 'Done' }];
    expect(factorScores([sub('a'), sub('b')], [], insp).inspections).toBe(50);
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
    const insp = [{ subsection_id: 'ok', status: 'Completed' }];
    const r = readiness(subs, snags, insp);
    expect(r.ready).toBe(1);
    expect(r.total).toBe(2);
    expect(r.failing.metering).toBe(1);
    expect(r.failing.inspection).toBe(1);
    expect(r.failing.snags).toBe(1);
  });
  it('only Critical/High open snags block; Medium/Low do not', () => {
    const subs = [sub('a', { metering_status: 'Installed' })];
    const insp = [{ subsection_id: 'a', status: 'Completed' }];
    const minor = [{ subsection_id: 'a', status: 'Open', risk_level: 'Medium' }];
    expect(readiness(subs, minor, insp).ready).toBe(1);
    const major = [{ subsection_id: 'a', status: 'Open', risk_level: 'High' }];
    expect(readiness(subs, major, insp).ready).toBe(0);
  });
  it('a resolved critical snag does not block', () => {
    const subs = [sub('a', { metering_status: 'Installed' })];
    const insp = [{ subsection_id: 'a', status: 'Completed' }];
    const snags = [{ subsection_id: 'a', status: 'Rectified', risk_level: 'Critical' }];
    expect(readiness(subs, snags, insp).ready).toBe(1);
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

// Status vocabulary is free-text in the DB (no enum/check constraint) and carries mixed
// casing and sign-off variants in prod (e.g. inspection 'Approved', metering 'Active').
// The engine must be tolerant or it silently mis-scores real, completed work.
describe('status vocabulary tolerance', () => {
  it('isInspectionCompleted: terminal sign-off states count (Approved / Signed Off)', () => {
    expect(isInspectionCompleted({ status: 'Approved' })).toBe(true);
    expect(isInspectionCompleted({ status: 'Signed Off' })).toBe(true);
  });
  it('isInspectionCompleted: case-insensitive', () => {
    expect(isInspectionCompleted({ status: 'completed' })).toBe(true);
    expect(isInspectionCompleted({ status: 'DONE' })).toBe(true);
  });
  it('isInspectionCompleted: in-progress states stay false', () => {
    expect(isInspectionCompleted({ status: 'In Progress' })).toBe(false);
    expect(isInspectionCompleted({ status: 'Pending' })).toBe(false);
  });
  it('isSnagResolved: case-insensitive rectified/closed', () => {
    expect(isSnagResolved({ subsection_id: 's', status: 'rectified' })).toBe(true);
    expect(isSnagResolved({ subsection_id: 's', status: 'CLOSED' })).toBe(true);
    expect(isSnagResolved({ subsection_id: 's', status: 'open' })).toBe(false);
  });
  it('isMetered: Active and case variants count', () => {
    expect(isMetered({ id: '1', metering_status: 'Active' })).toBe(true);
    expect(isMetered({ id: '1', metering_status: 'installed' })).toBe(true);
    expect(isMetered({ id: '1', metering_status: 'Missing' })).toBe(false);
  });
});

// C1: absence of data must not read as a clean grade. A site with no subsections, or one
// where no real compliance work has started, must NOT surface a numeric grade/band.
describe('gradability gate', () => {
  const metered = sub('m', { metering_status: 'Installed' });
  it('no subsections => not gradable', () => {
    expect(isGradable([], [], [])).toBe(false);
  });
  it('subsections but no metering and no completed inspection => not gradable', () => {
    expect(isGradable([sub('a'), sub('b')], [{ subsection_id: 'a', status: 'Open' }], [])).toBe(false);
  });
  it('any metered subsection => gradable', () => {
    expect(isGradable([metered, sub('b')], [], [])).toBe(true);
  });
  it('any completed inspection => gradable', () => {
    expect(isGradable([sub('a')], [], [{ subsection_id: 'a', status: 'Completed' }])).toBe(true);
  });
});

describe('siteGrade (gated overall grade)', () => {
  it('not gradable => ungraded band and null score', () => {
    const g = siteGrade([], [], []);
    expect(g.gradable).toBe(false);
    expect(g.score).toBeNull();
    expect(g.band).toBe('ungraded');
  });
  it('gradable => weighted score and a normal band', () => {
    const subs = [sub('a', { metering_status: 'Installed' })];
    const insp = [{ subsection_id: 'a', status: 'Completed' }];
    const g = siteGrade(subs, [], insp);
    expect(g.gradable).toBe(true);
    expect(g.score).toBe(siteHealthScore(factorScores(subs, [], insp)));
    expect(['success', 'warning', 'danger']).toContain(g.band);
  });
});
