import type { Counts, EmailDetail, EmailGroup, EmailListResponse, ScheduleRequest, ScheduleResponse, Sender, SlackStatus, User } from '../types';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<User>('/auth/me'),
  login: (email: string, password: string) =>
    request<User>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string) =>
    request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  senders: () => request<Sender[]>('/emails/senders'),
  counts: () => request<Counts>('/emails/counts'),
  list: (status: EmailGroup, q: string) =>
    request<EmailListResponse>(`/emails?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  email: (id: string) => request<EmailDetail>(`/emails/${id}`),
  attachmentUrl: (emailId: string, attachmentId: string) => `/api/emails/${emailId}/attachments/${attachmentId}`,
  schedule: (body: ScheduleRequest) => request<ScheduleResponse>('/emails/schedule', { method: 'POST', body: JSON.stringify(body) }),
  slackStatus: () => request<SlackStatus>('/slack/status'),
  slackWebhook: (url: string) => request<{ ok: true }>('/slack/webhook', { method: 'POST', body: JSON.stringify({ url }) }),
  slackTest: () => request<{ ok: true }>('/slack/test', { method: 'POST' }),
  slackDisconnect: () => request<{ ok: true }>('/slack', { method: 'DELETE' }),
};
