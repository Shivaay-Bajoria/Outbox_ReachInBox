export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';

export interface EmailRow {
  id: string;
  user_id: string;
  sender_id: string;
  batch_id: string;
  to_email: string;
  subject: string;
  body: string;
  hourly_limit: number | null;
  scheduled_at: Date;
  status: EmailStatus;
  sent_at: Date | null;
  attempts: number;
  error: string | null;
  message_id: string | null;
  preview_url: string | null;
}

export interface SenderRow {
  id: string;
  user_id: string;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
}

export interface UserRow {
  id: string;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}
