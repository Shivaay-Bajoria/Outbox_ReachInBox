import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { pool } from '../db.js';
import { COOKIE, requireAuth, signSession } from '../middleware/auth.js';
import { z } from 'zod';
import { HttpError } from '../services/emails.js';
import { hashPassword, verifyPassword } from '../services/password.js';
import { ensureSenders } from '../services/senders.js';

export const authRouter = Router();

const client = () =>
  new OAuth2Client(config.google.clientId, config.google.clientSecret, `${config.backendUrl}/api/auth/google/callback`);

authRouter.get('/google', (_req, res) => {
  if (!config.google.clientId) return void res.status(500).send('GOOGLE_CLIENT_ID is not configured');
  const state = randomUUID();
  res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000 });
  res.redirect(client().generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, prompt: 'select_account' }));
});

authRouter.get('/google/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`${config.frontendUrl}/login?error=${encodeURIComponent(reason)}`);
  try {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state || state !== req.cookies?.oauth_state) return fail('invalid_state');
    res.clearCookie('oauth_state');

    const c = client();
    const { tokens } = await c.getToken(code);
    const ticket = await c.verifyIdToken({ idToken: tokens.id_token!, audience: config.google.clientId });
    const p = ticket.getPayload();
    if (!p?.sub || !p.email) return fail('no_profile');

    // Returning Google user -> refresh profile. Otherwise create, or link to an existing password account with the same email.
    const updated = await pool.query<{ id: string }>(
      'UPDATE users SET email=$2, name=$3, avatar_url=$4 WHERE google_id=$1 RETURNING id',
      [p.sub, p.email, p.name ?? p.email, p.picture ?? null],
    );
    const rows = updated.rows.length
      ? updated.rows
      : (
          await pool.query<{ id: string }>(
            `INSERT INTO users (id, google_id, email, name, avatar_url) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (lower(email)) DO UPDATE SET google_id=$2, name=$4, avatar_url=$5
             RETURNING id`,
            [randomUUID(), p.sub, p.email, p.name ?? p.email, p.picture ?? null],
          )
        ).rows;
    await ensureSenders(rows[0].id);

    res.cookie(COOKIE, signSession(rows[0].id), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
    res.redirect(config.frontendUrl);
  } catch (err) {
    console.error('[auth] google callback failed:', (err as Error).message);
    fail('login_failed');
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  const u = req.user!;
  res.json({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatar_url });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

const credentials = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
});

const startSession = (res: import('express').Response, userId: string) =>
  res.cookie(COOKIE, signSession(userId), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });

authRouter.post('/register', async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const existing = await pool.query('SELECT 1 FROM users WHERE lower(email)=$1', [email]);
  if (existing.rowCount) throw new HttpError(409, 'An account with this email already exists');

  const id = randomUUID();
  await pool.query('INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,$3,$4)', [
    id,
    email,
    email.split('@')[0],
    await hashPassword(password),
  ]);
  await ensureSenders(id);
  startSession(res, id);
  res.status(201).json({ id, name: email.split('@')[0], email, avatarUrl: null });
});

authRouter.post('/login', async (req, res) => {
  const { email, password } = credentials.parse(req.body);
  const { rows } = await pool.query<{ id: string; name: string; avatar_url: string | null; password_hash: string | null }>(
    'SELECT id, name, avatar_url, password_hash FROM users WHERE lower(email)=$1',
    [email],
  );
  const user = rows[0];
  // One generic message for "no such user", "Google-only account" and "wrong password" - don't leak which.
  if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Invalid email or password');
  }
  await ensureSenders(user.id);
  startSession(res, user.id);
  res.json({ id: user.id, name: user.name, email, avatarUrl: user.avatar_url });
});
