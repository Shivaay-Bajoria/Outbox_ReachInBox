import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { SenderRow } from '../types.js';
import { createEtherealSender } from './mailer.js';

export async function listSenders(userId: string): Promise<SenderRow[]> {
  const { rows } = await pool.query<SenderRow>('SELECT * FROM senders WHERE user_id=$1 ORDER BY created_at', [userId]);
  return rows;
}

/** Lazily provisions Ethereal sender accounts, so login still works if Ethereal is briefly unreachable. */
export async function ensureSenders(userId: string): Promise<SenderRow[]> {
  const existing = await listSenders(userId);
  const missing = config.sendersPerUser - existing.length;
  for (let i = 0; i < missing; i++) {
    const s = await createEtherealSender();
    await pool.query(
      `INSERT INTO senders (id,user_id,email,smtp_host,smtp_port,smtp_user,smtp_pass) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), userId, s.email, s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass],
    );
  }
  return missing > 0 ? listSenders(userId) : existing;
}
