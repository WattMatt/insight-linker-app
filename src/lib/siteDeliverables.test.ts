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
