import { MessageDirection, QueueStatus } from "@prisma/client";

import { processOutgoingMessageJob } from "@/lib/message-pipeline";
import { createQueueWorker, QUEUE_NAMES } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

async function reportHeartbeat(status: string, note?: string) {
  const mandate = await prisma.mandate.findFirst({
    select: {
      id: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  await prisma.workerHeartbeat.upsert({
    where: {
      workerName: "outgoing"
    },
    update: {
      mandateId: mandate?.id ?? null,
      status,
      note: note ?? null,
      lastSeenAt: new Date()
    },
    create: {
      workerName: "outgoing",
      mandateId: mandate?.id ?? null,
      status,
      note: note ?? null,
      lastSeenAt: new Date()
    }
  });
}

async function processDatabaseFallbackQueue() {
  const queuedRecords = await prisma.messageQueue.findMany({
    where: {
      direction: MessageDirection.OUTBOUND,
      status: QueueStatus.QUEUED,
      scheduledFor: {
        lte: new Date()
      }
    },
    orderBy: {
      scheduledFor: "asc"
    },
    take: 3
  });

  for (const record of queuedRecords) {
    const claimed = await prisma.messageQueue.updateMany({
      where: {
        id: record.id,
        status: QueueStatus.QUEUED
      },
      data: {
        status: QueueStatus.PROCESSING
      }
    });

    if (claimed.count === 0) {
      continue;
    }

    try {
      await processOutgoingMessageJob(record.metadata as never);
      await prisma.messageQueue.updateMany({
        where: {
          id: record.id,
          status: QueueStatus.PROCESSING
        },
        data: {
          status: QueueStatus.SENT,
          processedAt: new Date()
        }
      });
    } catch (error) {
      await prisma.messageQueue.update({
        where: {
          id: record.id
        },
        data: {
          status: QueueStatus.FAILED,
          failedAt: new Date(),
          error: error instanceof Error ? error.message : "Falha no worker local."
        }
      });
    }
  }
}

async function main() {
  await reportHeartbeat("starting", "Inicializando worker outgoing.");
  const worker = await createQueueWorker(QUEUE_NAMES.outgoing, processOutgoingMessageJob);
  if (!worker) {
    console.info("[worker:outgoing] fallback local ativo via PostgreSQL");
    setInterval(() => {
      void reportHeartbeat("fallback", "Fallback local ativo sem Redis.").catch(() => undefined);
      void processDatabaseFallbackQueue().catch((error) => {
        console.error("[worker:outgoing] fallback error", error);
      });
    }, 1000);
    await reportHeartbeat("fallback", "Fallback local ativo sem Redis.");
    await processDatabaseFallbackQueue();
    return;
  }
  console.info("[worker:outgoing] online");
  await reportHeartbeat("online", "Worker BullMQ online.");
  setInterval(() => {
    void reportHeartbeat("online", "Worker BullMQ online.").catch(() => undefined);
  }, 15000);

  worker.on("error", (error) => {
    console.error("[worker:outgoing] error", error);
    void reportHeartbeat("error", error.message).catch(() => undefined);
  });
}

main().catch((error) => {
  console.error("[worker:outgoing] fatal", error);
  process.exit(1);
});
