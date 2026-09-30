import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import type { MailAttachment } from './mailer.js';

export interface AttachmentInput {
  name: string;
  type: string;
  data: string; // base64
}

export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 15 * 1024 * 1024;

export async function saveAttachments(userId: string, batchId: string, files: AttachmentInput[]): Promise<void> {
  for (const f of files) {
    const buf = Buffer.from(f.data, 'base64');
    await pool.query(
      'INSERT INTO attachments (id, batch_id, user_id, filename, content_type, size, data) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), batchId, userId, f.name, f.type || 'application/octet-stream', buf.length, buf],
    );
  }
}

export async function loadAttachments(batchId: string): Promise<MailAttachment[]> {
  const { rows } = await pool.query<{ filename: string; content_type: string; data: Buffer }>(
    'SELECT filename, content_type, data FROM attachments WHERE batch_id=$1 ORDER BY created_at, filename',
    [batchId],
  );
  return rows.map((r) => ({ filename: r.filename, contentType: r.content_type, content: r.data }));
}

/** Ownership is enforced by joining through the caller's own email rows. */
export async function getAttachmentFile(userId: string, emailId: string, attachmentId: string) {
  const { rows } = await pool.query<{ filename: string; content_type: string; data: Buffer }>(
    `SELECT a.filename, a.content_type, a.data
       FROM attachments a JOIN emails e ON e.batch_id = a.batch_id
      WHERE a.id=$1 AND e.id=$2 AND e.user_id=$3`,
    [attachmentId, emailId, userId],
  );
  return rows[0];
}
