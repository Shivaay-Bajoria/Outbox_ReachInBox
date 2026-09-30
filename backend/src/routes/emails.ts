import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { getAttachmentFile, MAX_FILES, MAX_FILE_BYTES, MAX_TOTAL_BYTES } from '../services/attachments.js';
import { countEmails, getEmail, HttpError, listEmails, scheduleBatch } from '../services/emails.js';
import { ensureSenders } from '../services/senders.js';

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const scheduleSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1),
  recipients: z.array(z.string().email()).min(1).max(50_000),
  startTime: z.coerce.date().optional(),
  delaySeconds: z.coerce.number().min(0).max(86_400).default(0),
  hourlyLimit: z.coerce.number().int().positive().optional(),
  senderId: z.string().uuid().optional(),
  attachments: z
    .array(z.object({ name: z.string().min(1).max(255), type: z.string().max(200).default(''), data: z.string().min(1) }))
    .max(MAX_FILES)
    .default([]),
});

emailsRouter.get('/senders', async (req, res) => {
  const senders = await ensureSenders(req.user!.id);
  res.json(senders.map((s) => ({ id: s.id, email: s.email })));
});

emailsRouter.post('/schedule', async (req, res) => {
  const input = scheduleSchema.parse(req.body);
  // base64 length -> decoded bytes, checked before anything touches the database
  const sizes = input.attachments.map((a) => Math.floor((a.data.length * 3) / 4));
  if (sizes.some((n) => n > MAX_FILE_BYTES)) throw new HttpError(413, 'Each attachment must be 5 MB or smaller');
  if (sizes.reduce((a, b) => a + b, 0) > MAX_TOTAL_BYTES) throw new HttpError(413, 'Attachments total more than 15 MB');
  const result = await scheduleBatch(req.user!.id, { ...input, startTime: input.startTime ?? new Date() });
  res.status(201).json(result);
});

emailsRouter.get('/counts', async (req, res) => {
  res.json(await countEmails(req.user!.id));
});

const listSchema = z.object({
  status: z.enum(['scheduled', 'sent']),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

emailsRouter.get('/', async (req, res) => {
  const { status, q, page, pageSize } = listSchema.parse(req.query);
  res.json(await listEmails(req.user!.id, status, q, page, pageSize));
});

// Registered after the fixed paths above ('/senders', '/counts', ...) so ':id' never shadows them.
emailsRouter.get('/:id', async (req, res) => {
  res.json(await getEmail(req.user!.id, z.string().uuid().parse(req.params.id)));
});

emailsRouter.get('/:id/attachments/:attachmentId', async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const attId = z.string().uuid().parse(req.params.attachmentId);
  const file = await getAttachmentFile(req.user!.id, id, attId);
  if (!file) throw new HttpError(404, 'Attachment not found');
  res.setHeader('Content-Type', file.content_type);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(file.data);
});
