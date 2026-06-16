import IORedis from "ioredis";

let redis: IORedis | null = null;

export function getRedisClient() {
  if (!redis) {
    redis = new IORedis(process.env.REDIS_URL!, {
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
  latencyMs?: number;
  error?: string;
};

export async function getRedisState(): Promise<RedisState> {
  try {
    const client = getRedisClient();

    const start = Date.now();
    await client.ping();
    const latencyMs = Date.now() - start;

    return {
      enabled: true,
      connected: true,
      latencyMs,
    };
  } catch (err: any) {
    return {
      enabled: true,
      connected: false,
      error: err?.message ?? "unknown error",
    };
  }
}
