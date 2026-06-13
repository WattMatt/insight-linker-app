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

  it('coc: only required subsections count; not_required when none required', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [
        { id: 'a', name: 'A', is_coc_required: true, coc_status: 'Pass' },
        { id: 'b', name: 'B', is_coc_required: true, coc_status: 'Failed' },
        { id: 'c', name: 'C', is_coc_required: false, coc_status: null },
      ],
    }));
    const d = get(s, 'coc');
    expect(d.done).toBe(1);
    expect(d.total).toBe(2);
    expect(d.status).toBe('outstanding');
    expect(d.blocking).toBe(true);

    const none = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A', is_coc_required: false, coc_status: null }],
    }));
    expect(get(none, 'coc').status).toBe('not_required');
  });

  it('inspections: per-subsection completion', () => {
    const s = computeSiteDeliverables(baseInput({
      subsections: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      inspections: [{ subsection_id: 'a', status: 'Completed' }, { subsection_id: 'b', status: 'Pending' }],
    }));
    const d = get(s, 'inspections');
    expect(d.done).toBe(1);
    expect(d.total).toBe(2);
    expect(d.outstandingItems[0].subsectionId).toBe('b');
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
  it('schematic / asset / thermal / summary derive from presence', () => {
    const s = computeSiteDeliverables(baseInput({
      hasSchematic: true,
      assetCount: 3,
      documentCategories: ['05 Thermal Reports', 'Site Summary Reports'],
    }));
    expect(get(s, 'schematic').status).toBe('complete');
    expect(get(s, 'asset_register').status).toBe('complete');
    expect(get(s, 'thermal').status).toBe('complete');
    expect(get(s, 'summary_report').status).toBe('complete');

    const empty = computeSiteDeliverables(baseInput());
    expect(get(empty, 'schematic').status).toBe('outstanding');
    expect(get(empty, 'schematic').outstandingItems[0].label).toBe('Upload schematic');
  });
});

describe('computeSiteDeliverables — aggregation', () => {
  it('empty site: all binary outstanding, count categories complete/not_required, band danger', () => {
    const s = computeSiteDeliverables(baseInput());
    // snags(0/0 complete), inspections(0/0 complete), metering(not_required), coc(not_required),
    // 4 binary outstanding -> complete 2 of applicable 6 => 33%
    expect(s.completeCount).toBe(2);
    expect(s.applicableCount).toBe(6);
    expect(s.completionPct).toBe(33);
    expect(s.band).toBe('danger');
    expect(s.outstandingCount).toBe(4);
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
      subsections: [{ id: 'a', name: 'A', is_coc_required: true, coc_status: 'Failed' }],
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
