CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY,
  google_id   TEXT UNIQUE NOT NULL,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS senders (
  id          UUID PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  smtp_host   TEXT NOT NULL,
  smtp_port   INT  NOT NULL,
  smtp_user   TEXT NOT NULL,
  smtp_pass   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS senders_user_idx ON senders(user_id);

CREATE TABLE IF NOT EXISTS slack_installations (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  team_name    TEXT,
  channel      TEXT,
  webhook_url  TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS emails (
  id            UUID PRIMARY KEY,           -- also the BullMQ jobId => idempotency key
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id     UUID NOT NULL REFERENCES senders(id) ON DELETE CASCADE,
  batch_id      UUID NOT NULL,
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  hourly_limit  INT,
  scheduled_at  TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','processing','sent','failed')),
  sent_at       TIMESTAMPTZ,
  attempts      INT NOT NULL DEFAULT 0,
  error         TEXT,
  message_id    TEXT,
  preview_url   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS emails_user_status_idx ON emails(user_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS emails_status_idx ON emails(status, updated_at);
