/**
 * Run an async mapper over items with a bounded concurrency, preserving order.
 * A watchlist is hundreds of films; TMDb shares a rate limit across /find,
 * /search and /watch-providers, so we never fan out unbounded.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await mapper(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
