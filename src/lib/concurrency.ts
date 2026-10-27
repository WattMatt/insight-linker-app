/**
 * Run `fn` over `items` with at most `limit` calls in flight; resolves when all have settled.
 * Rejections propagate after the in-flight calls finish (same contract as Promise.all, minus the burst).
 */
export async function forEachLimited<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (next < items.length && !failure) {
      const i = next++;
      try {
        await fn(items[i], i);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
}
