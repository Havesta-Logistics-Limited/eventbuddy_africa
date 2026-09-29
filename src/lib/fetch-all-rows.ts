// Supabase's API caps every response at 1000 rows (the project's `max_rows`), and
// returns the first 1000 with no error when a query matches more — so a bare
// `.select("*")` on a table that outgrows that silently loses the rest. Anything
// that needs *every* matching row (dashboard counts, exports, recipient lists)
// has to page through with .range().

const PAGE_SIZE = 1000;

// How many pages to have in flight at once. Fired concurrently rather than one
// at a time because the admin dashboard re-runs this fetch on a 30s heartbeat
// (see useRevalidateOnFocus) as well as on every window focus — at that
// frequency, N sequential round trips for one growing table is the difference
// between a live dashboard and a sluggish one. 6 pages covers up to 6000 rows
// (an event comfortably past the 5000+ leads orgs have reported) in a single
// round trip; beyond that it takes one extra round trip per additional 6000.
const BATCH_PAGES = 6;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Runs `fetchPage(from, to)` for consecutive .range() windows, several at a time,
 *  until a short (or empty) page comes back, and returns every row collected up to
 *  that point. The query must have a stable `.order(...)` (e.g. `id`) or rows can be
 *  skipped/duplicated between pages — offsets are independent requests, not a cursor.
 *  On any page error, returns that error and whatever was collected so far — callers
 *  should treat `error` as "incomplete", not "empty". */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PageResult<T>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let batchStart = 0; ; batchStart += BATCH_PAGES * PAGE_SIZE) {
    const batch = await Promise.all(
      Array.from({ length: BATCH_PAGES }, (_, i) => {
        const from = batchStart + i * PAGE_SIZE;
        return fetchPage(from, from + PAGE_SIZE - 1);
      })
    );
    for (const { data, error } of batch) {
      if (error) return { data: rows, error };
      const page = data ?? [];
      rows.push(...page);
      // A page short of PAGE_SIZE means we've reached the end — any pages after
      // it in this batch are past the end too (offsets are monotonic), so stop
      // without looking at them rather than trusting their (empty) content.
      if (page.length < PAGE_SIZE) return { data: rows, error: null };
    }
  }
}
