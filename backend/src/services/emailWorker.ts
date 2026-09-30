import { DelayedError, Worker, type Job } from 'bullmq';
import { QUEUE_NAME, config } from '../config.js';
import { pool } from '../db.js';
import { ensureJob, type EmailJobData } from '../queue.js';
import { createRedis } from '../redis.js';
import type { EmailRow, SenderRow } from '../types.js';
import { loadAttachments } from './attachments.js';
import { sendMail } from './mailer.js';
import { firstHitThisWindow, nextSlotFor, releaseSlot, reserveSlot } from './rateLimiter.js';
import { updateEmailDoc } from './search.js';
import { notifyRateLimitHit } from './slack.js';

/**
 * Atomic claim. Only ONE worker can flip scheduled -> processing, so a job that is delivered twice
 * (retry, stalled-job recovery, duplicate enqueue) can never send twice. A 'processing' row is
 * only re-claimable once its lock is stale (STALE_LOCK_MS with no update = the worker died).
 */
async function claim(id: string): Promise<EmailRow | undefined> {
  const { rows } = await pool.query<EmailRow>(
    `UPDATE emails SET status='processing', attempts=attempts+1, updated_at=now()
      WHERE id=$1 AND (status='scheduled' OR (status='processing' AND updated_at < now() - make_interval(secs => $2)))
      RETURNING *`,
    [id, config.staleLockMs / 1000],
  );
  return rows[0];
}

/**
 * The claim failed. Decide whether the job is genuinely redundant or must wait.
 * A hard-killed worker leaves its row 'processing' with a fresh timestamp; BullMQ's stalled-job checker
 * then redelivers the job to us *before* the row is stale. Completing the job here would strand the email
 * forever, so instead we park the job until the lock can be taken over.
 */
async function parkOrSkip(job: Job<EmailJobData>, token: string | undefined) {
  const { rows } = await pool.query<{ status: EmailRow['status']; age_ms: number }>(
    `SELECT status, extract(epoch FROM (now() - updated_at)) * 1000 AS age_ms FROM emails WHERE id=$1`,
    [job.data.emailId],
  );
  const row = rows[0];
  if (!row || row.status === 'sent' || row.status === 'failed') return { skipped: true };

  const waitMs = row.status === 'processing' ? Math.max(config.staleLockMs - row.age_ms, 0) + 1000 : 1000;
  await job.moveToDelayed(Date.now() + waitMs, token);
  throw new DelayedError();
}

async function handleJob(job: Job<EmailJobData>, token?: string) {
  const email = await claim(job.data.emailId);
  if (!email) return parkOrSkip(job, token); // sent already -> skip; in-flight elsewhere -> wait for its lock to expire

  const { rows } = await pool.query<SenderRow>('SELECT * FROM senders WHERE id=$1', [email.sender_id]);
  const sender = rows[0];
  if (!sender) {
    await finish(email.id, 'failed', { error: 'Sender no longer exists' });
    return { failed: true };
  }

  // A batch's own hourly limit can only tighten the global per-sender cap, never exceed it.
  const limit = Math.min(email.hourly_limit ?? Infinity, config.maxEmailsPerHourPerSender);
  const slot = await reserveSlot(sender.id, limit);

  if (!slot.allowed) {
    // Hourly cap hit: NOT a failure. Push the same job to the next hour window and hand the row back.
    const resumeAt = await nextSlotFor(sender.id, config.minDelayBetweenEmailsMs);
    await pool.query(`UPDATE emails SET status='scheduled', scheduled_at=$2, attempts=attempts-1, updated_at=now() WHERE id=$1`, [email.id, resumeAt]);
    await job.moveToDelayed(resumeAt.getTime(), token);
    if (await firstHitThisWindow(sender.id, slot.window)) {
      void notifyRateLimitHit(email.user_id, sender.email, limit, resumeAt);
    }
    throw new DelayedError();
  }

  try {
    const { messageId, previewUrl } = await sendMail(sender, email.to_email, email.subject, email.body, await loadAttachments(email.batch_id));
    await finish(email.id, 'sent', { message_id: messageId, preview_url: previewUrl });
    return { sent: true };
  } catch (err) {
    await releaseSlot(sender.id, slot.window);
    const message = (err as Error).message;
    const willRetry = job.attemptsMade + 1 < (job.opts.attempts ?? 1);
    // Back to 'scheduled' so the BullMQ retry can claim it again; terminal failure is recorded once retries run out.
    await finish(email.id, willRetry ? 'scheduled' : 'failed', { error: message });
    throw err;
  }
}

async function finish(id: string, status: 'sent' | 'failed' | 'scheduled', extra: { error?: string; message_id?: string; preview_url?: string | null }) {
  const { rows } = await pool.query<EmailRow>(
    `UPDATE emails SET status=$2, sent_at = CASE WHEN $2='sent' THEN now() ELSE sent_at END,
            error=$3, message_id=COALESCE($4, message_id), preview_url=COALESCE($5, preview_url), updated_at=now()
      WHERE id=$1 RETURNING *`,
    [id, status, extra.error ?? null, extra.message_id ?? null, extra.preview_url ?? null],
  );
  if (rows[0]) await updateEmailDoc(rows[0]);
}

async function recoverStalled(emailId: string) {
  try {
    const { rows } = await pool.query<{ scheduled_at: Date }>(
      `UPDATE emails SET status='scheduled', updated_at=now() WHERE id=$1 AND status='processing' RETURNING scheduled_at`,
      [emailId],
    );
    if (rows[0]) await ensureJob(emailId, new Date());
  } catch (err) {
    console.error('[worker] stalled recovery failed:', (err as Error).message);
  }
}

export function startWorker() {
  const worker = new Worker<EmailJobData>(QUEUE_NAME, handleJob, {
    connection: createRedis(),
    concurrency: config.workerConcurrency,
    maxStalledCount: 5, // tolerate several consecutive worker crashes before giving up on a job
    // Provider-style throttle: at most 1 send start per MIN_DELAY_BETWEEN_EMAILS_MS across the whole queue.
    limiter: { max: 1, duration: config.minDelayBetweenEmailsMs },
  });
  worker.on('failed', (job, err) => {
    console.warn(`[worker] job ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message);
    // A job that stalls more than maxStalledCount times is failed by BullMQ itself, not by our handler, so the
    // row would stay 'processing'. Hand it back and give it a fresh job.
    if (job && err.message.includes('stalled')) void recoverStalled(job.data.emailId);
  });
  worker.on('error', (err) => console.error('[worker] error:', err.message));
  console.log(`[worker] started: concurrency=${config.workerConcurrency}, min gap=${config.minDelayBetweenEmailsMs}ms, cap=${config.maxEmailsPerHourPerSender}/h/sender`);
  return worker;
}
