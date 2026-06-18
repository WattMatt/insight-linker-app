import { describe, it, expect } from 'vitest';
import { scorePercentage } from './inspectionScore';

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
