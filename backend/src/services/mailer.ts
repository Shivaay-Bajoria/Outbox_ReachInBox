import nodemailer, { type Transporter } from 'nodemailer';
import type { SenderRow } from '../types.js';

const transports = new Map<string, Transporter>();

function transportFor(s: SenderRow): Transporter {
  let t = transports.get(s.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: s.smtp_host,
      port: s.smtp_port,
      secure: false,
      auth: { user: s.smtp_user, pass: s.smtp_pass },
      pool: true,
      // Bound every SMTP step well under STALE_LOCK_MS so a live worker is never mistaken for a dead one.
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
    transports.set(s.id, t);
  }
  return t;
}

/**
 * Creates a throwaway Ethereal inbox (fake SMTP - nothing is delivered to real people).
 * Calls the Ethereal API directly because nodemailer.createTestAccount() caches one account per process,
 * which would give every "different" sender the same address.
 */
export async function createEtherealSender() {
  const res = await fetch('https://api.nodemailer.com/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestor: 'reachinbox-scheduler', version: '1.0.0' }),
  });
  const a = (await res.json()) as { status: string; user: string; pass: string; smtp: { host: string; port: number } };
  if (a.status !== 'success') throw new Error('Could not create Ethereal account');
  return { email: a.user, smtp_host: a.smtp.host, smtp_port: a.smtp.port, smtp_user: a.user, smtp_pass: a.pass };
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export async function sendMail(sender: SenderRow, to: string, subject: string, html: string, attachments: MailAttachment[] = []) {
  const info = await transportFor(sender).sendMail({
    from: sender.email,
    to,
    subject,
    html,
    text: html.replace(/<[^>]+>/g, ' '),
    attachments,
  });
  return { messageId: info.messageId, previewUrl: nodemailer.getTestMessageUrl(info) || null };
}
