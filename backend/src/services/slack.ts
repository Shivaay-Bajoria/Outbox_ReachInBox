import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const ACCESS_URL = 'https://slack.com/api/oauth.v2.access';

const redirectUri = () => `${config.backendUrl}/api/slack/callback`;

/** `state` is a short-lived signed token carrying the user id - protects the callback from CSRF. */
export function buildAuthorizeUrl(userId: string): string {
  const state = jwt.sign({ uid: userId, purpose: 'slack' }, config.jwtSecret, { expiresIn: '10m' });
  const p = new URLSearchParams({
    client_id: config.slack.clientId,
    scope: 'incoming-webhook',
    redirect_uri: redirectUri(),
    state,
  });
  return `${AUTHORIZE_URL}?${p}`;
}

export async function completeInstall(code: string, state: string): Promise<void> {
  const payload = jwt.verify(state, config.jwtSecret) as { uid: string; purpose: string };
  if (payload.purpose !== 'slack') throw new Error('Invalid state');

  const res = await fetch(ACCESS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.slack.clientId,
      client_secret: config.slack.clientSecret,
      redirect_uri: redirectUri(),
    }),
  });
  const data = (await res.json()) as {
    ok: boolean;
    error?: string;
    team?: { name: string };
    incoming_webhook?: { url: string; channel: string };
  };
  if (!data.ok || !data.incoming_webhook) throw new Error(data.error ?? 'Slack OAuth failed');

  await pool.query(
    `INSERT INTO slack_installations (user_id, team_name, channel, webhook_url)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE SET team_name=$2, channel=$3, webhook_url=$4, created_at=now()`,
    [payload.uid, data.team?.name ?? null, data.incoming_webhook.channel, data.incoming_webhook.url],
  );
}

export async function getInstallation(userId: string) {
  const { rows } = await pool.query<{ team_name: string | null; channel: string | null; webhook_url: string }>(
    'SELECT team_name, channel, webhook_url FROM slack_installations WHERE user_id=$1',
    [userId],
  );
  return rows[0];
}

export async function disconnect(userId: string) {
  await pool.query('DELETE FROM slack_installations WHERE user_id=$1', [userId]);
}

const WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/;

async function postToWebhook(url: string, text: string): Promise<boolean> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) console.warn(`[slack] webhook responded ${res.status}`);
  return res.ok;
}

/**
 * Alternative to OAuth for quick setups: the user pastes an Incoming Webhook URL. It is verified with a live
 * test message before being stored, so a typo can never be saved as "connected".
 */
export async function connectWithWebhook(userId: string, url: string): Promise<void> {
  if (!WEBHOOK_RE.test(url)) throw new Error('That does not look like a Slack Incoming Webhook URL');
  if (!(await postToWebhook(url, ':white_check_mark: ReachInbox is connected. You will be notified here when a sender hits its hourly limit.'))) {
    throw new Error('Slack rejected the webhook URL');
  }
  await pool.query(
    `INSERT INTO slack_installations (user_id, team_name, channel, webhook_url)
     VALUES ($1,NULL,'webhook',$2)
     ON CONFLICT (user_id) DO UPDATE SET team_name=NULL, channel='webhook', webhook_url=$2, created_at=now()`,
    [userId, url],
  );
}

/** Sends a real message now, so the connection can be verified without waiting for a rate limit. */
export async function sendTestMessage(userId: string): Promise<void> {
  const inst = await getInstallation(userId);
  if (!inst) throw new Error('Slack is not connected');
  if (!(await postToWebhook(inst.webhook_url, ':bell: Test message from ReachInbox - Slack alerts are working.'))) {
    throw new Error('Slack rejected the message. Try reconnecting.');
  }
}

/**
 * Looked up per call (not cached), so connecting/disconnecting takes effect immediately with no redeploy.
 * Never throws: a Slack outage or a missing install must not break email sending.
 */
export async function notifyRateLimitHit(userId: string, senderEmail: string, limit: number, resumeAt: Date) {
  try {
    const inst = await getInstallation(userId);
    if (!inst) return; // Slack not connected -> silently skip
    const ok = await postToWebhook(
      inst.webhook_url,
      `:warning: *Hourly send limit reached* for \`${senderEmail}\` (${limit}/hour). Remaining emails are rescheduled and resume at ${resumeAt.toUTCString()}.`,
    );
    if (ok) console.log(`[slack] rate-limit alert delivered for ${senderEmail}`);
  } catch (err) {
    console.warn('[slack] notify failed:', (err as Error).message);
  }
}
