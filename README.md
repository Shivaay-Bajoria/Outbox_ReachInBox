# ReachInbox – Email Job Scheduler

Full-stack email scheduler: **Express + TypeScript + BullMQ/Redis + Postgres + Elasticsearch + Ethereal SMTP** backend, **React + Vite + Tailwind** dashboard styled after the Figma.

```
backend/    Express API, BullMQ worker, migrations
frontend/   React dashboard
docker-compose.yml   Postgres, Redis (AOF), Elasticsearch
```

## Run it

### 1. Infra
```bash
docker compose up -d
```

### 2. Backend
```bash
cd backend
cp .env.example .env      # fill in Google + Slack credentials (below)
npm install
npm run dev               # API on :4000 (+ embedded worker)
```
Production-style split: `EMBED_WORKER=false npm run start` for the API and `npm run start:worker` (as many as you like) for workers. Migrations run automatically on boot.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev               # http://localhost:5173 (proxies /api and /admin to :4000)
```

### Credentials
| What | How |
|---|---|
| **Ethereal (fake SMTP)** | Nothing to configure. On first login each user gets `SENDERS_PER_USER` throwaway Ethereal inboxes created via `nodemailer.createTestAccount()`. Sent rows link to their Ethereal preview URL. |
| **Login** | Email + password sign-up works out of the box (scrypt-hashed). **Google** additionally needs the credentials below. Signing in with Google using an email that already has a password account links them. |
| **Google login** | Google Cloud Console → OAuth client (Web). Authorized redirect URI: `http://localhost:4000/api/auth/google/callback`. Set `GOOGLE_CLIENT_ID/SECRET`. |
| **Slack** | Two ways to connect from the sidebar card. **Quick:** paste an Incoming Webhook URL (verified with a live message, no app setup, works on localhost). **OAuth:** api.slack.com/apps → new app → OAuth & Permissions → scope `incoming-webhook`; redirect URL `<BACKEND_URL>/api/slack/callback` (Slack requires https – use an ngrok URL and set `BACKEND_URL` to it). Set `SLACK_CLIENT_ID/SECRET`. Once connected, **Send test** posts a real message on demand. |

BullMQ dashboard (live, login required): **http://localhost:4000/admin/queues**

## Architecture

```
Browser ──► Express API ──► Postgres  (source of truth: every email row + status)
                │  └──────► Elasticsearch (search index, best-effort)
                ▼
             BullMQ delayed jobs in Redis (jobId = email.id)
                ▼
             Worker(s): claim row → rate-limit check → Ethereal SMTP → mark sent → Slack alert on cap
```

### How scheduling works
`POST /api/emails/schedule` takes `{subject, body, recipients[], startTime, delaySeconds, hourlyLimit, senderId?}`. Recipient *i* gets `scheduled_at = startTime + i × delay`. Rows are inserted in Postgres, then one **BullMQ delayed job** per email is added with `delay = scheduled_at − now`. No cron of any kind – Redis holds the timers.

### Persistence / restarts
* Postgres is the source of truth; Redis runs with AOF so delayed jobs survive a Redis restart.
* Killing the API/worker loses nothing: delayed jobs sit in Redis and are picked up when a worker returns, **at their original time**.
* On boot, `reconcile()` (a) returns rows stuck in `processing` (crashed worker) to `scheduled` and (b) re-adds every `scheduled` row to BullMQ. Because jobId = email id, re-adding an existing job is a no-op, so only genuinely missing jobs (e.g. Redis wiped) are recreated.

### Idempotency (never send twice)
1. `jobId = email.id` → duplicate enqueues collapse.
2. The worker does an atomic `UPDATE … SET status='processing' WHERE id=$1 AND status='scheduled' RETURNING *`. Only one worker can win; a redelivered/stalled job finds nothing to claim and exits.
3. Failed sends go back to `scheduled` for the BullMQ retry (3 attempts, exponential backoff), then `failed`.

### Crash recovery (hard-killed worker)
If a worker is `kill -9`'d mid-send, its row stays `processing` and its BullMQ job stalls. Three pieces make sure the email still goes out:
1. **Park, don't complete.** BullMQ redelivers the stalled job, but the row's lock is still fresh, so the claim fails. The worker then *delays the job* until the lock is stale (`STALE_LOCK_MS`, default 60 s) instead of finishing it – finishing would strand the email, since a completed job with the same id also blocks re-adding.
2. **Stale-lock takeover.** After `STALE_LOCK_MS` with no update, the next delivery re-claims the row and sends. SMTP timeouts (15–20 s) are deliberately far below `STALE_LOCK_MS`, so a live worker is never mistaken for a dead one.
3. **Self-healing boot.** `reconcile()` resets stale `processing` rows and calls `ensureJob()`, which leaves live jobs alone but *removes completed/failed jobs that hold the same jobId* before re-adding. A job that BullMQ itself gives up on ("stalled more than allowable limit", `maxStalledCount=5`) is reset and re-created by the worker's `failed` handler.

Verified by killing a worker (SIGKILL) during a hung SMTP send, then starting a new one: the email moved `processing → scheduled → sent` on attempt 2 with no manual step.

Trade-off: if a worker dies *after* SMTP accepted but *before* the row is marked sent, recovery resends that one email (at-least-once in that narrow window; exactly-once would need SMTP-side dedup). Recovery latency after a crash is roughly BullMQ's stalled check (≤ ~60 s) plus the remainder of `STALE_LOCK_MS`. A clean Ctrl+C is unaffected: the worker finishes in-flight jobs before exiting.

### Concurrency & throttling
* `WORKER_CONCURRENCY` (default 5) parallel jobs per worker process – safe because every side effect is guarded by the atomic claim and atomic Redis script.
* **Minimum delay between sends: `MIN_DELAY_BETWEEN_EMAILS_MS`, default 2000 ms**, enforced by BullMQ's `limiter {max:1, duration}` on the queue (global across all workers).

### Hourly rate limit (per sender)
* Redis counter per `sender × UTC-hour-window` (`rl:count:<sender>:<hour>`), incremented by a **Lua script** that checks-and-increments atomically, so multiple workers/instances can't overshoot.
* Limit = `min(batch "Hourly Limit", MAX_EMAILS_PER_HOUR_PER_SENDER)`; both configurable, nothing hardcoded. The compose form's limit can only tighten the env cap.
* When the cap is hit the job is **not failed or dropped**: the row goes back to `scheduled`, the job is moved to the next hour window via `moveToDelayed`, offset by its position in a per-window overflow counter (`rl:overflow:…`) so overflowed jobs keep roughly the order in which they were denied. If that next window is also full it rolls again.
* Failed sends release their reserved slot.
* Trade-off: fixed windows (not sliding) allow a burst at a window boundary (up to 2× the cap across :59→:00). Simple and predictable; a sliding window would cost more Redis work.

### Behavior under load (1000+ emails at once)
All 1000 rows + jobs are created immediately. Workers drain them at ≤ 1 send / `MIN_DELAY` (limiter) with `CONCURRENCY` in flight. For a sender with cap 200/h, jobs 201+ are pushed into following hour windows in order, at ~`MIN_DELAY` spacing, and drain over successive hours. Bulk insert/enqueue is chunked (500) so a 50k-recipient batch doesn't build one giant query. Because of the global limiter the queue-wide throughput is bounded by design (mimics provider throttling); raise/lower it via env.

### Slack notification
"Connect Slack" → `/api/slack/connect` (or the pasted-webhook path, `POST /api/slack/webhook`) → slack.com OAuth v2 (`incoming-webhook`, CSRF-safe signed `state`) → callback stores the webhook per user. On the **first** cap hit per sender per hour, the worker POSTs a real message to that webhook. The installation is read at send time, so: not connected → silently skipped; connect later → works immediately, no redeploy; Disconnect button removes it. Slack failures never affect sending.

### Search
Every scheduled/sent email is indexed in Elasticsearch (`emails` index, updated on status change). The search box on Scheduled/Sent uses it (fuzzy over recipient/subject/body). If Elasticsearch is unavailable the API transparently falls back to SQL `ILIKE`; scheduling and sending never depend on it.

## Feature map

| Requirement | Where |
|---|---|
| Schedule API, Postgres storage | `backend/src/routes/emails.ts`, `services/emails.ts`, `migrations/001_init.sql` |
| BullMQ delayed jobs, no cron | `queue.ts`, `services/emails.ts` |
| Restart persistence + reconcile | `services/emails.ts#reconcile`, Redis AOF |
| Idempotency | jobId + atomic claim, `services/emailWorker.ts` |
| Concurrency / min delay | `services/emailWorker.ts` (`concurrency`, `limiter`) |
| Hourly rate limit (Redis, multi-worker safe) | `services/rateLimiter.ts` |
| Multiple senders (Ethereal) | `services/senders.ts`, `services/mailer.ts`, round-robin in `scheduleBatch` |
| Slack OAuth + live alert | `routes/slack.ts`, `services/slack.ts` |
| Elasticsearch | `services/search.ts` |
| BullMQ dashboard | `/admin/queues` (`server.ts`) |
| Login page (Figma), email/password + Google, user info, logout | `pages/LoginPage.tsx`, `routes/auth.ts`, `components/layout/Sidebar.tsx` |
| Compose (subject, body, **Upload CSV button** → count, start time, delay, hourly limit) | `frontend/src/pages/ComposePage.tsx`, `lib/leads.ts` |
| Scheduled / Sent tables, loading, empty, error states | `pages/EmailsPage.tsx`, `components/emails/*` |
| Open an email (subject, sender, recipient, date, body, attachments) | `pages/EmailDetailPage.tsx`, `GET /api/emails/:id`, `lib/sanitize.ts` |
| Attach files to the email (paperclip) | `pages/ComposePage.tsx`, `services/attachments.ts`, `migrations/003_attachments.sql` |
| Reusable UI | `components/ui/*` |

## Attachments & CSV import
* **CSV → To:** *Upload CSV* extracts every valid, unique address from the file (any column/delimiter) and writes them straight into the **To** field, merged with anything already typed. The detected count is derived from that field, so editing it by hand always stays in sync.
* **Attachments:** the paperclip attaches files to the email itself (max 5 files, 5 MB each, 15 MB total; enforced on both client and server). They are sent as base64 in the schedule request, stored **once per batch** in Postgres (`attachments`, bytea) and re-read by the worker for each send, so a 1000-recipient campaign stores the file once. The detail page lists them as download cards (ownership-checked endpoint).
* The email detail page sanitizes the stored HTML with an allow-list before rendering.

## Assumptions, shortcuts & trade-offs

**Assumptions**
* One "tenant" = one logged-in user. Senders, Slack connection, emails and attachments are all scoped to that user.
* Senders are Ethereal (fake SMTP) accounts created automatically per user (`SENDERS_PER_USER`, default 2). Nothing is delivered to real recipients; each sent email has an Ethereal preview link instead.
* Time windows are UTC clock hours. "Hourly limit" means per sender per UTC hour.
* A batch's **Hourly Limit** can only *lower* the global per-sender cap (`MAX_EMAILS_PER_HOUR_PER_SENDER`), never raise it.
* Recipients are de-duplicated within a batch (case-insensitive) but the same address can be scheduled again in a later batch.

**Shortcuts**
* Attachments are stored in Postgres (bytea) for simplicity; real scale belongs in object storage (S3) with only a reference in the DB. They travel as base64 in the schedule request (15 MB total cap).
* Rich-text editor is a small dependency-free `contenteditable` using the deprecated `document.execCommand`.
* The lists refresh by polling every 10 s; there are no websockets.
* Sessions are a signed httpOnly JWT cookie (7 days) with no refresh tokens or server-side revocation.
* Passwords use Node's built-in scrypt; there is no email verification, password reset or login rate limiting.
* The Slack webhook URL is stored in plaintext in Postgres (encrypt at rest in production). The "paste a webhook URL" option exists so Slack works without registering a Slack app; the real OAuth flow is also implemented.
* Search is best-effort: Elasticsearch is optional, and search falls back to SQL `ILIKE` when it is unreachable (the backend logs a warning).
* Migrations are plain idempotent `.sql` files run on boot, not a migration framework.
* The BullMQ dashboard is protected by the app login only (any logged-in user can open it); restrict it further in production.
* No automated test suite. I verified manually against local Redis/Postgres: scheduling → Ethereal delivery, the hourly limit rolling jobs into the next window, hard-kill recovery, auth flows, CSV upload, attachments and the email detail page. Google OAuth and Slack OAuth need your own credentials and were not exercised live.

**Trade-offs**
* **Fixed hourly windows, not sliding.** Simple, cheap (one Redis counter) and predictable, but allows a burst at a window boundary (up to 2× the cap across :59 → :00).
* **Global throttle.** The minimum gap (BullMQ `limiter`) is queue-wide, so total throughput is capped at 1 send per gap regardless of how many workers run. This mimics provider throttling but means more workers add resilience, not speed. Raise the limiter or shard queues per sender for more throughput.
* **Overflow ordering is approximate.** Denied jobs are re-queued at `next window start + position × gap`, preserving denial order rather than strict original order.
* **At-least-once in one narrow window.** If a worker dies *after* SMTP accepts a message but *before* the row is marked sent, crash recovery re-sends that single email. Exactly-once would need SMTP-side deduplication, which Ethereal doesn't offer.
* **Crash-recovery latency.** After a hard kill the email is retried after BullMQ's stalled check (≤ ~60 s) plus the rest of `STALE_LOCK_MS`. A shorter window recovers faster but risks treating a slow-but-alive worker as dead (the SMTP timeouts are kept well below it for that reason).
* **Postgres is the source of truth, Redis is the clock.** Persisting first and enqueueing second means a crash between the two is healed by the boot-time reconcile; the cost is one extra pass over `scheduled` rows on every start.
