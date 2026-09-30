import { migrate } from './db.js';
import { ensureIndex } from './services/search.js';
import { reconcile } from './services/emails.js';
import { startWorker } from './services/emailWorker.js';

// Standalone worker process (scale horizontally by running more of these).
await migrate();
await ensureIndex();
console.log(`[worker] reconciled ${await reconcile()} scheduled emails`);
const worker = startWorker();

const shutdown = async () => {
  await worker.close(); // lets in-flight jobs finish
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
