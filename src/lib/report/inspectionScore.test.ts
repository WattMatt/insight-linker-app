import { describe, it, expect } from 'vitest';
import { scorePercentage, itemStatusKind } from './inspectionScore';

describe('itemStatusKind', () => {
  it('maps boolean values', () => {
    expect(itemStatusKind({ value: true })).toBe('pass');
    expect(itemStatusKind({ value: false })).toBe('fail');
  });
  it('maps pass/fail vocabulary case-insensitively', () => {
    expect(itemStatusKind({ value: 'Pass' })).toBe('pass');
    expect(itemStatusKind({ value: 'compliant' })).toBe('pass');
    expect(itemStatusKind({ value: 'FAIL' })).toBe('fail');
    expect(itemStatusKind({ value: 'non-compliant' })).toBe('fail');
  });
  it('treats N/A, pending, and empty as pending (not assessed)', () => {
    expect(itemStatusKind({ value: 'N/A' })).toBe('pending');
    expect(itemStatusKind({ value: 'pending' })).toBe('pending');
    expect(itemStatusKind({ value: '' })).toBe('pending');
    expect(itemStatusKind({})).toBe('pending');
  });
});

describe('scorePercentage — pending / N-A items do not penalise', () => {
  it('all assessed items passed -> 100% even when pending/N-A items exist', () => {
    // Yarona-Ackermans: 17 pass, 0 fail, 5 pending. Old formula (17/22) = 77%; now 100%.
    expect(scorePercentage(17, 0)).toBe(100);
  });

  it('only assessed items count in the denominator', () => {
    expect(scorePercentage(3, 1)).toBe(75); // 3 / (3 + 1)
  });

  it('a real fail still lowers the score', () => {
    expect(scorePercentage(1, 1)).toBe(50);
  });

  it('nothing assessed -> 100 (nothing failed, so not penalised)', () => {
    expect(scorePercentage(0, 0)).toBe(100);
  });
});
