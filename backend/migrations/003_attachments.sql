-- Files attached to a composed email. Stored once per batch (not per recipient) and shared by all its emails.
CREATE TABLE IF NOT EXISTS attachments (
  id            UUID PRIMARY KEY,
  batch_id      UUID NOT NULL,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL,
  size          INT  NOT NULL,
  data          BYTEA NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_batch_idx ON attachments(batch_id);
