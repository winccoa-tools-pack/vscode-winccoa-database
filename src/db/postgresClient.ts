import { Client } from 'pg';
import * as vscode from 'vscode';

export interface HistoryPoint {
  ms: number;                    // milliseconds since epoch
  value: number | string | null;
}

export class PostgresClient {
  private get pgConfig() {
    const cfg = vscode.workspace.getConfiguration('winccoa-database.postgres');
    return {
      host: cfg.get<string>('host') ?? '127.0.0.1',
      port: cfg.get<number>('port') ?? 15432,
      database: cfg.get<string>('database') ?? 'winccoa',
      user: cfg.get<string>('user') ?? 'para',
      password: cfg.get<string>('password') ?? '',
      connectionTimeoutMillis: 5000,
    };
  }

  get isConfigured(): boolean {
    const pw = vscode.workspace.getConfiguration('winccoa-database.postgres').get<string>('password') ?? '';
    return pw !== '';
  }

  async testConnection(): Promise<boolean> {
    const client = new Client(this.pgConfig);
    try {
      await client.connect();
      return true;
    } catch {
      return false;
    } finally {
      await client.end().catch(() => {});
    }
  }

  /**
   * Query historical values for a DPE from the NGA PostgreSQL archive.
   *
   * @param elementName  Full DPE name as stored in elements.element_name, e.g. "System1:Tank1.level"
   * @param fromMs       Start of time range (milliseconds since epoch, inclusive)
   * @param toMs         End of time range (milliseconds since epoch, inclusive)
   * @param limit        Maximum number of samples to return (default 500)
   */
  async getHistory(
    elementName: string,
    fromMs: number,
    toMs: number,
    limit = 500,
  ): Promise<HistoryPoint[]> {
    const client = new Client(this.pgConfig);
    try {
      await client.connect();

      // Resolve the element_id for this DPE name
      const elRes = await client.query<{ element_id: string }>(
        `SELECT CAST(element_id AS TEXT) AS element_id FROM winccoa.elements WHERE element_name = $1`,
        [elementName],
      );
      if (elRes.rows.length === 0) return [];
      const elementId = elRes.rows[0].element_id;

      // Convert milliseconds → nanoseconds (as string to preserve precision)
      const fromNs = String(BigInt(fromMs) * 1_000_000n);
      const toNs = String(BigInt(toMs) * 1_000_000n);

      // Find all analog and discrete event tables in the winccoa schema
      const tablesRes = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'winccoa'
           AND table_name ~ '^_event_[0-9]+_[ad]$'
           AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
      );
      if (tablesRes.rows.length === 0) return [];

      // Validate table names (already filtered by regex above, extra safety)
      const safeTables = tablesRes.rows
        .map(r => r.table_name)
        .filter(n => /^_event_\d+_[ad]$/.test(n));
      if (safeTables.length === 0) return [];

      // Build a UNION ALL across all event tables
      const parts = safeTables.map(
        n =>
          `SELECT CAST(ts AS TEXT) AS ts, value_number, value_string FROM winccoa."${n}"` +
          ` WHERE element_id = $1::bigint AND ts >= $2::bigint AND ts <= $3::bigint`,
      );
      const sql =
        `SELECT ts, value_number, value_string FROM (${parts.join(' UNION ALL ')}) q` +
        ` ORDER BY ts LIMIT ${limit}`;

      const dataRes = await client.query<{
        ts: string;
        value_number: number | null;
        value_string: string | null;
      }>(sql, [elementId, fromNs, toNs]);

      return dataRes.rows.map(r => ({
        ms: Number(BigInt(r.ts) / 1_000_000n),
        value: r.value_number ?? r.value_string,
      }));
    } finally {
      await client.end().catch(() => {});
    }
  }
}
