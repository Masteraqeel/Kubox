// Database access. Production uses Postgres through `pg`. Development and tests
// use PGlite, which is real Postgres compiled to WebAssembly, so the SQL is identical.
export interface Q {
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface DB extends Q {
  exec(sql: string): Promise<void>;
  tx<T>(fn: (q: Q) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDb(url?: string, dataDir?: string): Promise<DB> {
  if (url) {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    return {
      query: (sql, params) => pool.query(sql, params as any[]) as any,
      exec: async sql => { await pool.query(sql); },
      tx: async fn => {
        const client = await pool.connect();
        try {
          await client.query('begin');
          const out = await fn({ query: (sql, params) => client.query(sql, params as any[]) as any });
          await client.query('commit');
          return out;
        } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
      },
      close: () => pool.end()
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = new PGlite(dataDir);
  return {
    query: (sql, params) => lite.query(sql, params as any[]) as any,
    exec: async sql => { await lite.exec(sql); },
    tx: fn => lite.transaction(t => fn({ query: (sql, params) => t.query(sql, params as any[]) as any })) as any,
    close: () => lite.close()
  };
}
