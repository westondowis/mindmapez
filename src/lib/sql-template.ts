/**
 * Minimal shared SQL surface, satisfied by both Neon (`pg`) and PGLite. Both the
 * tagged-template and `.query()` forms resolve to an array of row objects:
 *
 *   const rows = await sql`select * from todos where id = ${id}`; // parameterized
 *   const rows2 = await sql.query("select * from todos where id = $1", [id]);
 *
 * Kept free of runtime imports so server modules and node tests can share it.
 */
export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

/** Runs `fn` inside one database transaction; commits on success, rolls back on throw. */
export type TxRunner = <T>(fn: (sql: Sql) => Promise<T>) => Promise<T>;

export type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
export function makeSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Rebuild with $1, $2, … placeholders so values stay parameterized.
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);
  return sql;
}
