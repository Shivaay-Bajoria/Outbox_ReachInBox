import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { buildAuthorizeUrl, completeInstall, connectWithWebhook, disconnect, getInstallation, sendTestMessage } from '../services/slack.js';

export const slackRouter = Router();

slackRouter.get('/status', requireAuth, async (req, res) => {
  const inst = await getInstallation(req.user!.id);
  res.json({ connected: !!inst, team: inst?.team_name ?? null, channel: inst?.channel ?? null, configured: !!config.slack.clientId });
});

// Browser navigation (not fetch) -> requires the session cookie, which the browser sends.
slackRouter.get('/connect', requireAuth, (req, res) => {
  if (!config.slack.clientId) return void res.redirect(`${config.frontendUrl}/?slack=unconfigured`);
  res.redirect(buildAuthorizeUrl(req.user!.id));
});

slackRouter.get('/callback', async (req, res) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;
  try {
    if (error || !code || !state) throw new Error(error ?? 'missing_code');
    await completeInstall(code, state);
    res.redirect(`${config.frontendUrl}/?slack=connected`);
  } catch (err) {
    console.error('[slack] oauth callback failed:', (err as Error).message);
    res.redirect(`${config.frontendUrl}/?slack=error`);
  }
});

slackRouter.post('/webhook', requireAuth, async (req, res) => {
  const { url } = z.object({ url: z.string().trim().url() }).parse(req.body);
  try {
    await connectWithWebhook(req.user!.id, url);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

slackRouter.post('/test', requireAuth, async (req, res) => {
  try {
    await sendTestMessage(req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

slackRouter.delete('/', requireAuth, async (req, res) => {
  await disconnect(req.user!.id);
  res.json({ ok: true });
});
