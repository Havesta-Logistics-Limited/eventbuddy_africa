// Supabase's API caps every response at 1000 rows (the project's `max_rows`), and
// returns the first 1000 with no error when a query matches more — so a bare
// `.select("*")` on a table that outgrows that silently loses the rest. Anything
// that needs *every* matching row (dashboard counts, exports, recipient lists)
// has to page through with .range().

const PAGE_SIZE = 1000;

type PageResult<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Runs `fetchPage(from, to)` repeatedly until a short page comes back and returns
 *  every row. The query must have a stable `.order(...)` (e.g. `id`) or rows can be
 *  skipped/duplicated between pages. On any page error, returns that error and
 *  whatever was collected so far — callers should treat `error` as "incomplete". */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PageResult<T>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { data: rows, error: null };
  }
}
