import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db.js';
import type { UserRow } from '../types.js';

export const COOKIE = 'rb_session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserRow;
  }
}

export const signSession = (userId: string) => jwt.sign({ uid: userId }, config.jwtSecret, { expiresIn: '7d' });

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return void res.status(401).json({ error: 'Not authenticated' });
    const { uid } = jwt.verify(token, config.jwtSecret) as { uid: string };
    const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id=$1', [uid]);
    if (!rows[0]) return void res.status(401).json({ error: 'Not authenticated' });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'Not authenticated' });
  }
}
