/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, afterEach } from 'vitest';
import { getOnline } from './onlineStatus';

function defineOnLine(value: unknown) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value });
}

describe('getOnline', () => {
  afterEach(() => defineOnLine(true));

  it('returns navigator.onLine when it is a boolean', () => {
    defineOnLine(false);
    expect(getOnline()).toBe(false);
    defineOnLine(true);
    expect(getOnline()).toBe(true);
  });

  it('defaults to online when navigator.onLine is not a boolean (SSR / Node has no onLine)', () => {
    defineOnLine(undefined);
    expect(getOnline()).toBe(true);
  });
});
