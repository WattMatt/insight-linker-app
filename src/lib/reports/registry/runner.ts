// Sequential report runner. Pure apart from the injected generator, so ordering, stop and
// failure handling are unit-testable. One failing report never aborts the run.
import { REPORT_TYPE_ORDER, type GenerateResult, type ReportTarget } from "./types";

export function orderTargets(targets: ReportTarget[]): ReportTarget[] {
  const rank = (t: ReportTarget) => REPORT_TYPE_ORDER.indexOf(t.type);
  return [...targets].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
}

export interface RunSummary {
  saved: number;
  failed: number;
  /** Selected but not attempted because the run was stopped. */
  skipped: number;
  supersedeBlocked: number;
  durationMs: number;
  stopped: boolean;
}

export interface RunOptions {
  generate: (target: ReportTarget) => Promise<GenerateResult>;
  /** Checked before each report; the report in progress always finishes. */
  shouldStop: () => boolean;
  onStart?: (target: ReportTarget, index: number, total: number) => void;
  onDone?: (target: ReportTarget, result: GenerateResult, index: number, total: number) => void;
}

export async function runReportTargets(targets: ReportTarget[], opts: RunOptions): Promise<RunSummary> {
  const queue = orderTargets(targets);
  const started = Date.now();
  const summary: RunSummary = { saved: 0, failed: 0, skipped: 0, supersedeBlocked: 0, durationMs: 0, stopped: false };

  for (let i = 0; i < queue.length; i++) {
    if (opts.shouldStop()) {
      summary.stopped = true;
      summary.skipped = queue.length - i;
      break;
    }
    const target = queue[i];
    opts.onStart?.(target, i, queue.length);
    const result = await opts.generate(target);

    console.info("[reports]", {
      key: target.key,
      ok: result.ok,
      durationMs: result.durationMs,
      ...(result.ok
        ? { bytes: result.bytes, photoCount: result.photoCount, superseded: result.superseded, supersedeBlocked: result.supersedeBlocked }
        : { error: result.error }),
    });

    if (result.ok) {
      summary.saved++;
      summary.supersedeBlocked += result.supersedeBlocked;
    } else {
      summary.failed++;
    }
    opts.onDone?.(target, result, i, queue.length);
  }

  summary.durationMs = Date.now() - started;
  console.info("[reports] run complete", summary);
  return summary;
}
