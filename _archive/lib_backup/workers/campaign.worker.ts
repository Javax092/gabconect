// lib/workers/campaign.worker.ts

import "dotenv/config";

import { Worker, QueueEvents, Job } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error(
    "REDIS_URL não definida. Adicione REDIS_URL no arquivo .env",
  );
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

connection.on("connect", () => {
  console.log("[REDIS] conectado");
});

connection.on("error", (error) => {
  console.error("[REDIS] erro:", error);
});

const queueEvents = new QueueEvents("outgoing", {
  connection,
});

queueEvents.on("completed", ({ jobId }) => {
  console.log(`[QUEUE] Job ${jobId} completed`);
});

queueEvents.on("failed", ({ jobId, failedReason }) => {
  console.error(
    `[QUEUE] Job ${jobId} failed: ${failedReason}`,
  );
});

queueEvents.on("error", (error) => {
  console.error("[QUEUE EVENTS ERROR]", error);
});

export const campaignWorker = new Worker(
  "outgoing",
  async (job: Job) => {
    console.log(`[WORKER] Processando job ${job.id}`);

    try {
      const data = job.data;

      console.log("[WORKER] Dados recebidos:");
      console.dir(data, { depth: null });

      /*
      TODO:
      Integrar com WhatsApp API aqui.

      Exemplo:

      await sendWhatsAppMessage(data);
      */

      await new Promise((resolve) =>
        setTimeout(resolve, 1000),
      );

      console.log(`[WORKER] Job ${job.id} concluído`);

      return {
        success: true,
        processedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        `[WORKER ERROR] Job ${job.id}:`,
        error,
      );

      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 1000 },
  },
);

campaignWorker.on("ready", () => {
  console.log("[WORKER] pronto");
});

campaignWorker.on("active", (job) => {
  console.log(`[WORKER] Job ${job.id} iniciado`);
});

campaignWorker.on("completed", (job) => {
  console.log(`[WORKER] Job ${job.id} finalizado`);
});

campaignWorker.on("failed", (job, err) => {
  console.error(
    `[WORKER] Job ${job?.id} falhou:`,
    err.message,
  );
});

campaignWorker.on("error", (err) => {
  console.error("[WORKER ERROR]", err);
});

async function shutdown(signal: string) {
  console.log(`[WORKER] Recebido ${signal}. Encerrando...`);

  try {
    await campaignWorker.close();
    await queueEvents.close();
    await connection.quit();

    console.log("[WORKER] Encerrado com sucesso");

    process.exit(0);
  } catch (error) {
    console.error(
      "[WORKER] Erro ao encerrar:",
      error,
    );

    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

console.log("[WORKER] campaign.worker iniciado");
