import { Client } from '@elastic/elasticsearch';
import { config } from '../config.js';
import type { EmailRow } from '../types.js';

const INDEX = 'emails';
const es = new Client({ node: config.elasticsearchUrl });
let ready = false;

/** Search is best-effort: if Elasticsearch is down, scheduling and sending must keep working. */
async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[search] ${label} failed:`, (err as Error).message);
    return undefined;
  }
}

export async function ensureIndex() {
  await safe('ensureIndex', async () => {
    if (!(await es.indices.exists({ index: INDEX }))) {
      await es.indices.create({
        index: INDEX,
        mappings: {
          properties: {
            user_id: { type: 'keyword' },
            status: { type: 'keyword' },
            to_email: { type: 'text', fields: { raw: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
            scheduled_at: { type: 'date' },
            sent_at: { type: 'date' },
          },
        },
      });
    }
    ready = true;
  });
}

const doc = (e: EmailRow) => ({
  user_id: e.user_id,
  status: e.status,
  to_email: e.to_email,
  subject: e.subject,
  body: e.body.replace(/<[^>]+>/g, ' '),
  scheduled_at: e.scheduled_at,
  sent_at: e.sent_at,
});

export async function indexEmails(rows: EmailRow[]) {
  if (!rows.length) return;
  await safe('indexEmails', async () => {
    if (!ready) await ensureIndex();
    await es.bulk({
      refresh: false,
      operations: rows.flatMap((r) => [{ index: { _index: INDEX, _id: r.id } }, doc(r)]),
    });
  });
}

export async function updateEmailDoc(e: EmailRow) {
  await safe('updateEmailDoc', () => es.index({ index: INDEX, id: e.id, document: doc(e) }));
}

/** Returns matching email ids (newest first) or undefined when ES is unavailable (caller falls back to SQL). */
export async function searchEmailIds(userId: string, statuses: string[], q: string, limit: number): Promise<string[] | undefined> {
  return safe('search', async () => {
    const res = await es.search({
      index: INDEX,
      size: limit,
      query: {
        bool: {
          filter: [{ term: { user_id: userId } }, { terms: { status: statuses } }],
          must: [{ multi_match: { query: q, fields: ['to_email^2', 'subject^2', 'body'], fuzziness: 'AUTO' } }],
        },
      },
    });
    return res.hits.hits.map((h) => h._id as string);
  });
}
