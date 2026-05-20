import { processIncomingMessageJob } from "@/lib/message-pipeline";
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
      workerName: "incoming"
    },
    update: {
      mandateId: mandate?.id ?? null,
      status,
      note: note ?? null,
      lastSeenAt: new Date()
    },
    create: {
      workerName: "incoming",
      mandateId: mandate?.id ?? null,
      status,
      note: note ?? null,
      lastSeenAt: new Date()
    }
  });
}

async function main() {
  await reportHeartbeat("starting", "Inicializando worker incoming.");
  const worker = await createQueueWorker(QUEUE_NAMES.incoming, processIncomingMessageJob);
  if (!worker) {
    console.info("[worker:incoming] fallback local ativo");
    await reportHeartbeat("fallback", "Fallback local ativo sem Redis.");
    return;
  }
  console.info("[worker:incoming] online");
  await reportHeartbeat("online", "Worker BullMQ online.");
  setInterval(() => {
    void reportHeartbeat("online", "Worker BullMQ online.").catch(() => undefined);
  }, 15000);

  worker.on("error", (error) => {
    console.error("[worker:incoming] error", error);
    void reportHeartbeat("error", error.message).catch(() => undefined);
  });
}

main().catch((error) => {
  console.error("[worker:incoming] fatal", error);
  process.exit(1);
});
