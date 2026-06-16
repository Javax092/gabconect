import { ApiRouteError } from "@/lib/api";
import { getRedisState } from "@/lib/redis";

type RedisRateLimitInput = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export async function assertRedisRateLimit(input: RedisRateLimitInput) {
  const redis = await getRedisState();

  if (!redis.enabled || !redis.connected || !redis.connection) {
    throw new ApiRouteError(503, "Redis indisponível para controle de envio.", "REDIS_RATE_LIMIT_UNAVAILABLE");
  }

  const count = await redis.connection.incr(input.key);

  if (count === 1) {
    await redis.connection.expire(input.key, input.windowSeconds);
  }

  if (count > input.limit) {
    const ttl = await redis.connection.ttl(input.key);
    throw new ApiRouteError(429, "Limite operacional de envio excedido.", "SEND_RATE_LIMITED", {
      limit: input.limit,
      retryAfterSeconds: ttl > 0 ? ttl : input.windowSeconds
    });
  }

  return {
    count,
    remaining: Math.max(0, input.limit - count)
  };
}
