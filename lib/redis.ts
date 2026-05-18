import IORedis from "ioredis";

type RedisState =
  | { enabled: true; connection: IORedis }
  | { enabled: false; reason: string };

let redisConnection: IORedis | null = null;

function createRedisConnection() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    return null;
  }

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      return Math.min(times * 200, 5_000);
    }
  });
}

export async function getRedisState(): Promise<RedisState> {
  if (!process.env.REDIS_URL) {
    return {
      enabled: false,
      reason: "REDIS_URL ausente. Em produção, Redis é obrigatório."
    };
  }

  if (!redisConnection) {
    redisConnection = createRedisConnection();
  }

  if (!redisConnection) {
    return {
      enabled: false,
      reason: "Falha ao inicializar conexão Redis."
    };
  }

  if (redisConnection.status === "ready") {
    return {
      enabled: true,
      connection: redisConnection
    };
  }

  try {
    await redisConnection.connect();
  } catch (error) {
    return {
      enabled: false,
      reason: error instanceof Error ? error.message : "Falha desconhecida na conexão Redis."
    };
  }

  return {
    enabled: true,
    connection: redisConnection
  };
}

export async function getRedisHealth() {
  const state = await getRedisState();

  if (!state.enabled) {
    return {
      status: "degraded" as const,
      reason: state.reason
    };
  }

  try {
    await state.connection.ping();
    return {
      status: "ready" as const,
      reason: "Redis conectado."
    };
  } catch (error) {
    return {
      status: "degraded" as const,
      reason: error instanceof Error ? error.message : "Falha no ping Redis."
    };
  }
}
