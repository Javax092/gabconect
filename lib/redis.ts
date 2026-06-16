import IORedis from "ioredis";

let redis: IORedis | null = null;

export function getRedisClient() {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL ausente.");
  }

  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  return redis;
}

export type RedisState = {
  enabled: boolean;
  connected: boolean;
  connection?: IORedis;
  latencyMs?: number;
  error?: string;
};

export async function getRedisState(): Promise<RedisState> {
  if (!process.env.REDIS_URL) {
    return {
      enabled: false,
      connected: false,
      error: "REDIS_URL ausente.",
    };
  }

  try {
    const client = getRedisClient();

    const start = Date.now();
    await client.ping();
    const latencyMs = Date.now() - start;

    return {
      enabled: true,
      connected: true,
      connection: client,
      latencyMs,
    };
  } catch (err: unknown) {
    return {
      enabled: true,
      connected: false,
      error: err instanceof Error ? err.message : "unknown error",
    };
  }
}
