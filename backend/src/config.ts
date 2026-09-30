import 'dotenv/config';

const int = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
};

const str = (name: string, fallback = ''): string => process.env[name] ?? fallback;

export const config = {
  port: int('PORT', 4000),
  frontendUrl: str('FRONTEND_URL', 'http://localhost:5173'),
  backendUrl: str('BACKEND_URL', 'http://localhost:4000'),
  jwtSecret: str('JWT_SECRET', 'dev-secret-change-me'),

  databaseUrl: str('DATABASE_URL', 'postgres://reachinbox:reachinbox@localhost:5433/reachinbox'),
  redisUrl: str('REDIS_URL', 'redis://localhost:6379'),
  elasticsearchUrl: str('ELASTICSEARCH_URL', 'http://localhost:9200'),

  workerConcurrency: int('WORKER_CONCURRENCY', 5),
  minDelayBetweenEmailsMs: int('MIN_DELAY_BETWEEN_EMAILS_MS', 2000),
  maxEmailsPerHourPerSender: int('MAX_EMAILS_PER_HOUR_PER_SENDER', 200),
  sendersPerUser: int('SENDERS_PER_USER', 2),
  // A 'processing' row whose worker has been silent this long is presumed dead and may be re-claimed.
  // Must comfortably exceed the SMTP timeouts in mailer.ts so a live worker is never mistaken for a dead one.
  staleLockMs: int('STALE_LOCK_MS', 60_000),

  google: {
    clientId: str('GOOGLE_CLIENT_ID'),
    clientSecret: str('GOOGLE_CLIENT_SECRET'),
  },
  slack: {
    clientId: str('SLACK_CLIENT_ID'),
    clientSecret: str('SLACK_CLIENT_SECRET'),
  },
} as const;

export const QUEUE_NAME = 'email-send';
export const HOUR_MS = 60 * 60 * 1000;
