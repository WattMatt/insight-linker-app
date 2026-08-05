#!/usr/bin/env node
// Type-error ratchet.
//
// `tsc --noEmit` cannot be a pass/fail gate yet — the tree carries a recorded
// backlog — so the gate is "no worse than typecheck-baseline.json". The baseline is
// a ceiling that only ever moves down; this script fails the build when the real
// count exceeds it, and tells you to lower it when the count drops below.
//
// What is counted is defined by tsconfig.json's exclude list, not by this script:
// the " 2" Finder duplicates and the *.PULLED-FROM-PROD.ts Deno sources are excluded
// there so that deleting scratch files can never look like fixing type errors.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(REPO_ROOT, 'typecheck-baseline.json');
const TSC_BIN = path.join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

// One diagnostic per line under --pretty false: `file.ts(12,5): error TS2345: …`.
// Follow-on "Type 'null' is not assignable…" detail lines carry no code and must
// not be counted; neither must tsc's trailing "Found N errors" summary.
const DIAGNOSTIC = /(?:^|\s)error TS\d+/;

export function countTypeErrors(tscOutput) {
  return tscOutput.split('\n').filter((line) => DIAGNOSTIC.test(line)).length;
}

export function readBaseline(baselineJson) {
  const parsed = JSON.parse(baselineJson);
  if (!Number.isInteger(parsed.maxErrors) || parsed.maxErrors < 0) {
    throw new Error('typecheck-baseline.json: maxErrors must be a non-negative integer');
  }
  return parsed.maxErrors;
}

export function evaluateRatchet(count, baseline, opts = {}) {
  const { noun = 'type errors', baselineFile = 'typecheck-baseline.json' } = opts;
  if (count > baseline) {
    return {
      ok: false,
      verdict: 'regressed',
      message:
        `${count} ${noun}, baseline is ${baseline} — ${count - baseline} new. ` +
        `Fix them; do not raise ${baselineFile}.`,
    };
  }
  if (count < baseline) {
    return {
      ok: true,
      verdict: 'improved',
      message:
        `${count} ${noun}, baseline is ${baseline}. ` +
        `Lower maxErrors in ${baselineFile} to ${count} so the gain is held.`,
    };
  }
  return { ok: true, verdict: 'held', message: `${count} ${noun}, at the baseline of ${baseline}.` };
}

function main() {
  const baseline = readBaseline(readFileSync(BASELINE_PATH, 'utf8'));

  const tsc = spawnSync(process.execPath, [TSC_BIN, '--noEmit', '--pretty', 'false'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (tsc.error) throw tsc.error;

  const output = `${tsc.stdout ?? ''}${tsc.stderr ?? ''}`;
  const count = countTypeErrors(output);

  // tsc exits non-zero both for diagnostics and for its own failures (bad config,
  // missing files). Zero diagnostics with a non-zero exit is the second case, and
  // would otherwise read as a perfect score.
  if (count === 0 && tsc.status !== 0) {
    process.stderr.write(output);
    throw new Error(`tsc exited ${tsc.status} without emitting any diagnostics`);
  }

  const result = evaluateRatchet(count, baseline);
  process.stdout.write(`${result.ok ? 'ok' : 'FAIL'}: ${result.message}\n`);
  if (!result.ok) {
    process.stdout.write(output);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main();
