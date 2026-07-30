#!/usr/bin/env node
// Lint-error ratchet — the eslint counterpart of typecheck-ratchet.mjs, sharing its
// comparison logic.
//
// `eslint .` cannot be a pass/fail gate yet: the tree carries a recorded backlog of
// errors (and a much larger one of warnings, downgraded in eslint.config.mjs). A gate
// that is red on every run is a gate everyone learns to ignore, so the gate is instead
// "no worse than lint-baseline.json" — a ceiling that only ever moves down.
//
// Only severity-2 messages count. Warnings are deliberately outside the ratchet: there
// are thousands, and holding a line on them would freeze the backlog rather than shrink
// the errors that matter. eslint runs under --quiet for that reason: a full JSON report
// of this tree is ~70MB and overflows the child-process pipe, while the errors-only
// report is ~340KB.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readBaseline, evaluateRatchet } from './typecheck-ratchet.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = path.join(REPO_ROOT, 'lint-baseline.json');
const ESLINT_BIN = path.join(REPO_ROOT, 'node_modules', 'eslint', 'bin', 'eslint.js');

export function countLintErrors(eslintJson) {
  return JSON.parse(eslintJson).reduce(
    (total, file) => total + file.messages.filter((m) => m.severity === 2).length,
    0,
  );
}

export function formatWorstOffenders(eslintJson, limit = 10) {
  const byRule = new Map();
  for (const file of JSON.parse(eslintJson)) {
    for (const m of file.messages) {
      if (m.severity !== 2) continue;
      byRule.set(m.ruleId ?? '(no rule)', (byRule.get(m.ruleId ?? '(no rule)') ?? 0) + 1);
    }
  }
  return [...byRule.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([rule, n]) => `  ${String(n).padStart(4)}  ${rule}`)
    .join('\n');
}

function main() {
  const baseline = readBaseline(readFileSync(BASELINE_PATH, 'utf8'));

  const eslint = spawnSync(process.execPath, [ESLINT_BIN, '.', '-f', 'json', '--quiet'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (eslint.error) throw eslint.error;

  // eslint exits 1 for lint errors and 2 for its own failures (bad config, bad glob).
  // Only the second is fatal here; anything else and an unparseable stdout would read
  // as a clean tree.
  if (eslint.status === 2 || !eslint.stdout?.trim()) {
    process.stderr.write(`${eslint.stdout ?? ''}${eslint.stderr ?? ''}`);
    throw new Error(`eslint exited ${eslint.status} without usable JSON output`);
  }

  const count = countLintErrors(eslint.stdout);
  const result = evaluateRatchet(count, baseline, {
    noun: 'lint errors',
    baselineFile: 'lint-baseline.json',
  });

  process.stdout.write(`${result.ok ? 'ok' : 'FAIL'}: ${result.message}\n`);
  if (!result.ok) {
    process.stdout.write(`\nBy rule:\n${formatWorstOffenders(eslint.stdout)}\n`);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) main();
