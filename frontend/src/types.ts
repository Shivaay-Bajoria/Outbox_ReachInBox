export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Sender {
  id: string;
  email: string;
}

export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';
export type EmailGroup = 'scheduled' | 'sent';

export interface EmailItem {
  id: string;
  to: string;
  subject: string;
  preview: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  error: string | null;
  previewUrl: string | null;
  sender: string;
}

export interface EmailListResponse {
  items: EmailItem[];
  total: number;
}

export interface Counts {
  scheduled: number;
  sent: number;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  recipients: string[];
  startTime?: string;
  delaySeconds: number;
  hourlyLimit?: number;
  senderId?: string;
  attachments?: { name: string; type: string; data: string }[];
}

export interface ScheduleResponse {
  batchId: string;
  scheduled: number;
  duplicatesRemoved: number;
}

export interface SlackStatus {
  connected: boolean;
  configured: boolean;
  team: string | null;
  channel: string | null;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface EmailDetail {
  id: string;
  to: string;
  from: { name: string; email: string };
  subject: string;
  body: string;
  status: EmailStatus;
  scheduledAt: string;
  sentAt: string | null;
  error: string | null;
  previewUrl: string | null;
  attachments: AttachmentMeta[];
}
