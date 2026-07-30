import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { countTypeErrors, readBaseline, evaluateRatchet } from './typecheck-ratchet.mjs';

// Verbatim shape of `tsc --noEmit --pretty false`: diagnostics carry a TS code,
// the indented elaboration lines that follow them do not.
const TSC_OUTPUT = [
  "src/views/Dashboard.tsx(186,11): error TS2322: Type 'null' is not assignable to type 'string'.",
  "  Type 'null' is not assignable to type 'string | undefined'.",
  "src/hooks/useSiteScores.ts(26,5): error TS2769: No overload matches this call.",
  "    Argument of type 'string' is not assignable to parameter of type 'never'.",
  'src/lib/pdfMakeConfig.ts(8,3): error TS7005: Variable implicitly has an any[] type.',
  'Found 3 errors in 3 files.',
  '',
].join('\n');

describe('countTypeErrors', () => {
  it('counts one per diagnostic, not per output line', () => {
    expect(countTypeErrors(TSC_OUTPUT)).toBe(3);
  });

  it('ignores the summary line, which names errors but carries no code', () => {
    expect(countTypeErrors('Found 171 errors in 46 files.\n')).toBe(0);
  });

  it('counts a config-level diagnostic that has no file prefix', () => {
    expect(countTypeErrors("error TS5083: Cannot read file 'tsconfig.json'.\n")).toBe(1);
  });

  it('returns 0 for a clean run', () => {
    expect(countTypeErrors('')).toBe(0);
  });
});

describe('evaluateRatchet', () => {
  it('fails when the count exceeds the baseline', () => {
    const result = evaluateRatchet(81, 80);
    expect(result.ok).toBe(false);
    expect(result.verdict).toBe('regressed');
    expect(result.message).toContain('1 new');
  });

  it('passes at exactly the baseline', () => {
    expect(evaluateRatchet(80, 80)).toMatchObject({ ok: true, verdict: 'held' });
  });

  it('passes below the baseline and names the figure to ratchet down to', () => {
    const result = evaluateRatchet(72, 80);
    expect(result.ok).toBe(true);
    expect(result.verdict).toBe('improved');
    expect(result.message).toContain('72');
  });

  it('passes at zero errors against a zero baseline', () => {
    expect(evaluateRatchet(0, 0)).toMatchObject({ ok: true, verdict: 'held' });
  });
});

describe('readBaseline', () => {
  it('reads the committed baseline file', () => {
    const committed = readFileSync(new URL('../typecheck-baseline.json', import.meta.url), 'utf8');
    expect(readBaseline(committed)).toBeGreaterThanOrEqual(0);
  });

  it('rejects a baseline that is missing, fractional or negative', () => {
    expect(() => readBaseline('{}')).toThrow(/maxErrors/);
    expect(() => readBaseline('{"maxErrors":8.5}')).toThrow(/maxErrors/);
    expect(() => readBaseline('{"maxErrors":-1}')).toThrow(/maxErrors/);
  });
});
