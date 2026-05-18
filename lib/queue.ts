import { Queue, QueueEvents, Worker, type JobsOptions } from "bullmq";
import { MessageDirection, Prisma, QueuePriority, QueueStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getRedisHealth, getRedisState } from "@/lib/redis";

export const QUEUE_NAMES = {
  incoming: "incoming-message",
  outgoing: "outgoing-message",
  human: "human-escalation"
} as const;

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export type IncomingMessageJobPayload = {
  queueRecordId: string;
  message: {
    externalMessageId: string;
    fromPhone: string;
    profileName: string | null;
    text: string;
    timestamp: string;
    phoneNumberId: string | null;
    displayPhoneNumber: string | null;
  };
};

export type OutgoingMessageJobPayload = {
  queueRecordId: string;
  messageId: string;
  conversationId: string;
  mandateId: string;
  phone: string;
  text: string;
  source: "AI" | "HUMAN" | "TEMPLATE";
  scheduledFor: string;
};

export type HumanEscalationJobPayload = {
  queueRecordId: string;
  mandateId: string;
  conversationId: string;
  reason: string;
  userId?: string | null;
};

type JobPayloadMap = {
  [QUEUE_NAMES.incoming]: IncomingMessageJobPayload;
  [QUEUE_NAMES.outgoing]: OutgoingMessageJobPayload;
  [QUEUE_NAMES.human]: HumanEscalationJobPayload;
};

type FallbackProcessorMap = Partial<{
  [K in QueueName]: (payload: JobPayloadMap[K]) => Promise<void>;
}>;

type QueueJobResult = {
  queued: boolean;
  mode: "bullmq" | "dev-fallback";
  queueRecordId: string;
};

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 2_000
  },
  removeOnComplete: 200,
  removeOnFail: 100
};

const queueCache = new Map<QueueName, Queue>();
const fallbackProcessors: FallbackProcessorMap = {};
let fallbackNoticeShown = false;

function createQueueMetadata(payload: unknown) {
  return payload as Prisma.InputJsonValue;
}

function isDevFallbackAllowed() {
  return process.env.NODE_ENV !== "production" && !process.env.REDIS_URL;
}

function resolveQueuePriority(priority?: QueuePriority) {
  if (priority) {
    return priority;
  }

  return QueuePriority.NORMAL;
}

function toBullPriority(priority: QueuePriority) {
  if (priority === QueuePriority.HIGH) {
    return 1;
  }

  if (priority === QueuePriority.LOW) {
    return 10;
  }

  return 5;
}

function showFallbackNotice() {
  if (fallbackNoticeShown) {
    return;
  }

  console.warn("Rodando sem Redis: modo fallback de desenvolvimento");
  fallbackNoticeShown = true;
}

async function getQueue(name: QueueName) {
  const cached = queueCache.get(name);

  if (cached) {
    return cached;
  }

  const redis = await getRedisState();

  if (!redis.enabled) {
    return null;
  }

  const queue = new Queue(name, {
    connection: redis.connection,
    defaultJobOptions
  });

  queueCache.set(name, queue);
  return queue;
}

async function runDevFallback<T extends QueueName>(
  name: T,
  payload: JobPayloadMap[T],
  scheduledFor: Date
) {
  const processor = fallbackProcessors[name];

  if (!processor) {
    throw new Error(`Nenhum processor fallback registrado para a fila ${name}.`);
  }

  showFallbackNotice();

  const delay = Math.max(0, scheduledFor.getTime() - Date.now());

  setTimeout(() => {
    void processor(payload).catch(async (error) => {
      if (payload.queueRecordId) {
        await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED, {
          failedAt: new Date(),
          error: error instanceof Error ? error.message : "Falha em fallback local."
        });
      }
    });
  }, delay);
}

export function registerFallbackProcessor<T extends QueueName>(
  name: T,
  processor: (payload: JobPayloadMap[T]) => Promise<void>
) {
  fallbackProcessors[name] = processor as FallbackProcessorMap[T];
}

export async function enqueueJob<T extends QueueName>(
  name: T,
  {
    mandateId,
    conversationId,
    messageId,
    direction,
    priority,
    scheduledFor = new Date(),
    payload
  }: {
    mandateId: string;
    conversationId?: string | null;
    messageId?: string | null;
    direction: MessageDirection;
    priority?: QueuePriority;
    scheduledFor?: Date;
    payload: JobPayloadMap[T];
  }
): Promise<QueueJobResult> {
  const normalizedPriority = resolveQueuePriority(priority);

  const queueRecord = await prisma.messageQueue.create({
    data: {
      mandateId,
      conversationId: conversationId ?? undefined,
      messageId: messageId ?? undefined,
      direction,
      status: QueueStatus.PENDING,
      priority: normalizedPriority,
      scheduledFor,
      metadata: createQueueMetadata(payload)
    }
  });

  const enrichedPayload = {
    ...payload,
    queueRecordId: queueRecord.id
  } as JobPayloadMap[T];

  await prisma.messageQueue.update({
    where: { id: queueRecord.id },
    data: {
      metadata: createQueueMetadata(enrichedPayload)
    }
  });

  const queue = await getQueue(name);

  if (!queue) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("REDIS_URL ausente em produção. Redis é obrigatório para BullMQ.");
    }

    await runDevFallback(name, enrichedPayload, scheduledFor);

    return {
      queued: false,
      mode: "dev-fallback",
      queueRecordId: queueRecord.id
    };
  }

  await queue.add(name, enrichedPayload, {
    ...defaultJobOptions,
    delay: Math.max(0, scheduledFor.getTime() - Date.now()),
    priority: toBullPriority(normalizedPriority)
  });

  return {
    queued: true,
    mode: "bullmq",
    queueRecordId: queueRecord.id
  };
}

export async function updateQueueRecord(
  queueRecordId: string,
  status: QueueStatus,
  input: {
    processedAt?: Date | null;
    failedAt?: Date | null;
    error?: string | null;
    retryCount?: number;
  } = {}
) {
  await prisma.messageQueue.update({
    where: { id: queueRecordId },
    data: {
      status,
      processedAt: input.processedAt ?? undefined,
      failedAt: input.failedAt ?? undefined,
      error: input.error ?? undefined,
      retryCount: input.retryCount ?? undefined
    }
  });
}

export async function createQueueWorker<T extends QueueName>(
  name: T,
  processor: (payload: JobPayloadMap[T]) => Promise<void>
) {
  registerFallbackProcessor(name, processor);

  const redis = await getRedisState();

  if (!redis.enabled) {
    if (isDevFallbackAllowed()) {
      showFallbackNotice();
      return null;
    }

    throw new Error(redis.reason);
  }

  const worker = new Worker(
    name,
    async (job) => {
      const payload = job.data as JobPayloadMap[T];
      await processor(payload);
    },
    {
      connection: redis.connection,
      concurrency: name === QUEUE_NAMES.outgoing ? 2 : 6
    }
  );

  worker.on("failed", async (job, error) => {
    const payload = job?.data as { queueRecordId?: string } | undefined;

    if (payload?.queueRecordId) {
      await updateQueueRecord(payload.queueRecordId, QueueStatus.FAILED, {
        failedAt: new Date(),
        error: error.message,
        retryCount: job?.attemptsMade ?? 0
      });
    }
  });

  worker.on("completed", async (job) => {
    const payload = job.data as { queueRecordId?: string };

    if (payload?.queueRecordId) {
      await updateQueueRecord(payload.queueRecordId, QueueStatus.SENT, {
        processedAt: new Date(),
        retryCount: job.attemptsMade
      });
    }
  });

  return worker;
}

export async function createQueueEvents(name: QueueName) {
  const redis = await getRedisState();

  if (!redis.enabled) {
    return null;
  }

  return new QueueEvents(name, {
    connection: redis.connection
  });
}

export async function getQueueHealth() {
  const redis = await getRedisHealth();

  if (redis.status !== "ready") {
    return {
      redis: redis.status,
      reason: redis.reason,
      queues: isDevFallbackAllowed() ? "dev-fallback" : "unavailable"
    } as const;
  }

  return {
    redis: "ready" as const,
    reason: redis.reason,
    queues: "bullmq"
  };
}
