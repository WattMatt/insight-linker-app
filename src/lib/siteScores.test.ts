import { describe, it, expect } from 'vitest';
import { buildSiteScoreMap, latestSnapshotPerSite, type SnapshotScoreRow } from './siteScores';
import { factorScores, siteHealthScore } from './siteHealth';

const snap = (site_id: string, captured_at: string, health_score: number | null): SnapshotScoreRow =>
  ({ site_id, captured_at, health_score });

const noLive = { coveredSiteIds: [], subsections: [], snags: [], inspections: [] };

describe('latestSnapshotPerSite', () => {
  it('keeps the newest scored row per site regardless of input order', () => {
    const latest = latestSnapshotPerSite([
      snap('a', '2026-07-06', 70),
      snap('a', '2026-07-07', 82),
      snap('a', '2026-07-05', 60),
      snap('b', '2026-07-07', 55),
    ]);
    expect(latest.get('a')?.health_score).toBe(82);
    expect(latest.get('b')?.health_score).toBe(55);
  });

  it('ignores rows without a health score so they cannot mask an older scored row', () => {
    const latest = latestSnapshotPerSite([
      snap('a', '2026-07-06', 70),
      snap('a', '2026-07-07', null),
    ]);
    expect(latest.get('a')?.health_score).toBe(70);
    expect(latest.get('a')?.captured_at).toBe('2026-07-06');
  });
});

describe('buildSiteScoreMap', () => {
  it('prefers the snapshot and reports its capture date', () => {
    const scores = buildSiteScoreMap(['a'], [snap('a', '2026-07-07', 82)], noLive);
    expect(scores.get('a')).toEqual({
      siteId: 'a',
      healthScore: 82,
      capturedAt: '2026-07-07',
      source: 'snapshot',
    });
  });

  it('live fallback computes the IDENTICAL canonical formula the capture job uses', () => {
    const subsections = [
      { id: 's1', site_id: 'a', metering_status: 'Installed', meter_serial_number: null, is_inspection_required: true },
      { id: 's2', site_id: 'a', metering_status: null, meter_serial_number: null, is_inspection_required: false },
    ];
    const snags = [
      { subsection_id: 's1', status: 'Open', risk_level: 'High' },
      { subsection_id: 's1', status: 'Rectified', risk_level: 'Low' },
    ];
    const inspections = [{ subsection_id: 's1', site_id: 'a', json_data: { section: { item: { photos: ['x.jpg'] } } } }];

    const scores = buildSiteScoreMap(['a'], [], {
      coveredSiteIds: ['a'], subsections, snags, inspections,
    });

    const expected = siteHealthScore(factorScores(subsections, snags, inspections));
    expect(scores.get('a')).toEqual({
      siteId: 'a',
      healthScore: expected,
      capturedAt: null,
      source: 'live',
    });
  });

  it('a covered site with zero rows scores 100 (empty-scope convention)', () => {
    const scores = buildSiteScoreMap(['new-site'], [], {
      coveredSiteIds: ['new-site'], subsections: [], snags: [], inspections: [],
    });
    expect(scores.get('new-site')?.healthScore).toBe(100);
    expect(scores.get('new-site')?.source).toBe('live');
  });

  it('an uncovered site with no snapshot is absent — callers render a pending state, never a fake number', () => {
    const scores = buildSiteScoreMap(['a'], [], noLive);
    expect(scores.has('a')).toBe(false);
  });

  it('attributes snags via their subsection and inspections via subsection when site_id is missing', () => {
    const subsections = [
      { id: 's1', site_id: 'a', metering_status: 'Installed', meter_serial_number: null, is_inspection_required: true },
      { id: 's9', site_id: 'b', metering_status: 'Installed', meter_serial_number: null, is_inspection_required: true },
    ];
    // Snag on b's subsection must not affect a; inspection carries no site_id on purpose.
    const snags = [{ subsection_id: 's9', status: 'Open', risk_level: 'Critical' }];
    const inspections = [{ subsection_id: 's1', json_data: { sec: { item: { photos: ['p.jpg'] } } } }];

    const scores = buildSiteScoreMap(['a', 'b'], [], {
      coveredSiteIds: ['a', 'b'], subsections, snags, inspections,
    });

    expect(scores.get('a')?.healthScore).toBe(
      siteHealthScore(factorScores([subsections[0]], [], inspections)),
    );
    expect(scores.get('b')?.healthScore).toBe(
      siteHealthScore(factorScores([subsections[1]], snags, [])),
    );
  });
});
