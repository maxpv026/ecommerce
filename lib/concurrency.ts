/**
 * Runs `task` over `items` with at most `size` in flight at once, waiting for
 * each chunk to settle before starting the next. Settles every item — one
 * failure never stops the rest — and keeps a large recipient list inside a
 * serverless time limit without opening hundreds of SMTP connections at once.
 */
export async function inChunks<T, R>(items: readonly T[], size: number, task: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += size) {
    results.push(...(await Promise.allSettled(items.slice(i, i + size).map(task))));
  }
  return results;
}
