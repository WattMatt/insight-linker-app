import { describe, it, expect } from 'vitest';
import {
  categoryMatches, THERMAL_CATEGORY_PATTERNS, SUMMARY_CATEGORY_PATTERNS,
  DELIVERABLE_ORDER, DELIVERABLE_LABELS,
} from './siteDeliverables';

describe('document category matching', () => {
  it('matches thermal/infrared category strings (incl. legacy)', () => {
    expect(categoryMatches(['05 Thermal Reports'], THERMAL_CATEGORY_PATTERNS)).toBe(true);
    expect(categoryMatches(['Infrared scan'], THERMAL_CATEGORY_PATTERNS)).toBe(true);
    expect(categoryMatches(['Thermographic survey'], THERMAL_CATEGORY_PATTERNS)).toBe(true);
    // "IR" alone must NOT match — it means Insulation Resistance in this domain, not infrared.
    expect(categoryMatches(['IR test results'], THERMAL_CATEGORY_PATTERNS)).toBe(false);
    expect(categoryMatches(['01 COC', null, undefined], THERMAL_CATEGORY_PATTERNS)).toBe(false);
    expect(categoryMatches([], THERMAL_CATEGORY_PATTERNS)).toBe(false);
  });
  it('matches site summary report category strings', () => {
    expect(categoryMatches(['Site Summary Reports'], SUMMARY_CATEGORY_PATTERNS)).toBe(true);
    expect(categoryMatches(['Compliance Reports'], SUMMARY_CATEGORY_PATTERNS)).toBe(false);
  });
});

describe('constants', () => {
  it('has 8 ordered deliverables with labels', () => {
    expect(DELIVERABLE_ORDER).toHaveLength(8);
    expect(Object.keys(DELIVERABLE_LABELS)).toHaveLength(8);
    expect(DELIVERABLE_ORDER[0]).toBe('snags');
    // LABELS and ORDER must stay in sync (guards Task 3's indexOf-based sort).
    expect([...DELIVERABLE_ORDER].sort()).toEqual(Object.keys(DELIVERABLE_LABELS).sort());
  });
});

import { computeSiteDeliverables, type SiteDeliverablesInput } from './siteDeliverables';

const baseInput = (over: Partial<SiteDeliverablesInput> = {}): SiteDeliverablesInput => ({
  siteId: 'site-1', siteName: 'Site 1',
  subsections: [], snags: [], inspections: [],
  hasSchematic: false, assetCount: 0, documentCategories: [],
  ...over,
});
const get = (s: ReturnType<typeof computeSiteDeliverables>, key: string) =>
  s.deliverables.find(d => d.key === key)!;

describe('computeSiteDeliverables — counts', () => {
  it('snags: resolved vs open, blocking on Critical/High open', () => {
    const s = computeSiteDeliverables(baseInput({
      snags: [
        { id: 'n1', subsection_id: 'a', status: 'Open', risk_level: 'Critical', title: 'Bad' },
        { id: 'n2', subsection_id: 'a', status: 'Rectified', risk_level: 'Low', title: 'Fixed' },
        { id: 'n3', subsection_id: 'b', status: 'Open', risk_level: 'Low', title: 'Minor' },
      ],
    }));
    const d = get(s, 'snags');
    expect(d.done).toBe(1);
    expect(d.total).toBe(3);
    expect(d.status).toBe('outstanding');
    expect(d.blocking).toBe(true);
    expect(d.outstandingItems).toHaveLength(2);
  });

  it('coc: a recorded verdict (Pass OR Fail) counts as done; only Missing/Pending stay outstanding', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [
        { id: 'a', name: 'A', is_coc_required: true, coc_status: 'Pass' },
        { id: 'b', name: 'B', is_coc_required: true, coc_status: 'Failed' },
        { id: 'p', name: 'P', is_coc_required: true, coc_status: 'Pending' },
        { id: 'm', name: 'M', is_coc_required: true, coc_status: 'Missing' },
        { id: 'c', name: 'C', is_coc_required: false, coc_status: null },
      ],
    }));
    const d = get(s, 'coc');
    expect(d.done).toBe(2);   // Pass + Fail are both "assessed"
    expect(d.total).toBe(4);  // 4 required (c is not_required)
    expect(d.status).toBe('outstanding');
    expect(d.outstandingItems.map(i => i.subsectionId).sort()).toEqual(['m', 'p']);

    const allAssessed = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A', is_coc_required: true, coc_status: 'Fail' }],
    }));
    expect(get(allAssessed, 'coc').status).toBe('complete'); // a recorded Fail clears the item

    const none = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A', is_coc_required: false, coc_status: null }],
    }));
    expect(get(none, 'coc').status).toBe('not_required');
  });

  it('inspections: existence-based — any inspection marks a subsection done', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      // Status is ignored now; both subsections have an inspection, so both count.
      inspections: [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'b', status: 'Pending' }],
    }));
    const d = get(s, 'inspections');
    expect(d.done).toBe(2);
    expect(d.total).toBe(2);
    expect(d.outstandingItems.length).toBe(0);
  });

  it('metering: excludes Not Required from total', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [
        { id: 'a', name: 'A', metering_status: 'Installed' },
        { id: 'b', name: 'B', metering_status: 'Pending' },
        { id: 'c', name: 'C', metering_status: 'Not Required' },
      ],
    }));
    const d = get(s, 'metering');
    expect(d.done).toBe(1);
    expect(d.total).toBe(2);
    expect(d.status).toBe('outstanding');
  });
});

describe('computeSiteDeliverables — binary docs', () => {
  it('schematic / asset / summary derive from presence', () => {
    const s = computeSiteDeliverables(baseInput({
      hasSchematic: true,
      assetCount: 3,
      documentCategories: ['Site Summary Reports'],
    }));
    expect(get(s, 'schematic').status).toBe('complete');
    expect(get(s, 'asset_register').status).toBe('complete');
    expect(get(s, 'summary_report').status).toBe('complete');

    const empty = computeSiteDeliverables(baseInput());
    expect(get(empty, 'schematic').status).toBe('outstanding');
    expect(get(empty, 'schematic').outstandingItems[0].label).toBe('Upload schematic');
  });
});

describe('computeSiteDeliverables — thermal (per-subsection, required-where-applicable)', () => {
  it('not_required when no subsection is flagged thermal-required (a site never holds one)', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A' }],
      // Even with a site-level "thermal" category present, thermal is NOT site-derived anymore.
      documentCategories: ['05 Thermal Reports'],
    }));
    expect(get(s, 'thermal').status).toBe('not_required');
  });

  it('counts only thermal-required subsections; outstanding = required-but-missing', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [
        { id: 'a', name: 'A', is_thermal_required: true },
        { id: 'b', name: 'B', is_thermal_required: true },
        { id: 'c', name: 'C', is_thermal_required: false },
      ],
      thermalDocSubsectionIds: ['a'],
    }));
    const d = get(s, 'thermal');
    expect(d.kind).toBe('count');
    expect(d.done).toBe(1);
    expect(d.total).toBe(2);
    expect(d.status).toBe('outstanding');
    expect(d.outstandingItems).toHaveLength(1);
    expect(d.outstandingItems[0].subsectionId).toBe('b');
  });

  it('complete when every required subsection has a thermal doc', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A', is_thermal_required: true }],
      thermalDocSubsectionIds: ['a'],
    }));
    expect(get(s, 'thermal').status).toBe('complete');
  });
});

describe('computeSiteDeliverables — inspection-not-applicable', () => {
  it('waived subsections drop out of the inspection count and outstanding list', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [
        { id: 'a', name: 'A' },                                // required, no inspection
        { id: 'b', name: 'B', is_inspection_required: false }, // waived
      ],
      inspections: [],
    }));
    const d = get(s, 'inspections');
    expect(d.total).toBe(1);                       // only A counts
    expect(d.done).toBe(0);
    expect(d.status).toBe('outstanding');
    expect(d.outstandingItems.map(i => i.subsectionId)).toEqual(['a']); // B not listed
  });

  it('a site whose every subsection waives inspection reads not_required', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A', is_inspection_required: false }],
    }));
    expect(get(s, 'inspections').status).toBe('not_required');
  });
});

describe('computeSiteDeliverables — outstanding COC copy distinguishes missing vs pending', () => {
  it('labels Missing and Pending differently; an assessed Fail is NOT outstanding', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [
        { id: 'm', name: 'M', is_coc_required: true, coc_status: 'Missing' },
        { id: 'p', name: 'P', is_coc_required: true, coc_status: 'Pending' },
        { id: 'f', name: 'F', is_coc_required: true, coc_status: 'Fail' },
      ],
    }));
    const items = get(s, 'coc').outstandingItems;
    expect(items.map(i => i.subsectionId).sort()).toEqual(['m', 'p']); // 'f' assessed -> done
    const byId = Object.fromEntries(items.map(i => [i.subsectionId, i]));
    expect(byId['m'].label).toContain('COC missing');
    expect(byId['m'].actionLabel).toBe('Set COC');
    expect(byId['p'].label).toContain('COC awaiting verdict');
    expect(byId['p'].actionLabel).toBe('Verify COC');
  });
});

describe('computeSiteDeliverables — aggregation', () => {
  it('empty site: binary docs outstanding, count categories complete/not_required, band danger', () => {
    const s = computeSiteDeliverables(baseInput());
    // snags(0/0 complete), inspections(not_required), coc/metering/thermal(not_required),
    // schematic+asset+summary outstanding -> complete 1 of applicable 4 => 25%
    expect(s.completeCount).toBe(1);
    expect(s.applicableCount).toBe(4);
    expect(s.completionPct).toBe(25);
    expect(s.band).toBe('danger');
    expect(s.outstandingCount).toBe(3);
    expect(s.blockingCount).toBe(0);
  });

  it('all complete => 100% and success band', () => {
    const s = computeSiteDeliverables(baseInput({
      hasSchematic: true, assetCount: 1,
      documentCategories: ['Thermal', 'Site Summary Reports'],
    }));
    expect(s.completionPct).toBe(100);
    expect(s.band).toBe('success');
  });
});

describe('computeSiteDeliverables — nextTasks ordering', () => {
  it('orders blocking items first, then by severity, before non-blocking', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A', is_coc_required: true, coc_status: 'Missing' }],
      snags: [
        { id: 'low', subsection_id: 'a', status: 'Open', risk_level: 'Low', title: 'Minor' },
        { id: 'crit', subsection_id: 'a', status: 'Open', risk_level: 'Critical', title: 'Severe' },
      ],
    }));
    // Blocking first: Critical snag (severity critical) then COC (severity high); both before the low snag.
    expect(s.nextTasks[0].id).toBe('crit');
    expect(s.nextTasks[0].blocking).toBe(true);
    expect(s.nextTasks[1].category).toBe('coc');
    expect(s.nextTasks[1].blocking).toBe(true);
    const critIndex = s.nextTasks.findIndex(t => t.id === 'crit');
    const lowIndex = s.nextTasks.findIndex(t => t.id === 'low');
    expect(lowIndex).toBeGreaterThan(critIndex);
    expect(s.nextTasks[lowIndex].blocking).toBe(false);
  });
});

import { summarizeSitesForTriage } from './siteDeliverables';

describe('summarizeSitesForTriage', () => {
  it('ranks blocking first, then outstanding count, then completion asc', () => {
    const blocking = baseInput({
      siteId: 'blk', siteName: 'Blocking',
      subsections: [{ id: 'a', name: 'A', is_coc_required: true, coc_status: 'Missing' }],
    });
    const manyOutstanding = baseInput({
      siteId: 'many', siteName: 'Many',
      subsections: [
        { id: 'a', name: 'A', metering_status: 'Pending' },
        { id: 'b', name: 'B', metering_status: 'Pending' },
      ],
    });
    const clean = baseInput({
      siteId: 'clean', siteName: 'Clean',
      hasSchematic: true, assetCount: 1,
      documentCategories: ['Thermal', 'Site Summary Reports'],
    });
    const rows = summarizeSitesForTriage([clean, manyOutstanding, blocking]);
    expect(rows.map(r => r.siteId)).toEqual(['blk', 'many', 'clean']);
    expect(rows[0].blockingCount).toBeGreaterThan(0);
    expect(rows[0].byCategory.coc.status).toBe('outstanding');
  });
});

describe('summarizeSitesForTriage — tiebreaks', () => {
  it('tier 2: equal blocking, more outstanding ranks first', () => {
    const fewer = baseInput({
      siteId: 'fewer', siteName: 'Fewer',
      hasSchematic: false, assetCount: 1,
      documentCategories: ['Thermal', 'Site Summary Reports'],
    }); // 1 outstanding (schematic only), blocking 0
    const more = baseInput({
      siteId: 'more', siteName: 'More',
      hasSchematic: false, assetCount: 0, documentCategories: [],
    }); // 4 outstanding (all binary), blocking 0
    const rows = summarizeSitesForTriage([fewer, more]);
    expect(rows[0].blockingCount).toBe(0);
    expect(rows[1].blockingCount).toBe(0);
    expect(rows.map(r => r.siteId)).toEqual(['more', 'fewer']); // more outstanding first
  });

  it('tier 3: equal blocking and outstanding, lower completion ranks first', () => {
    const lower = baseInput({
      siteId: 'lower', siteName: 'Lower',
      hasSchematic: false, assetCount: 1,
      documentCategories: ['Thermal', 'Site Summary Reports'],
    }); // outstanding 1 (schematic), applicable 6, complete 5 => 83%
    const higher = baseInput({
      siteId: 'higher', siteName: 'Higher',
      subsections: [{ id: 's', name: 'S', metering_status: 'Installed', is_coc_required: true, coc_status: 'Pass' }],
      inspections: [{ subsection_id: 's', status: 'Completed' }],
      hasSchematic: false, assetCount: 1,
      documentCategories: ['Thermal', 'Site Summary Reports'],
    }); // outstanding 1 (schematic), applicable 8, complete 7 => 88%
    const rows = summarizeSitesForTriage([higher, lower]);
    expect(rows[0].blockingCount).toBe(0);
    expect(rows[0].outstandingCount).toBe(rows[1].outstandingCount); // tie on outstanding
    expect(rows.map(r => r.siteId)).toEqual(['lower', 'higher']); // lower completion first
  });
});
