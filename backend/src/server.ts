import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { config } from './config.js';
import { migrate } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { emailQueue } from './queue.js';
import { authRouter } from './routes/auth.js';
import { emailsRouter } from './routes/emails.js';
import { slackRouter } from './routes/slack.js';
import { HttpError, reconcile } from './services/emails.js';
import { startWorker } from './services/emailWorker.js';
import { ensureIndex } from './services/search.js';

await migrate();
await ensureIndex();
console.log(`[boot] reconciled ${await reconcile()} scheduled emails into BullMQ`);

const app = express();
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json({ limit: '25mb' })); // recipient lists + base64 attachments (15 MB decoded cap enforced in the route)
app.use(cookieParser());

app.get('/health', (_req, res) => void res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/slack', slackRouter);

// Live BullMQ dashboard (login required): http://localhost:4000/admin/queues
const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath('/admin/queues');
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
app.use('/admin/queues', requireAuth, boardAdapter.getRouter());

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return void res.status(400).json({ error: err.issues[0]?.message ?? 'Invalid request', details: err.flatten() });
  if (err instanceof HttpError) return void res.status(err.status).json({ error: err.message });
  if ((err as { type?: string }).type === 'entity.too.large') return void res.status(413).json({ error: 'Request is too large' });
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.port, () => console.log(`[api] listening on :${config.port}`));

// Single-process dev convenience. In production run `npm run start:worker` separately and set EMBED_WORKER=false.
if (process.env.EMBED_WORKER !== 'false') startWorker();
