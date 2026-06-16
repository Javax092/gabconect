import { Queue, JobsOptions } from "bullmq";
import IORedis from "ioredis";

/**
 * =========================
 * 1. REDIS SINGLETON
 * =========================
 */
const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL não definida no ambiente");
}

export const redis = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

/**
 * =========================
 * 2. TIPOS DO JOB (EVITA BUG FUTURO)
 * =========================
 */
export type CampaignJobPayload = {
  kind: "CAMPAIGN";
  mandateId: string;
  campaignId: string;
  campaignRecipientId?: string;

  contactId: string;
  contactName?: string;

  phone: string;

  templateId?: string;
  metaTemplateName?: string;
  language?: string;

  templateBody?: string;
  personalizedText: string;

  scheduledFor?: string;

  metadata?: Record<string, unknown>;
};

/**
 * =========================
 * 3. FILA ÚNICA (OUTGOING)
 * =========================
 */
export const outgoingQueue = new Queue<CampaignJobPayload>("outgoing", {
  connection: redis,

  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },

    removeOnComplete: {
      count: 100,
    },

    removeOnFail: {
      count: 1000,
    },
  },
});

/**
 * =========================
 * 4. ENQUEUE (FUNÇÃO PADRÃO DO SISTEMA)
 * =========================
 */
export async function enqueueOutgoingJob(
  payload: CampaignJobPayload,
  options?: JobsOptions,
) {
  const jobId = `${payload.campaignId}:${payload.contactId}:${Date.now()}`;

  const job = await outgoingQueue.add("campaign", payload, {
    jobId, // 🔥 evita duplicação de envio

    ...options,
  });

  console.log("[QUEUE] job criado:", {
    id: job.id,
    jobId,
    campaignId: payload.campaignId,
    phone: payload.phone,
  });

  return job;
}

/**
 * =========================
 * 5. HEALTH CHECK (DEBUG)
 * =========================
 */
export async function getQueueHealth() {
  const counts = await outgoingQueue.getJobCounts();

  return {
    status: "ok",
    queue: "outgoing",
    counts,
    timestamp: new Date().toISOString(),
  };
}
