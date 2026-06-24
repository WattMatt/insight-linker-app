export type FileOutcome =
  | { name: string; state: "uploaded"; poolId: string; detectedCertNo: string | null }
  | { name: string; state: "failed"; error: string };

export interface UploadSummary { total: number; uploaded: number; failed: number }

/** Run `worker` over items with a bounded number in flight; preserves output order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;
  const runners = new Array(Math.min(Math.max(1, limit), total || 1)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= total) return;
      results[i] = await worker(items[i], i);
      done++;
      onProgress?.(done, total);
    }
  });
  await Promise.all(runners);
  return results;
}

export function summarizeUpload(outcomes: FileOutcome[]): UploadSummary {
  let uploaded = 0, failed = 0;
  for (const o of outcomes) (o.state === "uploaded" ? uploaded++ : failed++);
  return { total: outcomes.length, uploaded, failed };
}
