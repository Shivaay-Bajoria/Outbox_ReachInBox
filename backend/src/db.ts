import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/** Runs every .sql file in /migrations in order. All statements are idempotent (IF NOT EXISTS). */
export async function migrate(): Promise<void> {
  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(dir, file), 'utf8'));
  }
}
