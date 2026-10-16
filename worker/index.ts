/**
 * Background worker: relays the transactional outbox to BullMQ and processes document scans,
 * consolidated-PDF generation and e-mail delivery.
 *
 * Coexistence (blue-green): several worker processes may run at once. The outbox relay claims
 * rows with SELECT ... FOR UPDATE SKIP LOCKED and uses the outbox id as the BullMQ job id, so an
 * event is enqueued exactly once. Job payloads carry a version (`v`); workers reject versions
 * they do not understand instead of misprocessing them.
 */
import { writeFileSync } from "node:fs";
import { Queue, UnrecoverableError, Worker, type Job } from "bullmq";
import { prisma } from "~/modules/core/db.server";
import { env } from "~/modules/core/env.server";
import { logger } from "~/modules/core/logger.server";
import { newRedisConnection } from "~/modules/core/redis.server";
import { generateBundle, markBundleFailed, PipelineError } from "~/modules/documents/pipeline.server";
import { scanBytes } from "~/modules/documents/scan.server";
import { getVerifiedFile } from "~/modules/documents/storage.server";
import { sendNotificationEmail } from "~/modules/notifications/mailer.server";

const JOB_VERSION = 1;
const DOCUMENTS = "documents";
const EMAIL = "email";
const HEARTBEAT = "/tmp/worker-alive";

env(); // fail fast on configuration errors
const connection = newRedisConnection();
const queues = {
  [DOCUMENTS]: new Queue(DOCUMENTS, { connection }),
  [EMAIL]: new Queue(EMAIL, { connection }),
};

const JOB_OPTIONS = {
  "documents.generate": { queue: DOCUMENTS, attempts: 6, backoff: { type: "exponential", delay: 15_000 } },
  "documents.scan": { queue: DOCUMENTS, attempts: 8, backoff: { type: "exponential", delay: 20_000 } },
  "email.send": { queue: EMAIL, attempts: 8, backoff: { type: "exponential", delay: 30_000 } },
} as const;

type OutboxType = keyof typeof JOB_OPTIONS;

// ------------------------------------------------------------------------------------------------
// Outbox relay
// ------------------------------------------------------------------------------------------------
let relayStopped = false;

async function relayOnce(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; type: string; payload: unknown }[]>`
      SELECT id, type, payload FROM outbox_events
      WHERE "processedAt" IS NULL AND "availableAt" <= now()
      ORDER BY "createdAt" LIMIT 50 FOR UPDATE SKIP LOCKED`;
    for (const r of rows) {
      const opts = JOB_OPTIONS[r.type as OutboxType];
      if (!opts) {
        await tx.outboxEvent.update({ where: { id: r.id }, data: { attempts: { increment: 1 }, lastError: `Unknown event type ${r.type}`, availableAt: new Date(Date.now() + 3600_000) } });
        continue;
      }
      try {
        await queues[opts.queue].add(r.type, { v: JOB_VERSION, ...(r.payload as object) }, {
          jobId: r.id,
          attempts: opts.attempts,
          backoff: opts.backoff,
          removeOnComplete: { age: 7 * 86400 },
          removeOnFail: { age: 30 * 86400 },
        });
        await tx.outboxEvent.update({ where: { id: r.id }, data: { processedAt: new Date(), attempts: { increment: 1 } } });
      } catch (err) {
        await tx.outboxEvent.update({
          where: { id: r.id },
          data: { attempts: { increment: 1 }, lastError: String((err as Error).message).slice(0, 500), availableAt: new Date(Date.now() + 10_000) },
        });
      }
    }
    return rows.length;
  });
}

async function relayLoop() {
  while (!relayStopped) {
    try {
      const n = await relayOnce();
      if (n === 0) await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      logger.error({ err: (err as Error).message }, "outbox relay error");
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Job processors
// ------------------------------------------------------------------------------------------------
function checkVersion(job: Job) {
  if (job.data?.v !== JOB_VERSION) throw new UnrecoverableError(`Unsupported job version ${job.data?.v}`);
}

const isFinalAttempt = (job: Job) => job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

async function processDocuments(job: Job) {
  checkVersion(job);
  if (job.name === "documents.scan") {
    const doc = await prisma.applicationDocument.findUnique({ where: { id: job.data.documentId } });
    if (!doc || doc.scanStatus === "CLEAN" || doc.scanStatus === "INFECTED") return;
    const bytes = await getVerifiedFile(doc.storageKey, doc.sha256);
    const result = await scanBytes(bytes);
    if (result.status === "FAILED") {
      await prisma.applicationDocument.update({ where: { id: doc.id }, data: { scanStatus: isFinalAttempt(job) ? "FAILED" : "PENDING", scanDetail: result.detail } });
      throw new Error(result.detail);
    }
    await prisma.applicationDocument.update({
      where: { id: doc.id },
      data: { scanStatus: result.status, scanDetail: result.status === "INFECTED" ? result.signature : null, scannedAt: new Date() },
    });
    logger.info({ documentId: doc.id, scan: result.status }, "document scanned");
    return;
  }
  if (job.name === "documents.generate") {
    const id = job.data.generatedDocumentId as string;
    try {
      await generateBundle(id, job.attemptsMade + 1);
    } catch (err) {
      const message = (err as Error).message;
      if (err instanceof PipelineError) {
        await markBundleFailed(id, message);
        throw new UnrecoverableError(message);
      }
      if (isFinalAttempt(job)) await markBundleFailed(id, `Gave up after ${job.attemptsMade + 1} attempts: ${message}`);
      else await prisma.generatedDocument.updateMany({ where: { id, status: "PROCESSING" }, data: { status: "QUEUED", error: message.slice(0, 1000) } });
      throw err;
    }
    return;
  }
  throw new UnrecoverableError(`Unknown job ${job.name}`);
}

async function processEmail(job: Job) {
  checkVersion(job);
  const n = await prisma.notification.findUnique({ where: { id: job.data.notificationId }, include: { user: { select: { email: true } } } });
  if (!n || n.status === "SENT") return;
  try {
    await sendNotificationEmail(n.user.email, n.subject, n.body);
    await prisma.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, error: null } });
  } catch (err) {
    await prisma.notification.update({
      where: { id: n.id },
      data: { status: isFinalAttempt(job) ? "FAILED" : "PENDING", attempts: { increment: 1 }, error: String((err as Error).message).slice(0, 500) },
    });
    throw err;
  }
}

const workers = [
  new Worker(DOCUMENTS, processDocuments, { connection: newRedisConnection(), concurrency: 2, lockDuration: 300_000 }),
  new Worker(EMAIL, processEmail, { connection: newRedisConnection(), concurrency: 4 }),
];
for (const w of workers) {
  w.on("failed", (job, err) => logger.warn({ queue: w.name, job: job?.name, jobId: job?.id, attempt: job?.attemptsMade, err: err.message }, "job failed"));
  w.on("completed", (job) => logger.info({ queue: w.name, job: job.name, jobId: job.id }, "job completed"));
}

// Housekeeping: expired sessions and auth tokens.
async function housekeeping() {
  const now = new Date();
  const s = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  const t = await prisma.authToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86400_000) } } });
  if (s.count || t.count) logger.info({ sessions: s.count, tokens: t.count }, "housekeeping");
}

const beat = () => {
  try {
    writeFileSync(HEARTBEAT, String(Date.now()));
  } catch {
    /* read-only fs in tests */
  }
};
beat();
const timers = [setInterval(beat, 15_000), setInterval(() => void housekeeping().catch(() => undefined), 3600_000)];
void relayLoop();
logger.info({ version: env().GIT_SHA }, "worker started");

async function shutdown(signal: string) {
  logger.info({ signal }, "worker draining");
  relayStopped = true;
  timers.forEach(clearInterval);
  // Worker.close() waits for active jobs to finish (graceful drain for blue-green switches).
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled(Object.values(queues).map((q) => q.close()));
  await prisma.$disconnect();
  connection.disconnect();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
