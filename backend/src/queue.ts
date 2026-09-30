import { Queue } from 'bullmq';
import { QUEUE_NAME } from './config.js';
import { redis } from './redis.js';

export interface EmailJobData {
  emailId: string;
}

export const emailQueue = new Queue<EmailJobData>(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 24 * 3600, count: 5000 },
    removeOnFail: { age: 7 * 24 * 3600 },
  },
});

/**
 * Make sure a live job exists for this email. jobId === emailId, so:
 *  - no job            -> add it
 *  - waiting/delayed/active -> leave it alone (add() would be a no-op anyway)
 *  - completed/failed  -> a terminal job with the same id blocks add(), which is exactly how a
 *    hard-killed worker used to strand a row. Remove the dead job first, then re-add.
 */
export async function ensureJob(emailId: string, runAt: Date) {
  const existing = await emailQueue.getJob(emailId);
  if (existing) {
    const state = await existing.getState();
    if (state !== 'completed' && state !== 'failed') return existing;
    await existing.remove();
  }
  return emailQueue.add('send', { emailId }, { jobId: emailId, delay: Math.max(0, runAt.getTime() - Date.now()) });
}
