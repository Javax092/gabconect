import { Queue, QueueEvents, Worker, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import { MessageDirection, Prisma, QueuePriority, QueueStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const QUEUE_NAMES = {
  incoming: "incoming",
  outgoing: "outgoing",
  human: "human"
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

type EnqueueInput = {
  mandateId: string;
  conversationId?: string | null;
  messageId?: string | null;
  direction?: MessageDirection;
  priority?: QueuePriority;
  scheduledFor?: Date | string;
  payload?: Record<string, unknown>;
  queueRecordId?: string;
  requireBullMQ?: boolean;
  [key: string]: unknown;
};

let connection: IORedis | null = null;
const queues = new Map<QueueName, Queue>();

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || null;
}

function getConnection() {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (!connection) {
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      connectTimeout: 1000,
      retryStrategy: () => null
    });
    connection.on("error", () => undefined);
  }

  return connection;
}

async function getQueue(name: QueueName) {
  const existing = queues.get(name);

  if (existing) {
    return existing;
  }

  const redis = getConnection();

  if (!redis) {
    return null;
  }

  const queue = new Queue(name, { connection: redis as any });
  queues.set(name, queue);
  return queue;
}

function getMetadata(input: EnqueueInput) {
  if (input.payload) {
    return input.payload;
  }

  const {
    mandateId: _mandateId,
    conversationId: _conversationId,
    messageId: _messageId,
    direction: _direction,
    priority: _priority,
    scheduledFor: _scheduledFor,
    payload: _payload,
    requireBullMQ: _requireBullMQ,
    ...metadata
  } = input;

  return metadata;
}

export async function enqueueJob(name: QueueName, input: EnqueueInput, options?: JobsOptions) {
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : new Date();
  const metadata = getMetadata(input);
  const queueRecord = await prisma.messageQueue.create({
    data: {
      mandateId: input.mandateId,
      conversationId: input.conversationId ?? null,
      messageId: input.messageId ?? null,
      direction: input.direction ?? MessageDirection.OUTBOUND,
      priority: input.priority ?? QueuePriority.NORMAL,
      scheduledFor,
      status: QueueStatus.QUEUED,
      metadata: metadata as Prisma.InputJsonObject
    }
  });

  const payload: Record<string, unknown> = {
    ...metadata,
    queueRecordId: queueRecord.id
  };

  try {
    const queue = await getQueue(name);

    if (!queue && input.requireBullMQ) {
      throw new Error("BullMQ indisponível: REDIS_URL ausente ou Redis inacessível.");
    }

    if (queue) {
      await queue.add(name, payload, {
        delay: Math.max(0, scheduledFor.getTime() - Date.now()),
        ...options
      });
      if (name === QUEUE_NAMES.outgoing) {
        console.info("[queue:outgoing:add]", {
          queue: name,
          jobName: name,
          queueRecordId: queueRecord.id,
          kind: payload.kind ?? null,
          campaignId: payload.campaignId ?? null,
          campaignRecipientId: payload.campaignRecipientId ?? null,
          scheduledFor: scheduledFor.toISOString()
        });
      }
    }
  } catch (error) {
    if (input.requireBullMQ) {
      await prisma.messageQueue.update({
        where: {
          id: queueRecord.id
        },
        data: {
          status: QueueStatus.FAILED,
          failedAt: new Date(),
          error: error instanceof Error ? error.message : "Falha ao enfileirar no BullMQ."
        }
      });
      throw error;
    }

    console.error("[queue] BullMQ enqueue failed; database queue record preserved", {
      queue: name,
      queueRecordId: queueRecord.id,
      error: error instanceof Error ? error.message : "unknown error"
    });
  }

  return {
    queueRecordId: queueRecord.id,
    payload
  };
}

export async function enqueueOutgoingJob(input: EnqueueInput, options?: JobsOptions) {
  return enqueueJob(QUEUE_NAMES.outgoing, input, options);
}

export async function enqueueHumanJob(input: EnqueueInput, options?: JobsOptions) {
  return enqueueJob(QUEUE_NAMES.human, input, options);
}

export async function createQueueWorker<T = unknown>(name: QueueName, processor: (payload: T) => Promise<void>) {
  const redis = getConnection();

  if (!redis) {
    return null;
  }

  return new Worker<T>(name, async (job) => processor(job.data as T), {
    connection: redis as any
  });
}

export function createQueueEvents(name: QueueName) {
  const redis = getConnection();

  if (!redis) {
    return null;
  }

  return new QueueEvents(name, {
    connection: redis as any
  });
}

export async function getQueueHealth() {
  const redis = getConnection();

  if (!redis) {
    return {
      redis: "degraded",
      queues: "database",
      reason: "REDIS_URL ausente",
      checkedAt: new Date().toISOString()
    };
  }

  try {
    const start = Date.now();
    await redis.ping();
    const outgoingQueue = await getQueue(QUEUE_NAMES.outgoing);
    const counts = outgoingQueue ? await outgoingQueue.getJobCounts() : null;

    return {
      redis: "ready",
      queues: "bullmq",
      latencyMs: Date.now() - start,
      counts,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error("[queue] health check failed", error);
    connection?.disconnect();
    connection = null;
    queues.clear();

    return {
      redis: "degraded",
      queues: "database",
      reason: error instanceof Error ? error.message : "Redis indisponível",
      checkedAt: new Date().toISOString()
    };
  }
}
