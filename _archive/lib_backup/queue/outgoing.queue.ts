import { Queue, JobsOptions } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL não definida");
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

export const outgoingQueue = new Queue("outgoing", {
  connection,
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
 * ÚNICO método oficial de enqueue
 */
export async function enqueueOutgoingJob(payload: any, options?: JobsOptions) {
  const job = await outgoingQueue.add("campaign", payload, options);

  console.log("[QUEUE] job criado:", {
    id: job.id,
    name: job.name,
  });

  return job;
}
