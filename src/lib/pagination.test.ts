import { describe, it, expect } from 'vitest';
import { getPageRange, getPageCount, clampPage, getPageWindow, ELLIPSIS } from './pagination';

describe('getPageRange', () => {
  it('computes zero-based inclusive range for page 1', () => {
    expect(getPageRange(1, 20)).toEqual({ from: 0, to: 19 });
  });
  it('computes range for a later page', () => {
    expect(getPageRange(3, 20)).toEqual({ from: 40, to: 59 });
  });
  it('coerces bad input to page 1 / size 1', () => {
    expect(getPageRange(0, 20)).toEqual({ from: 0, to: 19 });
    expect(getPageRange(-5, 20)).toEqual({ from: 0, to: 19 });
    expect(getPageRange(2, 0)).toEqual({ from: 1, to: 1 });
  });
});

describe('getPageCount', () => {
  it('rounds up partial pages', () => {
    expect(getPageCount(21, 20)).toBe(2);
    expect(getPageCount(40, 20)).toBe(2);
    expect(getPageCount(41, 20)).toBe(3);
  });
  it('is at least 1 even for an empty list', () => {
    expect(getPageCount(0, 20)).toBe(1);
  });
  it('handles non-finite/negative totals', () => {
    expect(getPageCount(NaN, 20)).toBe(1);
    expect(getPageCount(-10, 20)).toBe(1);
  });
});

describe('clampPage', () => {
  it('keeps an in-range page', () => {
    expect(clampPage(3, 5)).toBe(3);
  });
  it('clamps above and below', () => {
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(0, 5)).toBe(1);
  });
});

describe('getPageWindow', () => {
  it('lists every page when within maxButtons', () => {
    expect(getPageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('shows leading pages with a trailing ellipsis near the start', () => {
    expect(getPageWindow(2, 10)).toEqual([1, 2, 3, ELLIPSIS, 10]);
  });
  it('shows both ellipses in the middle', () => {
    expect(getPageWindow(5, 10)).toEqual([1, ELLIPSIS, 4, 5, 6, ELLIPSIS, 10]);
  });
  it('shows a leading ellipsis near the end', () => {
    expect(getPageWindow(10, 10)).toEqual([1, ELLIPSIS, 9, 10]);
  });
  it('always keeps first and last page', () => {
    const w = getPageWindow(5, 20);
    expect(w[0]).toBe(1);
    expect(w[w.length - 1]).toBe(20);
  });
});
