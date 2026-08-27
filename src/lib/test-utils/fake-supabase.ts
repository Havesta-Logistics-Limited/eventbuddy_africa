/**
 * A minimal, in-memory stand-in for a Supabase client — just enough of the
 * chainable `.from().select().eq().maybeSingle()` surface (plus insert/update
 * and `.rpc()`) to exercise real branching logic (paystack.ts's finalize/
 * fulfillment path) without a live database. Not a general-purpose mock of
 * the whole supabase-js API — only the methods this codebase's server-side
 * code actually calls are implemented; extend as needed rather than reaching
 * for a heavier mocking library.
 */

type Row = Record<string, unknown>;

let nextId = 1;
function fakeId() {
  return `fake-id-${nextId++}`;
}

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const db: Record<string, Row[]> = {};
  for (const [table, rows] of Object.entries(seed)) db[table] = rows.map((r) => ({ ...r }));
  const rpcHandlers: Record<string, (params: Record<string, unknown>) => unknown> = {};

  function from(table: string) {
    db[table] = db[table] || [];
    const filters: [string, unknown][] = [];
    let pendingInsert: Row[] | null = null;
    let pendingUpdate: Row | null = null;

    function matches(row: Row) {
      return filters.every(([col, val]) => row[col] === val);
    }

    function applyAndGetRows(): Row[] {
      if (pendingInsert) {
        const inserted = pendingInsert.map((r) => ({ id: fakeId(), created_at: new Date(0).toISOString(), ...r }));
        db[table].push(...inserted);
        return inserted;
      }
      if (pendingUpdate) {
        const matched = db[table].filter(matches);
        matched.forEach((row) => Object.assign(row, pendingUpdate));
        return matched;
      }
      return db[table].filter(matches);
    }

    const builder = {
      select() {
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      insert(row: Row | Row[]) {
        pendingInsert = Array.isArray(row) ? row : [row];
        return builder;
      },
      update(patch: Row) {
        pendingUpdate = patch;
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      async maybeSingle() {
        const rows = applyAndGetRows();
        return { data: rows[0] ?? null, error: null };
      },
      async single() {
        const rows = applyAndGetRows();
        return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: "Row not found", code: "PGRST116" } };
      },
      // Real supabase-js query builders are thenable — code that awaits a
      // chain without a terminal .select()/.single()/.maybeSingle() (a
      // fire-and-forget update) relies on this.
      then(resolve: (result: { data: Row[] | null; error: null }) => void) {
        const rows = applyAndGetRows();
        resolve({ data: rows, error: null });
      },
    };
    return builder;
  }

  function rpc(name: string, params: Record<string, unknown>) {
    const handler = rpcHandlers[name];
    return Promise.resolve({ data: handler ? handler(params) : null, error: null });
  }

  return {
    from,
    rpc,
    db,
    setRpc(name: string, fn: (params: Record<string, unknown>) => unknown) {
      rpcHandlers[name] = fn;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
