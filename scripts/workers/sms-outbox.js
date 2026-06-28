'use strict';
const db = require('../../src/config/db');
const outbox = require('../../src/services/smsOutboxService');
const workerId = `${require('os').hostname()}:${process.pid}`;
const once = process.argv.includes('--once');
const pollMs = Math.max(250, Math.min(60000, Number(process.env.SMS_OUTBOX_POLL_MS) || 5000));
const batchSize = Math.max(1, Math.min(100, Number(process.env.SMS_OUTBOX_BATCH_SIZE) || 20));
const staleMinutes = Math.max(1, Math.min(1440, Number(process.env.SMS_OUTBOX_STALE_MINUTES) || 10));
let stopping = false;
process.on('SIGTERM', () => { stopping = true; }); process.on('SIGINT', () => { stopping = true; });
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
(async () => {
  const pool = await db.getPool();
  await outbox.recoverStale(pool, staleMinutes);
  do {
    let processed = 0;
    while (!stopping && processed < batchSize) {
      const result = await outbox.processNext(pool, workerId);
      if (!result) break;
      processed += 1;
      console.log(JSON.stringify({ event: 'sms_outbox_processed', ...result }));
    }
    if (!once && !stopping && processed < batchSize) await sleep(pollMs);
  } while (!once && !stopping);
  await db.closePool();
})().catch(async (error) => { console.error(error.message); try { await db.closePool(); } catch (_) {} process.exitCode = 1; });
