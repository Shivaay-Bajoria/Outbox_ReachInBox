import { randomUUID } from 'node:crypto';
import { pool } from '../db.js';
import { config } from '../config.js';
import { emailQueue, ensureJob } from '../queue.js';
import type { EmailRow, EmailStatus } from '../types.js';
import { saveAttachments, type AttachmentInput } from './attachments.js';
import { indexEmails, searchEmailIds } from './search.js';
import { listSenders } from './senders.js';

export interface ScheduleInput {
  subject: string;
  body: string;
  recipients: string[];
  startTime: Date;
  delaySeconds: number;
  hourlyLimit?: number;
  senderId?: string;
  attachments?: AttachmentInput[];
}

const CHUNK = 500;

/**
 * Persist first (source of truth), then enqueue. If the process dies between the two steps,
 * reconcile() re-enqueues on next boot - and jobId dedup makes that safe.
 */
export async function scheduleBatch(userId: string, input: ScheduleInput) {
  const senders = await listSenders(userId);
  if (!senders.length) throw new HttpError(400, 'No sender accounts available');
  const pinned = input.senderId ? senders.find((s) => s.id === input.senderId) : undefined;
  if (input.senderId && !pinned) throw new HttpError(400, 'Unknown sender');

  const batchId = randomUUID();
  // Stored before any email row exists, so a worker can never pick up a job whose files are missing.
  await saveAttachments(userId, batchId, input.attachments ?? []);
  const unique = [...new Set(input.recipients.map((r) => r.trim().toLowerCase()))];
  const rows = unique.map((to, i) => ({
    id: randomUUID(),
    sender_id: (pinned ?? senders[i % senders.length]).id, // no sender chosen -> round-robin across all
    to_email: to,
    scheduled_at: new Date(input.startTime.getTime() + i * input.delaySeconds * 1000),
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const part = rows.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = part.map((r, j) => {
      const o = j * 9;
      values.push(r.id, userId, r.sender_id, batchId, r.to_email, input.subject, input.body, input.hourlyLimit ?? null, r.scheduled_at);
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9})`;
    });
    const { rows: inserted } = await pool.query<EmailRow>(
      `INSERT INTO emails (id,user_id,sender_id,batch_id,to_email,subject,body,hourly_limit,scheduled_at)
       VALUES ${tuples.join(',')} RETURNING *`,
      values,
    );
    await emailQueue.addBulk(
      inserted.map((e) => ({
        name: 'send',
        data: { emailId: e.id },
        opts: { jobId: e.id, delay: Math.max(0, e.scheduled_at.getTime() - Date.now()) },
      })),
    );
    await indexEmails(inserted);
  }
  return { batchId, scheduled: rows.length, duplicatesRemoved: input.recipients.length - unique.length };
}

const GROUPS: Record<'scheduled' | 'sent', EmailStatus[]> = {
  scheduled: ['scheduled', 'processing'],
  sent: ['sent', 'failed'],
};

export async function listEmails(userId: string, group: 'scheduled' | 'sent', q: string | undefined, page: number, pageSize: number) {
  const statuses = GROUPS[group];
  const order = group === 'scheduled' ? 'e.scheduled_at ASC' : 'e.sent_at DESC NULLS LAST, e.updated_at DESC';
  const params: unknown[] = [userId, statuses];
  let where = 'e.user_id=$1 AND e.status = ANY($2)';

  if (q?.trim()) {
    // Elasticsearch first; fall back to SQL ILIKE if the search cluster is unavailable.
    const ids = await searchEmailIds(userId, statuses, q.trim(), 1000);
    if (ids) {
      params.push(ids.length ? ids : [randomUUID()]);
      where += ` AND e.id = ANY($${params.length}::uuid[])`;
    } else {
      params.push(`%${q.trim()}%`);
      where += ` AND (e.to_email ILIKE $${params.length} OR e.subject ILIKE $${params.length} OR e.body ILIKE $${params.length})`;
    }
  }

  const total = Number((await pool.query(`SELECT count(*) FROM emails e WHERE ${where}`, params)).rows[0].count);
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await pool.query(
    `SELECT e.id, e.to_email, e.subject, e.body, e.status, e.scheduled_at, e.sent_at, e.error, e.preview_url, s.email AS sender_email
       FROM emails e JOIN senders s ON s.id = e.sender_id
      WHERE ${where} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return {
    total,
    items: rows.map((r) => ({
      id: r.id as string,
      to: r.to_email as string,
      subject: r.subject as string,
      preview: (r.body as string).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140),
      status: r.status as EmailStatus,
      scheduledAt: r.scheduled_at as Date,
      sentAt: r.sent_at as Date | null,
      error: r.error as string | null,
      previewUrl: r.preview_url as string | null,
      sender: r.sender_email as string,
    })),
  };
}

export async function getEmail(userId: string, id: string) {
  const { rows } = await pool.query(
    `SELECT e.id, e.batch_id, e.to_email, e.subject, e.body, e.status, e.scheduled_at, e.sent_at, e.error, e.preview_url,
            s.email AS sender_email, u.name AS sender_name
       FROM emails e JOIN senders s ON s.id = e.sender_id JOIN users u ON u.id = e.user_id
      WHERE e.id=$1 AND e.user_id=$2`,
    [id, userId],
  );
  const r = rows[0];
  if (!r) throw new HttpError(404, 'Email not found');
  const att = await pool.query<{ id: string; filename: string; content_type: string; size: number }>(
    'SELECT id, filename, content_type, size FROM attachments WHERE batch_id=$1 ORDER BY created_at, filename',
    [r.batch_id],
  );
  return {
    id: r.id as string,
    to: r.to_email as string,
    from: { name: r.sender_name as string, email: r.sender_email as string },
    subject: r.subject as string,
    body: r.body as string,
    status: r.status as EmailStatus,
    scheduledAt: r.scheduled_at as Date,
    sentAt: r.sent_at as Date | null,
    error: r.error as string | null,
    previewUrl: r.preview_url as string | null,
    attachments: att.rows.map((a) => ({ id: a.id, name: a.filename, type: a.content_type, size: a.size })),
  };
}

export async function countEmails(userId: string) {
  const { rows } = await pool.query<{ status: EmailStatus; n: string }>(
    'SELECT status, count(*) AS n FROM emails WHERE user_id=$1 GROUP BY status',
    [userId],
  );
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
  return {
    scheduled: (by.scheduled ?? 0) + (by.processing ?? 0),
    sent: (by.sent ?? 0) + (by.failed ?? 0),
  };
}

/**
 * Boot-time self-heal (idempotent):
 *  1. rows stuck in 'processing' past the stale-lock window (worker was hard-killed mid-send)
 *     go back to 'scheduled'
 *  2. every 'scheduled' row gets a live BullMQ job via ensureJob(): existing waiting/delayed/active jobs
 *     are left alone, missing jobs (Redis wiped) are created, and dead completed/failed jobs that would
 *     block the same jobId are replaced.
 */
export async function reconcile(): Promise<number> {
  await pool.query(
    `UPDATE emails SET status='scheduled', updated_at=now()
      WHERE status='processing' AND updated_at < now() - make_interval(secs => $1)`,
    [config.staleLockMs / 1000],
  );
  let count = 0;
  let cursor = '00000000-0000-0000-0000-000000000000';
  for (;;) {
    const { rows } = await pool.query<{ id: string; scheduled_at: Date }>(
      `SELECT id, scheduled_at FROM emails WHERE status='scheduled' AND id > $1 ORDER BY id LIMIT $2`,
      [cursor, CHUNK],
    );
    if (!rows.length) break;
    await Promise.all(rows.map((r) => ensureJob(r.id, r.scheduled_at)));
    cursor = rows[rows.length - 1].id;
    count += rows.length;
  }
  return count;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
