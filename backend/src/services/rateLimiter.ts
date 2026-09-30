import { HOUR_MS } from '../config.js';
import { redis } from '../redis.js';

/**
 * Atomic "check and reserve" in a single Lua script, so N workers / instances
 * can never collectively exceed the limit (no GET-then-INCR race).
 * Returns {allowed(0|1), countAfter}.
 */
const RESERVE_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c >= tonumber(ARGV[1]) then return {0, c} end
c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return {1, c}
`;

export const windowOf = (ts = Date.now()) => Math.floor(ts / HOUR_MS);
export const windowStart = (w: number) => w * HOUR_MS;

const counterKey = (senderId: string, w: number) => `rl:count:${senderId}:${w}`;

export interface ReserveResult {
  allowed: boolean;
  count: number;
  window: number;
}

export async function reserveSlot(senderId: string, limit: number): Promise<ReserveResult> {
  const window = windowOf();
  const [ok, count] = (await redis.eval(RESERVE_LUA, 1, counterKey(senderId, window), limit, 2 * 3600)) as [number, number];
  return { allowed: ok === 1, count, window };
}

/** Give a reserved slot back when a send fails so a failed attempt doesn't eat quota. */
export async function releaseSlot(senderId: string, window: number): Promise<void> {
  const key = counterKey(senderId, window);
  const v = await redis.decr(key);
  if (v < 0) await redis.set(key, 0, 'EX', 2 * 3600);
}

/**
 * Where to put a job that hit the cap. It goes to the start of the next hour window,
 * offset by its position in the overflow queue for that window, so overflowed jobs keep
 * (approximately) the order in which they were denied instead of all firing at :00.
 */
export async function nextSlotFor(senderId: string, minGapMs: number): Promise<Date> {
  const nextWindow = windowOf() + 1;
  const pos = await redis.incr(`rl:overflow:${senderId}:${nextWindow}`);
  await redis.expire(`rl:overflow:${senderId}:${nextWindow}`, 3 * 3600);
  return new Date(windowStart(nextWindow) + pos * minGapMs);
}

/** True only for the first hit per sender per window - used to send exactly one Slack alert. */
export async function firstHitThisWindow(senderId: string, window: number): Promise<boolean> {
  const res = await redis.set(`rl:notified:${senderId}:${window}`, '1', 'EX', 2 * 3600, 'NX');
  return res === 'OK';
}
