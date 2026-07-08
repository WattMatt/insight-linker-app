import { describe, it, expect } from 'vitest';
import { buildSiteScoreMap, latestSnapshotPerSite, type SnapshotScoreRow } from './siteScores';
import { factorScores, siteHealthScore } from './siteHealth';

const snap = (site_id: string, captured_at: string, health_score: number | null, total_subsections = 5): SnapshotScoreRow =>
  ({ site_id, captured_at, health_score, total_subsections });

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

  it('ignores unscored rows for POPULATED sites so they cannot mask an older scored row', () => {
    const latest = latestSnapshotPerSite([
      snap('a', '2026-07-06', 70),
      snap('a', '2026-07-07', null, 5), // populated but scoreless — carries no answer
    ]);
    expect(latest.get('a')?.health_score).toBe(70);
    expect(latest.get('a')?.captured_at).toBe('2026-07-06');
  });

  it('an EMPTY-site row (total_subsections=0) IS the latest answer — it means 0%', () => {
    const latest = latestSnapshotPerSite([
      snap('a', '2026-07-06', 70, 5),
      snap('a', '2026-07-07', null, 0), // site emptied / recorded empty — newer answer wins
    ]);
    expect(latest.get('a')?.captured_at).toBe('2026-07-07');
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

  it('a covered EMPTY site scores 0 — an unpopulated site must NEVER read as 100', () => {
    const scores = buildSiteScoreMap(['new-site'], [], {
      coveredSiteIds: ['new-site'], subsections: [], snags: [], inspections: [],
    });
    expect(scores.get('new-site')?.healthScore).toBe(0);
    expect(scores.get('new-site')?.source).toBe('live');
  });

  it('a legacy snapshot that stored 100 (or NULL) for an empty site is served as 0', () => {
    // Defends against pre-backfill rows: total_subsections=0 overrides any stored score.
    const legacy100 = buildSiteScoreMap(['a'], [snap('a', '2026-07-07', 100, 0)], noLive);
    expect(legacy100.get('a')?.healthScore).toBe(0);
    expect(legacy100.get('a')?.source).toBe('snapshot');
    const legacyNull = buildSiteScoreMap(['a'], [snap('a', '2026-07-07', null, 0)], noLive);
    expect(legacyNull.get('a')?.healthScore).toBe(0);
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
