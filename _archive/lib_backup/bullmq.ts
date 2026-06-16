import IORedis from "ioredis";
import { Queue } from "bullmq";

export const redisConnection = new IORedis(
  process.env.REDIS_URL!,
  {
    maxRetriesPerRequest: null,
  },
);

export const outgoingQueue = new Queue(
  "outgoing",
  {
    connection: redisConnection,
  },
);
